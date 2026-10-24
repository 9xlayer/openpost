# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["earshot @ git+https://github.com/Leonxlnx/earshot@591fa3e028032e6dce56620a20e932e35667e8d8"]
# ///
"""The launch film's music bed, synthesized in code: 120 BPM, A minor, cut to the film's bar lines.

    uv run apps/marketing/launch-film/music.py tmp/launch-film/cues.json tmp/launch-film/music.wav

Sections come from the film's timeline (cues.json, written by render.mjs), so a retimed film keeps its score in
step. No samples or recordings: the mallets are earshot's physically modelled bank sounds, and every other voice is an
oscillator, filtered noise or a computed reverb.
"""
import json
import sys

import numpy as np
import pyloudnorm
import soundfile
from earshot.forge import bank
from scipy import signal

SR = 48000
rng = np.random.default_rng(7)


def midi_hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def env_adsr(n, attack, decay, sustain, release, hold):
    a, d, r = int(attack * SR), int(decay * SR), int(release * SR)
    h = max(0, int(hold * SR) - a - d)
    curve = np.concatenate([
        np.linspace(0, 1, max(a, 1)),
        np.linspace(1, sustain, max(d, 1)),
        np.full(h, sustain),
        np.linspace(sustain, 0, max(r, 1)),
    ])
    out = np.zeros(n)
    out[: min(n, len(curve))] = curve[:n]
    return out


def lowpass(x, cutoff, q=0.707):
    sos = signal.butter(2, min(cutoff, SR * 0.45), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def highpass(x, cutoff):
    sos = signal.butter(2, cutoff, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x, lo, hi):
    sos = signal.butter(2, [lo, hi], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def swept_lowpass(x, cutoffs, block=512):
    """a 2-pole low-pass whose cutoff follows `cutoffs` (Hz per sample), block by block with carried state"""
    out = np.zeros_like(x)
    zi = None
    for start in range(0, len(x), block):
        sos = signal.butter(2, min(float(cutoffs[start]), SR * 0.45), "low", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:])
        out[start:start + block], zi = signal.sosfilt(sos, x[start:start + block], axis=0, zi=zi)
    return out


def saw(freq, n, phase=0.0):
    t = np.arange(n) / SR
    return signal.sawtooth(2 * np.pi * freq * t + phase)


def stereo(mono, pan=0.0):
    left = np.cos((pan + 1) * np.pi / 4)
    right = np.sin((pan + 1) * np.pi / 4)
    return np.stack([mono * left, mono * right], axis=1) * np.sqrt(2)


def add(bus, x, at):
    start = int(round(at * SR))
    if start >= len(bus):
        return
    end = min(len(bus), start + len(x))
    bus[start:end] += x[: end - start]


def reverb_ir(seconds=2.2, tone=5000):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    ir = lowpass(noise, tone) * np.exp(-t / (seconds / 6.9))[:, None]
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt(np.sum(ir**2))


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)


