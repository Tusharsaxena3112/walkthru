# Walkthru

Tell Claude Code about your product and get a finished, narrated demo video. It works for websites and web apps, CLI tools, AI agents, codebase walkthroughs and tutorials. Making a demo by hand takes hours. With Walkthru you describe the product, approve a storyboard once, and review the result.

## Quick start

**1. Install the plugin** (inside Claude Code):
```
/plugin marketplace add Tusharsaxena2001/walkthru
/plugin install walkthru
```

**2. Ask for a demo**, in your project folder:
```
/walkthru
```
or just say it in plain words:
> Make a 3 minute demo video of this app for new customers. Use the free voice.

**3. Approve the storyboard** Claude shows you (scenes, what is said, how long it is). Then wait for the video.

That is all. You do not install anything yourself. On the first run Claude sets up the tools it needs (see [What gets installed](#what-gets-installed)).

You get these files in `demo/out/`:

| File | What it is |
|---|---|
| `walkthru.mp4` | the finished 1080p video, with chapters |
| `captions.srt` | subtitles |
| `thumbnail.png`, `preview.gif` | cover image and a short preview |
| `report.md` | quality checks, steps that were auto-corrected, and anything the recording left behind in real systems (so you can clean up) |

## Choosing the voice

Narration is generated for you. There are two voices, and you can switch at any time.

| Voice | Cost | Needs | Sound |
|---|---|---|---|
| **Free local voice** (`piper`), the default | free | nothing, no account, works offline | clear but a little robotic |
| **ElevenLabs** (`elevenlabs`) | uses your ElevenLabs characters (free plan: about 10,000 a month) | an ElevenLabs API key | natural |

### Use the free voice (default)
Do nothing. If Claude asks which voice you want, answer "free voice". No key is ever requested.

### Switch to ElevenLabs
1. In ElevenLabs: Profile, then API Keys, create a key. Pick a voice and copy its Voice ID.
2. Put both in a file named `.env.demo` in your project root (it is git-ignored, and Walkthru never prints it):
   ```
   ELEVEN_LABS_API_KEY=your_key_here
   VOICE_ID=your_voice_id_here
   ```
3. Tell Claude, "use ElevenLabs for the voice", or edit `demo/demo.yaml`:
   ```yaml
   voice:
     provider: elevenlabs
   ```
4. Check the cost before spending anything:
   ```
   walkthru voice --dry
   ```
   It prints how many characters will be used. Only new or changed sentences are ever sent, so re-running costs nothing for text you did not change.

Notes on ElevenLabs:
- **Free plan:** voices from the public Voice Library are not available through the API (you get an HTTP 402 error). Use one of the default voices, for example Adam `pNInz6obpgDQGcFmaJgB` or Antoni `ErXwobaYiN019PkySvjV`.
- **Go back to the free voice:** set `provider: piper`.
- **Voice speed:** `voice.tempo` slows or speeds the voice (`0.85` to `1.0`, default `0.92`).

## What it does

- **Explores your product** (live site, README, `--help`, or the code itself) and drafts the storyboard, so you don't write scripts.
- **Rehearses first**: every step runs quickly without recording, so problems show up early.
- **Records like a person**: smooth cursor movement, typing with natural rhythm, hover before click, smooth scrolling, highlight rings, waits sped up.
- **Keeps voice and screen in sync**: the voice is generated first, and each sentence is tied to the step it describes, so it never runs ahead of the screen.
- **Fixes small mistakes**: if a button name does not match, it uses the closest one on screen and tells you in the report.
- **Checks the result**: blank frames, loud or quiet audio, long silences, frozen pictures, and secrets or error text that appeared on screen.
- **Cheap to change**: edit one scene or one sentence and only that part is redone.

## Modes

| Mode | For |
|---|---|
| `web` | websites, dashboards, SaaS apps |
| `terminal` | CLI tools, terminal apps, AI agents (a real shell, recorded) |
| `code` | codebase walkthroughs (highlighted files, line ranges, file tree) |

A single video can mix modes: each scene can set its own `mode`.

Desktop apps (Linux only for now) use the older `screen-record` and `screen-cut` commands described in the `/record-demo` skill.

## The storyboard (`demo/demo.yaml`)

Claude writes it for you. You can read or edit it. A small example:

```yaml
title: Acme Dashboard Tour
mode: web
baseUrl: https://app.acme.com
voice: { provider: piper }          # or elevenlabs
intro: { title: Acme, say: "Welcome to Acme. Here is a quick tour." }
outro: { title: Thank you, say: "That is it. Thanks for watching." }
scenes:
  - id: sign-in
    setup:                           # logins and loading, trimmed from the video
      - go: /login
    steps:
      - say: "First, we sign in with our email."
      - type: jane@acme.com
        into: Email
      - click: Sign in
```

Common steps: `go`, `click`, `type` (with `into`), `press`, `scroll`, `wait`, `highlight`, `blur`, `say`, `run` (terminal), `open` and `lines` (code). Use `${NAME}` to insert a value from `.env.demo`. Full list and examples: `templates/demo.yaml` and `skills/walkthru/SKILL.md`.

## Commands (Claude runs these; you rarely need to)

```
walkthru make             everything: setup, voice, record, build, checks, report
walkthru plan             check the storyboard and show length and voice cost
walkthru rehearse         quick test run, no recording
walkthru voice [--dry]    generate narration (--dry shows the cost only)
walkthru record [scenes]  record changed scenes
walkthru build            assemble the video
walkthru verify           re-run the quality checks
walkthru doctor [--fix]   see or install what is missing
```

## What gets installed

On the first run only, into `~/.cache/walkthru/runtime` (nothing in your project, no admin rights):

- Chromium browser, about 150 MB (renders every scene)
- ffmpeg, if you do not already have it
- the free Piper voice, about 80 MB
- small packages for the terminal and code viewers

You need Node.js 22 or newer. Nothing is uploaded anywhere except the text sent to ElevenLabs if you choose that voice.

## Safe to use on real systems

- Credentials live in `.env.demo`, which is git-ignored and never printed. Their values are scanned for on screen, so they cannot end up in the video unnoticed.
- Recording happens against the real product, so prefer a test account or staging. Everything the run creates is listed in `report.md` ("Left behind") so you can clean it up.

## Limits

- Third-party pop-ups and embedded pages (e-signing, payments) do not show the cursor and ignore dark mode.
- Desktop-app capture is Linux (X11) only for now.
- The free voice is clearly synthetic; use ElevenLabs for a more natural result.

## Development

`pnpm typecheck | lint | test | build`. `pnpm build` creates `dist/walkthru.mjs`, which is committed so the plugin works without an install step. Layers: `src/domain` (pure logic: sync, speed ramps, motion, secrets, healing), `src/studio` (recorders, voice, assembly, quality checks), `src/cli`. MIT licensed.
