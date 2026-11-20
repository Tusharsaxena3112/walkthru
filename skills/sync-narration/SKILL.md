---
name: sync-narration
description: Tighten a demo video that already has a voice-over so the silent gaps between narration lines are sped up and the video matches the narration. Use when a video has audio but feels choppy or has long pauses.
---

# Sync narration

1. `walkthru check-video <video>` to see the starting point (duration, audio present, long silences). If there is no audio track, stop: the voice-over must be added first.
2. `walkthru tighten <video> <output>`. Defaults: silences of 3 s or more are sped up 4x, keeping 1.2 s after speech and 0.8 s before the next line at normal speed. Tune with `--speed`, `--min-gap`, `--keep`, `--lead`.
3. Run `walkthru check-video <output>` again and report old and new length. Remaining silences over the limit are expected where a gap was long (the kept 2 s plus the sped part); raise `--speed` if the user wants them shorter.
4. Never overwrite the user's input file; always write a new output file.
5. Remind the user that any change in length shifts timestamps in a narration script or SRT made for the original.

Narration is never sped up or cut: only silent stretches change. If the voice itself sounds choppy (line-by-line text-to-speech), that is a property of the audio; suggest regenerating it as one continuous read.
