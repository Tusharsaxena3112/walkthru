---
name: walkthru
description: Make a finished, narrated demo video of any product: a website or web app, a CLI or terminal app, an AI agent, a codebase walkthrough, or a tutorial. Use when the user asks to record, create, redo or voice a demo, walkthrough, tutorial or product tour video. Does all setup itself.
---

# Walkthru: from "here is my product" to a narrated video

CLI: `node "${CLAUDE_PLUGIN_ROOT}/dist/walkthru.mjs" <command>` (call it `walkthru` below), run from the user's project root. You do all setup yourself; the user never installs anything. Their only jobs are: describe the product, approve the storyboard once, review the video.

## 0. Ask only what you cannot discover (max 4 questions, skip any you can infer)
Audience and goal; target length (default 3 to 5 minutes); voice (default free local `piper`; `elevenlabs` only if they already have a key); anything off-limits (billing, real customer data, a section to skip). Never ask about tools, formats or setup.

## 1. Discover (read, do not guess)
- **Website / web app**: use the live URL; read routes and source for real labels, or probe with Playwright. Credentials go in `.env.demo` (git-ignored; tell the user to fill it themselves, never read or print it).
- **CLI / terminal app / AI agent**: read README, `--help`, example commands; pick 4 to 8 commands that tell the story; check they run safely in a scratch directory.
- **Codebase walkthrough**: map the repo, choose 5 to 8 files that explain the architecture; note exact line ranges.
- **Tutorial / script from the user**: keep their wording, split into scenes, choose the surface per scene.
- Prefer the live product over transcripts or docs where they disagree.

## 2. Draft `demo/demo.yaml` and show it once
Run `walkthru init` if the file is missing. Write the storyboard: one scene per feature, each with `say` sentences (one idea per sentence, plain friendly words, about 150 words per minute of video) interleaved with steps. Run `walkthru plan` and show the user: scenes, narration length, voice cost. **Get approval before recording.**

Steps per mode (the same file can mix modes per scene with `mode:`):
- web: `go`, `click: "label"`, `type: "text"` + `into: "field label"`, `press`, `select: "option"` + `in:`, `scroll: 600`, `hover`, `wait: 2` or `wait: "text to appear"`, `highlight: "text"`, `blur: "selector or text"`, `note: "what this created"`
- terminal: `run: "cmd"` (+ `until: "text"`, `timeout`, `settle`), `type`, `key: ctrl+c`, `clear`, `wait`
- code: `open: path` (+ `lines: "10-24"`), `lines`, `highlight: "text"`, `tree: dir`, `wait`
- all: `say: "sentence"` (the voice starts then; the action that follows waits for it, so speech never leads the screen), `setup:` list for logins and loading that are trimmed from the video, `idle: true` on a step that waits on something slow (it is sped up).
Put `${NAME}` for values from `.env.demo`. Use realistic names and data, never "test123". Add every record you create in a real system as a `note:` step so it appears in the cleanup list.

## 3. Make it
1. `walkthru rehearse`: runs every step fast with no recording. Fix failures (wrong label, missing data, login needed) and rerun until clean. Steps that were auto-corrected are listed; confirm they hit the right element.
2. `walkthru make`: installs missing dependencies on first run (Chromium, ffmpeg, Piper voice), rehearses, generates voice, records, assembles, checks quality and writes `demo/out/report.md`. Only changed scenes are re-recorded; voice is cached per sentence.
3. Read `report.md`. Fix every ERROR (blank frames, clipping, secrets or error text seen on screen) and rerun `walkthru make`; mention warnings. Look at a few frames from `demo/out/walkthru.mp4` (ffmpeg `-ss T -frames:v 1`) before declaring it done.

Outputs in `demo/out/`: `walkthru.mp4` (chapters embedded), `captions.srt`, `thumbnail.png`, `preview.gif`, `report.md`.

## 4. Iterate cheaply
- Change wording: edit the `say` text, `walkthru make` (only new sentences are synthesised).
- Fix one scene: edit its steps, `walkthru record <id>` then `walkthru build`.
- Voice too fast or slow: `voice.tempo` (0.85 to 1.0). Better voice: `voice.provider: elevenlabs` with `ELEVEN_LABS_API_KEY` and `VOICE_ID` in `.env.demo`; run `walkthru voice --dry` first and tell the user the character cost. Free ElevenLabs accounts cannot use Voice Library voices (HTTP 402): use a default voice such as Adam `pNInz6obpgDQGcFmaJgB`.

## Rules
- Never read or print `.env.demo`; never put credentials in `say`, `type` or notes. Secrets listed there are scanned for on screen automatically.
- Record against real systems only with the user's say-so; prefer a throwaway account or staging. List what was created (report.md "Left behind") and offer to clean up.
- If a flow sends email, use a disposable inbox (Guerrilla Mail API) and show the email in a rendered page rather than automating a webmail UI.
- Third-party iframes (e-signing, payments) hide the injected cursor and ignore dark mode; say so in your summary.
- Desktop apps (Teams, IDEs) are not covered by the headless recorders: use `screen-record` / `screen-cut` (Linux X11) from the older workflow, and say what it needs (`wmctrl`, `xdotool`).
- Finish with: output path, duration, scene list, anything auto-corrected, anything left behind, and what you would improve.
