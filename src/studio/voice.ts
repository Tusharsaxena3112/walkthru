import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ElevenLabsNarrator, PiperNarrator, ToneNarrator } from "../adapters/narrators.js";
import { ffmpeg, probeDuration } from "../adapters/media-run.js";
import type { Narrator } from "../ports/narrator.js";
import type { Demo } from "../storyboard/demo.js";
import { interpolate } from "../storyboard/demo.js";
import { outDir } from "./paths.js";
import { ensureDirs, sha } from "./project.js";

export interface Line {
  scene: string;
  text: string;
}

/** Every sentence the storyboard speaks, in order. */
export function collectLines(demo: Demo, env: Record<string, string>): Line[] {
  const out: Line[] = [];
  if (demo.intro?.say) out.push({ scene: "intro", text: demo.intro.say });
  for (const s of demo.scenes) {
    for (const st of [...s.setup, ...s.steps]) if (typeof st["say"] === "string") out.push({ scene: s.id, text: interpolate(st["say"], env) });
  }
  if (demo.outro?.say) out.push({ scene: "outro", text: demo.outro.say });
  return out;
}

export function narratorFor(demo: Demo, env: Record<string, string>, override?: string): Narrator {
  const provider = override ?? demo.voice.provider;
  if (provider === "tone" || provider === "none") return new ToneNarrator();
  if (provider === "elevenlabs") {
    const key = env["ELEVEN_LABS_API_KEY"] ?? env["ELEVENLABS_API_KEY"];
    if (!key) throw new Error("ELEVEN_LABS_API_KEY is missing in .env.demo (or use voice.provider: piper for the free local voice)");
    return new ElevenLabsNarrator(key, demo.voice.id ?? env["VOICE_ID"] ?? "ErXwobaYiN019PkySvjV");
  }
  return new PiperNarrator();
}

export interface AudioInfo {
  file: string;
  seconds: number;
}

export const audioKey = (demo: Demo, narrator: Narrator, text: string): string => sha(`${narrator.id}|${demo.voice.id ?? ""}|${demo.voice.tempo}|${text}`);
export const audioFile = (key: string): string => resolve(outDir(), "audio", `${key}.wav`);

/** Synthesises (or reuses cached) audio for every line, slowed by the storyboard tempo. Returns text -> audio. */
export async function ensureAudio(demo: Demo, narrator: Narrator, lines: Line[], opts: { dry?: boolean } = {}): Promise<{ audio: Map<string, AudioInfo>; chars: number; spent: number }> {
  ensureDirs();
  const audio = new Map<string, AudioInfo>();
  let chars = 0;
  let spent = 0;
  for (const l of lines) {
    const key = audioKey(demo, narrator, l.text);
    const file = audioFile(key);
    chars += narrator.cost(l.text);
    if (!existsSync(file)) {
      if (opts.dry) continue;
      const raw = `${file}.raw.wav`;
      await narrator.synthesize(l.text, raw);
      const t = demo.voice.tempo;
      await ffmpeg(["-i", raw, "-af", `silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse${t !== 1 ? `,atempo=${t}` : ""}`, "-ar", "44100", "-ac", "2", file]);
      spent += narrator.cost(l.text);
    }
    if (existsSync(file)) audio.set(l.text, { file, seconds: await probeDuration(file) });
  }
  return { audio, chars, spent };
}
