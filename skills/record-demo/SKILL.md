---
name: record-demo
description: Record a desktop (X11) demo from a storyboard by driving real windows and a tmux session while capturing the screen. Use only for desktop or native apps that a browser cannot show; for websites, terminals and code use the walkthru skill.
---

# Record a desktop demo (Linux/X11)

Uses `walkthru screen-record` and `walkthru screen-cut` (see the walkthru skill for how to call the CLI). Needs `wmctrl`, `xdotool`, `tmux`; install them yourself with the system package manager after telling the user (`sudo apt install wmctrl xdotool tmux`).

1. Draft the storyboard (YAML, `docs/storyboard.md`): one clip per scene with `narration` and steps (`window`, `type`, `wait`). Confirm with the user.
2. Warn the user to close notifications and personal windows first; the recording shows the real screen. A retake needs a fresh state.
3. `walkthru screen-record <storyboard> --out out`; fix the cause of any failed step and record again.
4. `walkthru screen-cut out/raw.mp4 --marks out/marks.json --storyboard <storyboard> --out out` writes clips, `master.mp4`, `narration.md`, `script.srt`.
5. Report clip durations; flag narration longer than its clip. Voice and sync: see the sync-narration skill.

Never type secrets in `type` steps and never read `.env` files.
