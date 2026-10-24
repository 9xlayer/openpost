# OpenPost launch film

A 48-second, 1920x1080, 60 fps launch film built from code. It uses real OpenPost UI captures, brand marks,
integration icons and feature artwork. Its sound is made in code with [earshot](https://github.com/Leonxlnx/earshot).

```sh
devenv shell -- bun run capture:launch-film
```

The command writes `tmp/launch-film/openpost-launch.mp4`. It runs four steps, and each step can be rerun alone:

| Step               | Command                                                                                          | Output in `tmp/launch-film/`                       |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Capture the UI     | `tests/app/launch-film.spec.ts`, against the isolated browser-test server                        | `capture/` 2x screenshots, one per typed character |
| Render the picture | `bun apps/marketing/launch-film/render.mjs`                                                      | `picture.mp4`, `cues.json`                         |
| Score the music    | `uv run apps/marketing/launch-film/music.py tmp/launch-film/cues.json tmp/launch-film/music.wav` | `music.wav`                                        |
| Mix the sound      | `uv run apps/marketing/launch-film/mix.py tmp/launch-film`                                       | `kit/`, `soundtrack.wav`, `mix-report.json`        |

Render stills while editing: `bun apps/marketing/launch-film/render.mjs --stills 4.2,11,28.6`.

## How it fits together

- `film.js` owns the timeline. Every frame is a pure function of time. The renderer calls `window.film.seek(t)`
  and captures the stage, so playback speed never depends on the machine.
- Scene boundaries sit on bar lines at 120 BPM. `film.js` also emits the sound cues (`cues.json`), so picture and
  sound share one source of truth.
- `script.json` holds the post that the capture types and the film plays back.
- `music.py` builds the bed from the film's sections: an A minor progression, earshot's physically modelled mallets,
  oscillator pads and bass, and synthesized drums. It steps down 12 dB before the two big hits.
- `mix.py` renders `kit.json` (earshot's `launch` preset, with the hits tuned to A) and places every take by its
  measured onset or peak. It sets each effect's level against the music bed and masters the mix to -14 LUFS with
  true peak at or below -1.2 dBTP.

## Provenance

- UI comes from the real app with the shared product capture fixtures. Accounts, schedule responses, analytics and
  inbox items are sample data, and the film labels them as such. The editor stills are the maintained captures in
  `assets/screenshots/`.
- Integration icons are the README's `assets/postiz-socials/` set, limited to the 16 integrations the README lists.
- The music and effects contain no recordings. earshot's bank sounds are made in code, and its kit preset notes
  where a sound was fitted from a CC0 recording.

## Checking the sound

You can't judge the soundtrack by reading code. Measure it with earshot after a change:

```sh
E='uvx --python 3.12 --from earshot@git+https://github.com/Leonxlnx/earshot@591fa3e028032e6dce56620a20e932e35667e8d8 earshot'
$E critique tmp/launch-film/openpost-launch.mp4
$E sheet tmp/launch-film/openpost-launch.mp4 -o tmp/launch-film/sheet.png --cues tmp/launch-film/cues.json
```

On 24 October 2026 the film scored launch-grade: 22 of 23 metrics fell inside the range of earshot's seven
reference launch films, and every cue landed with a sound. The only open item is realness, rated uncertain
(p_real 0.57). The music stem alone reads as code-synthesized (0.16). To get a produced sound, replace `music.wav`
with a licensed 120 BPM track that keeps the bar structure, then run `mix.py` again.
