# Troubleshooting and lessons

- **ffmpeg seems to eat input or stops a loop early**: every ffmpeg call uses `-nostdin` and a closed stdin; keep it that way if you add calls.
- **Killed with exit 137 on a long 1080p video**: that is out of memory from one giant filter graph. `tighten` encodes each segment separately and joins them; do the same for any new long operation.
- **Clip boundaries are a second or two late**: expected. Tool-call and window-manager latency means marks lead the visible switch; `cut` snaps to scene changes. Lower `--scene` if a subtle switch is missed, raise it if animations cause false cuts.
- **A `window` step fails**: `wmctrl -a` matches the title substring; check `wmctrl -l`. Windows on another workspace may not be found.
- **Notifications and personal windows appear in the capture**: it records the real screen. Turn on do-not-disturb first and verify with `verify --sensitive`.
- **Narration is longer than its clip**: `cut` flags it in `narration.md`. Shorten the text or add a `wait` step; the tool does not freeze frames.
- **The voice-over sounds line by line**: text-to-speech generated per line has gaps. `tighten` removes the dead video time, but regenerating the voice-over as one read fixes the audio itself.
- **Limits**: Linux/X11 only; recording is of the full screen; `verify --sensitive` is an OCR sample every few seconds, not a guarantee.
