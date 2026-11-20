# Storyboard format

YAML, validated on load. One file drives recording, the narration script, the SRT and the narration-length check in `verify`.

| Field | Meaning |
|-------|---------|
| `title` | Name used in `narration.md`. |
| `size`, `fps` | Capture size (default `1920x1080`) and frame rate (default 30). |
| `terminal` | Default tmux session for `type` steps. |
| `tail` | Seconds recorded after the last step (default 3). |
| `clips[].id` | Letters, digits, `_`, `-`. Becomes the clip file name; must be unique. |
| `clips[].narration` | Voice-over text. Estimated at 2.4 words per second. |
| `clips[].steps[]` | `{do: window, match}` focuses and maximises the first window whose title contains `match`; `{do: type, text, session?}` types into tmux at readable speed then presses Enter; `{do: wait, seconds}`. |

A mark is written when each clip's first step is issued; `cut` then snaps it to the real scene change on screen.
