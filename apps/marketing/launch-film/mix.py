# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["earshot @ git+https://github.com/Leonxlnx/earshot@591fa3e028032e6dce56620a20e932e35667e8d8"]
# ///
"""Mixes the film's sound effects onto the music bed and masters the soundtrack.

    uv run apps/marketing/launch-film/mix.py tmp/launch-film

Reads cues.json (render.mjs) and music.wav (music.py) from the work folder, renders the earshot kit in kit.json
into <work>/kit, places every cue's take with earshot's measured sync point and bed-relative gain, and writes
soundtrack.wav plus mix-report.json (each cue's take, start, bed level and gain).
"""
import json
import os
import sys

import numpy as np
import pyloudnorm
import soundfile
from earshot.forge import kit
from scipy import signal

SR = 48000
TARGET_LUFS = -14.0
CEILING_DBTP = -1.2


def stereo(y):
    y = np.asarray(y, np.float64)
    return np.repeat(y[:, None], 2, axis=1) if y.ndim == 1 else y


def limit(x, ceiling, lookahead=0.005, release=0.08):
    """a look-ahead peak limiter on the sample peaks of both channels"""
    peak = np.max(np.abs(x), axis=1)
    window = int(lookahead * SR)
    held = np.array([peak[max(0, i - window) : i + window + 1].max() for i in range(0, len(peak), 64)])
    held = np.repeat(held, 64)[: len(peak)]
    target = np.minimum(1.0, ceiling / np.maximum(held, 1e-9))
    coefficient = np.exp(-1.0 / (release * SR / 64))
    gain = np.empty_like(target[::64])
    level = 1.0
    for i, value in enumerate(target[::64]):
        level = value if value < level else value + (level - value) * coefficient
        gain[i] = level
    gain = np.interp(np.arange(len(peak)), np.arange(0, len(peak), 64), gain)
    return x * gain[:, None]


def true_peak_db(x):
    upsampled = signal.resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.max(np.abs(upsampled)) + 1e-12)


def main(work):
    here = os.path.dirname(os.path.abspath(__file__))
    film = json.load(open(os.path.join(work, "cues.json")))
    music, sr = soundfile.read(os.path.join(work, "music.wav"), always_2d=True)
    assert sr == SR, "music.wav must be 48 kHz"
    lock = kit.render(os.path.join(here, "kit.json"), os.path.join(work, "kit"))
    print(lock["summary"])
    total = int((film["duration"] + 0.05) * SR)
    mix = np.zeros((total, 2))
    mix[: min(total, len(music))] = music[:total]

    # Runs keep each role's minimum spacing (earshot's measured gap for keys, pops, ticks).
    by_role = {}
    for cue in film["cues"]:
        by_role.setdefault(cue["role"], []).append(cue)
    placed, report, counters = [], [], {}
    for role_name, cues in by_role.items():
        role = lock["roles"].get(role_name)
        if not role:
            continue
        times = kit.space_run([c["t"] for c in cues], role.get("min_gap_ms"))
        for cue, t in zip(cues, times):
            takes = role["takes"]
            if cue.get("pitch"):
                takes = [take for take in takes if take.get("pitch") == cue["pitch"]] or takes
            index = counters.get(role_name, 0)
            counters[role_name] = index + 1
            placed.append((t, role_name, role, takes[index % len(takes)]))

    for t, role_name, role, take in sorted(placed, key=lambda item: item[0]):
        y, take_sr = soundfile.read(os.path.join(work, "kit", take["file"]), always_2d=True)
        y = stereo(y[:, 0] if y.shape[1] == 1 else y)
        bed = kit.bed_level(music, t) if t >= 0.06 else None
        gain = kit.gain_db(take, role, bed)
        start = kit.place(take, role, t)
        offset = int(round(start * SR))
        if offset < 0:
            y, offset = y[-offset:], 0
        end = min(total, offset + len(y))
        mix[offset:end] += y[: end - offset] * 10 ** (gain / 20)
        report.append({"t": t, "role": role_name, "file": take["file"], "start": start, "bed_lufs": bed, "gain_db": gain})

    meter = pyloudnorm.Meter(SR)
    mix *= 10 ** ((TARGET_LUFS - meter.integrated_loudness(mix)) / 20)
    for _ in range(4):
        mix = limit(mix, 10 ** ((CEILING_DBTP - 0.3) / 20))
        peak = true_peak_db(mix)
        if peak <= CEILING_DBTP:
            break
        mix *= 10 ** ((CEILING_DBTP - peak) / 20)
    lufs = meter.integrated_loudness(mix)
    soundfile.write(os.path.join(work, "soundtrack.wav"), mix.astype(np.float32), SR, subtype="PCM_24")
    json.dump({"lufs": round(lufs, 2), "true_peak_dbtp": round(true_peak_db(mix), 2), "cues": report},
              open(os.path.join(work, "mix-report.json"), "w"), indent=1)
    print(f"wrote soundtrack.wav: {len(report)} effects, {lufs:.1f} LUFS, true peak {true_peak_db(mix):.1f} dBTP")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tmp/launch-film")