# --- voices -------------------------------------------------------------------------------------------------------
def kick(gain=1.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    freq = 46 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.32)
    click = highpass(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.25
    return stereo(np.tanh(1.6 * (body + click)) * gain)


def clap(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    noise = bandpass(rng.standard_normal(n), 900, 4200)
    shape = sum(np.exp(-np.clip(t - d, 0, None) / 0.008) * (t >= d) for d in (0, 0.011, 0.023))
    shape = shape + 0.7 * np.exp(-np.clip(t - 0.03, 0, None) / 0.13) * (t >= 0.03)
    return stereo(noise * shape * 0.5 * gain)


def hat(open_=False, gain=1.0, pan=0.0):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 7500)
    return stereo(noise * np.exp(-t / (0.11 if open_ else 0.018)) * 0.2 * gain, pan)


def pluck(note, gain=1.0, length=0.45, bright=4200):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi_hz(note)
    tone = 0.6 * saw(f, n) + 0.4 * signal.square(2 * np.pi * f * 1.003 * t, 0.3)
    tone = lowpass(tone * np.exp(-t / 0.16), bright)
    return tone * np.exp(-t / 0.22) * 0.32 * gain


NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_mallets = {}


def mallet(note, sound="mallet/marimba", gain=1.0):
    """an earshot bank mallet tuned to a MIDI note (cached; mono)"""
    key = (sound, note)
    if key not in _mallets:
        y, _ = bank.render(sound, pitch=f"{NAMES[note % 12]}{note // 12 - 1}", peak_db=-6.0, checks=False)
        y = np.asarray(y, np.float64)
        _mallets[key] = y.mean(axis=1) if y.ndim == 2 else y
    return _mallets[key] * gain


def pad_chord(notes, seconds, gain=1.0):
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    for i, note in enumerate(notes):
        for detune, pan in ((-0.09, -0.6), (0.0, 0.0), (0.08, 0.6)):
            f = midi_hz(note + detune)
            out += stereo(saw(f, n, phase=rng.uniform(0, 6.28)), pan) * 0.06
    shape = env_adsr(n, 0.35, 0.5, 0.85, 0.5, seconds)
    return out * shape[:, None] * gain


def bass_note(note, seconds, gain=1.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = midi_hz(note)
    tone = np.sin(2 * np.pi * f * t) + 0.3 * np.tanh(3 * np.sin(2 * np.pi * f * t))
    return stereo(lowpass(tone, 400) * env_adsr(n, 0.005, 0.1, 0.8, 0.05, seconds) * 0.42 * gain)


# --- score --------------------------------------------------------------------------------------------------------
def build(film):
    bpm = film["bpm"]
    beat = 60.0 / bpm
    bar = 4 * beat
    s = film["sections"]
    duration = film["duration"]
    total = int((duration + 0.05) * SR)
    drums = np.zeros((total, 2))
    pads = np.zeros((total, 2))
    bass = np.zeros((total, 2))
    arp = np.zeros((total, 2))
    bells = np.zeros((total, 2))

    progression = [  # Am7, Fmaj7, C/G, G6: one chord per bar
        ([57, 60, 64, 67], 33, [69, 72, 76, 79]),
        ([53, 57, 60, 64], 29, [65, 69, 72, 76]),
        ([55, 60, 64, 67], 36, [67, 72, 76, 79]),
        ([55, 59, 62, 64], 31, [67, 71, 74, 76]),
    ]
    finale = ([48, 55, 60, 64, 67, 74], 36, [72, 76, 79, 84])  # Cadd9 on the end card
    drop, end, build_at = s["logo"], s["end"], s["features"]
    bars = int(np.ceil(duration / bar))
    kick_times = []
    for b in range(bars):
        t0 = b * bar
        chord, root, tones = finale if t0 >= end else progression[b % 4]
        hold = min(bar, duration - t0)
        if t0 >= end:
            hold = duration - t0
            if t0 > end:
                continue
        # Pad: always on; opens up over the intro.
        add(pads, pad_chord(chord, hold + 0.4, 0.85 if t0 >= end else 1.0), t0)
        intro = t0 < drop
        # Arp: eighths in the intro and body, sixteenths in the build and on the end card.
        step = beat / 4 if build_at <= t0 < end or t0 >= end else beat / 2
        pattern = [0, 2, 1, 3, 2, 1, 3, 0, 1, 3, 2, 0, 3, 1, 2, 3]
        count = int(round(hold / step))
        for k in range(count):
            at = t0 + k * step
            velocity = (0.75 if k % 2 else 1.0) * (0.7 if intro else 1.0)
            note = tones[pattern[k % len(pattern)]] + (12 if (k // 8) % 2 and step < beat / 2 else 0)
            voice = mallet(note, gain=velocity * 0.55)
            if not intro:
                synth = pluck(note, velocity * 0.45, bright=4600)
                voice = np.pad(voice, (0, max(0, len(synth) - len(voice))))
                voice[: len(synth)] += synth
            add(arp, stereo(voice, 0.6 if k % 2 else -0.6), at)
        if intro:
            for k in range(4):
                if b >= 1:
                    add(drums, hat(gain=0.6, pan=0.3), t0 + k * beat + beat / 2)
            continue
        # Bass: root on the offbeat eighths, a pumping house bass.
        for k in range(int(round(hold / (beat / 2)))):
            if k % 2:
                add(bass, bass_note(root, beat / 2 * 0.9, 0.9), t0 + k * beat / 2)
        # Drums.
        for k in range(int(round(hold / beat))):
            at = t0 + k * beat
            if at >= duration or (t0 >= end and at >= end + 2 * bar):
                break
            add(drums, kick(1.0), at)
            kick_times.append(at)
            if k % 4 in (1, 3) and t0 < end:
                add(drums, clap(0.9), at)
            add(drums, hat(open_=True, gain=0.55, pan=-0.2), at + beat / 2)
            for sub in (0.25, 0.75):
                if t0 < end:
                    add(drums, hat(gain=0.42, pan=0.25), at + beat * sub)
    # Snare roll into the end card.
    roll_start = end - bar
    for k in range(16):
        at = roll_start + k * beat / 4
        if at < end - 0.45:
            add(drums, clap(0.25 + 0.75 * k / 15), at)
    # The end-card motif.
    for k, (note, at) in enumerate([(76, 0.5), (79, 1.0), (81, 1.5), (84, 2.0), (79, 3.0), (88, 3.5)]):
        add(bells, stereo(mallet(note, "mallet/celesta", 0.8), (-0.4, 0.4)[k % 2]), end + at)

    t = np.arange(total) / SR
    # Intro filter: the pad and arp open from 350 Hz to full over the first two bars.
    intro_cut = np.where(t < drop, 350 + (6000 - 350) * (t / drop) ** 2.2, 8000)
    # Build: the arp closes and reopens across the bar before the end card.
    build_cut = np.where((t >= build_at) & (t < end), 900 + 7000 * ((t - build_at) / (end - build_at)) ** 2, 9000)
    pads = swept_lowpass(pads, np.minimum(intro_cut, 3800))
    arp = swept_lowpass(arp, np.minimum(intro_cut, build_cut))

    # Sidechain pump from the kick on the pad, bass and arp.
    pump = np.ones(total)
    for at in kick_times:
        i = int(at * SR)
        span = min(total - i, int(0.3 * SR))
        pump[i : i + span] = np.minimum(pump[i : i + span], 1 - 0.55 * np.exp(-np.arange(span) / SR / 0.09))

    # Arp echo: a dotted-eighth ping-pong.
    delay = int(0.75 * beat * SR)
    echo = np.zeros_like(arp)
    for tap in range(1, 4):
        shifted = np.zeros_like(arp)
        shifted[delay * tap :] = arp[: total - delay * tap][:, ::-1 if tap % 2 else 1]
        echo += shifted * 0.38**tap
    ir = reverb_ir()
    # Keep one element in charge of the sub: the kick and bass sit under 120 Hz, the rest is high-passed.
    pads = highpass(pads, 140)
    mix = (
        drums * 0.7
        + bass * pump[:, None] * 0.62
        + pads * pump[:, None] * 1.6
        + (arp + highpass(echo, 300)) * pump[:, None] * 1.15
        + bells * 1.2
    )
    mix += convolve(highpass(pads * 0.6 + arp * 0.7 + drums * 0.08 + bells * 0.8, 250), ir) * 0.85

    # Stop-downs: the music steps down 12 dB before the two big hits and comes back on them.
    automation = np.ones(total)
    for hit in (drop, end):
        down = (t >= hit - 0.42) & (t < hit)
        automation[down] = 10 ** (-12 / 20)
        fall = (t >= hit - 0.47) & (t < hit - 0.42)
        automation[fall] = np.linspace(1, 10 ** (-12 / 20), fall.sum())
    # Short fade at the very end.
    automation *= np.clip((duration - t) / 0.4, 0, 1)
    mix *= automation[:, None]
    return np.tanh(mix * 0.9) / 0.9


def main(cues_path, out_path):
    film = json.load(open(cues_path))
    music = build(film)
    meter = pyloudnorm.Meter(SR)
    loudness = meter.integrated_loudness(music)
    music = pyloudnorm.normalize.loudness(music, loudness, -17.0)
    peak = np.max(np.abs(music))
    if peak > 0.89:
        music *= 0.89 / peak
    soundfile.write(out_path, music.astype(np.float32), SR, subtype="PCM_24")
    print(f"wrote {out_path}: {len(music) / SR:.2f} s, {meter.integrated_loudness(music):.1f} LUFS")


if __name__ == "__main__":
    main(*sys.argv[1:3])
