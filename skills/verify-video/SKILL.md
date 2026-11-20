---
name: verify-video
description: Quickly check a finished demo video for problems (no audio, long silences, voice-over not matching the storyboard, sensitive text on screen) and blur regions if needed.
---

# Verify a video

1. `walkthru check-video <video> [--storyboard <file>] [--max-silence 4] [--sensitive <text...>]`.
   - `--sensitive` takes literal strings that must not appear on screen (hostnames, tokens, real emails). It needs `tesseract`; if it is absent the report says the check was skipped, so say so too. Do not claim the video is clear of sensitive text unless the OCR check ran, and note that OCR samples frames every 5 s and can miss text.
2. Summarise the findings by severity. `ERROR` findings exit non-zero.
3. For on-screen text the user wants hidden, ask them (or find from frames) for the screen region and run `walkthru redact <in> <out> --box x,y,w,h[,from,to]` (repeatable). Time ranges keep the blur to the seconds it is needed.
4. After redacting, verify again and tell the user to watch the blurred spots once.
