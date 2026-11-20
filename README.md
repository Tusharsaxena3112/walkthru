# Walkthru

Describe your product to Claude Code and get a finished, narrated demo video. It works for websites and web apps, CLI tools, AI agents, codebase walkthroughs and tutorials. Manual demos take hours; this takes minutes of your time: you describe, approve a storyboard once, and review the result.

## Install (Claude Code)
```
/plugin marketplace add <owner>/walkthru
/plugin install walkthru
```
Then in your project, tell Claude: *"Make a demo video of this app, for new customers, about 4 minutes"* (or run `/walkthru`). Claude installs what it needs on first run (Chromium, ffmpeg, a free offline voice; no sudo, no accounts), explores your product, drafts a storyboard for your approval, rehearses, records, narrates and checks the video.

## What you get (`demo/out/`)
`walkthru.mp4` (1080p, chapters embedded), `captions.srt`, `thumbnail.png`, `preview.gif`, and `report.md` listing quality checks, auto-corrected steps and anything the recording left behind in real systems.

## How it feels human
Eased cursor paths, keystroke-by-keystroke typing with natural rhythm, hover-before-click, smooth scrolling, highlight rings, idle waits sped up. Narration is generated first and each sentence is bound to the step it describes, so the voice never runs ahead of the screen. Steps that cannot find their target are healed to the closest label on screen and reported.

## Modes
| Mode | For |
|---|---|
| `web` | websites, dashboards, SaaS (Playwright) |
| `terminal` | CLI tools, TUIs, AI agents (a real shell in a recorded terminal) |
| `code` | codebase walkthroughs (syntax-highlighted files, line-range focus, file tree) |
| mixed | any scene can set its own `mode` |
| desktop (Linux/X11) | native apps via `screen-record` / `screen-cut` (older workflow) |

## Voices
`piper` (default, free, offline), `elevenlabs` (put `ELEVEN_LABS_API_KEY` and `VOICE_ID` in `.env.demo`; `walkthru voice --dry` shows the character cost), `tone` (silent beeps, for tests).

## CLI
`walkthru init | doctor [--fix] | plan | rehearse | voice | record [scenes] | build | make | verify`. `make` does everything; only changed scenes are re-recorded and only new sentences are synthesised. Storyboard format: `templates/demo.yaml`. Skills: `/walkthru` (headline), `/record-demo`, `/sync-narration`, `/verify-video` (desktop workflow).

## Development
`pnpm typecheck | lint | test | build`. `pnpm build` bundles `dist/walkthru.mjs`, which is committed so the plugin works without an install step. Layers: `domain/` (pure: sync, ramp, motion, secrets, heal), `studio/` (recorders, voice, assembly, QA), `cli/`.

## Limits
Third-party iframes (e-sign, payments) hide the injected cursor and ignore dark mode. Desktop capture is Linux/X11 only for now. Terminal mode needs a prebuilt node-pty for your OS (installed automatically).
