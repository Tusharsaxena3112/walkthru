import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Narrator } from "../ports/narrator.js";
import { estimateSpeechSeconds } from "../domain/srt.js";
import { piperPaths } from "../studio/runtime.js";
import { ffmpeg, run } from "./media-run.js";

export class PiperNarrator implements Narrator {
  readonly id = "piper";
  cost(): number {
    return 0;
  }
  async synthesize(text: string, out: string): Promise<void> {
    const p = piperPaths();
    if (!p) throw new Error("Piper voice not installed. Run: walkthru doctor --fix");
    const r = await run(p.bin, ["--model", p.model, "--output_file", out], { input: `${text}\n`, cwd: resolve(p.bin, "..") });
    if (r.code !== 0) throw new Error(`piper failed: ${r.stderr.trim().slice(-200)}`);
  }
}

export class ElevenLabsNarrator implements Narrator {
  readonly id = "elevenlabs";
  constructor(
    private readonly key: string,
    private readonly voiceId: string,
  ) {}
  cost(text: string): number {
    return text.length;
  }
  async synthesize(text: string, out: string): Promise<void> {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": this.key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
    });
    if (!r.ok) {
      const body = (await r.text()).replace(/\s+/g, " ").slice(0, 160);
      const hint = r.status === 402 ? " (this voice needs a paid plan: pick a default voice such as Adam pNInz6obpgDQGcFmaJgB or Antoni ErXwobaYiN019PkySvjV)" : r.status === 401 ? " (check ELEVEN_LABS_API_KEY)" : "";
      throw new Error(`ElevenLabs http ${r.status}${hint}: ${body}`);
    }
    const mp3 = `${out}.mp3`;
    await writeFile(mp3, Buffer.from(await r.arrayBuffer()));
    await ffmpeg(["-i", mp3, "-ar", "44100", "-ac", "2", out]);
  }
}

/** Offline stand-in: a soft tone as long as the sentence would take. Used for tests and silent rehearsal audio. */
export class ToneNarrator implements Narrator {
  readonly id = "tone";
  cost(): number {
    return 0;
  }
  async synthesize(text: string, out: string): Promise<void> {
    const s = Math.max(0.8, estimateSpeechSeconds(text));
    await ffmpeg(["-f", "lavfi", "-i", `sine=f=220:d=${s.toFixed(2)}`, "-af", "volume=0.15", "-ar", "44100", "-ac", "2", out]);
  }
}
