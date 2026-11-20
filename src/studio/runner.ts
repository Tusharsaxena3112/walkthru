import { SpeechTrack, type SpeechCue } from "../domain/sync.js";
import { findErrorBanner, scanSecrets } from "../domain/secrets.js";
import type { LedgerEntry } from "../domain/ledger.js";
import type { SceneDriver } from "../ports/driver.js";
import { type Demo, type DemoScene, interpolate, verbOf } from "../storyboard/demo.js";
import { CodeDriver } from "./drivers/code.js";
import { TerminalDriver } from "./drivers/terminal.js";
import { WebDriver } from "./drivers/web.js";
import { clipFile, secretValues, sha, writeJson } from "./project.js";
import { BrowserSurface } from "./surface.js";
import type { AudioInfo } from "./voice.js";

export interface SceneRecord {
  id: string;
  hash: string;
  offset: number;
  cues: (SpeechCue & { audio: string })[];
  idle: { start: number; end: number }[];
  heals: { wanted: string; used: string }[];
  ledger: LedgerEntry[];
  findings: string[];
  errors: string[];
}

export const sceneHash = (demo: Demo, scene: DemoScene, audio: Map<string, AudioInfo>, env: Record<string, string>): string => {
  const speech = [...scene.setup, ...scene.steps].flatMap((st) => (typeof st["say"] === "string" ? [audio.get(interpolate(st["say"], env))?.file ?? ""] : []));
  return sha({ scene, speech, base: demo.baseUrl, theme: demo.theme, storage: demo.storage, vp: demo.viewport, mode: demo.mode });
};

export interface RecordOptions {
  fast: boolean;
  env: Record<string, string>;
  audio: Map<string, AudioInfo>;
  log: (m: string) => void;
}

async function makeDriver(demo: Demo, scene: DemoScene, surface: BrowserSurface, env: Record<string, string>): Promise<SceneDriver> {
  const mode = scene.mode && scene.mode !== "card" ? scene.mode : demo.mode;
  const cwd = scene.cwd ?? demo.cwd ?? process.cwd();
  if (mode === "terminal") return TerminalDriver.create(surface, cwd, env);
  if (mode === "code") return CodeDriver.create(surface, cwd);
  return new WebDriver(surface, demo.baseUrl, env);
}

/** Runs one scene's steps on a real surface. Speech is placed by SpeechTrack so it can never lead the action it describes. */
export async function recordScene(demo: Demo, scene: DemoScene, o: RecordOptions): Promise<SceneRecord> {
  const mode = scene.mode && scene.mode !== "card" ? scene.mode : demo.mode;
  const surface = await BrowserSurface.open({ id: scene.id, viewport: demo.viewport, theme: demo.theme, storage: demo.storage, record: !o.fast, fast: o.fast, cursor: mode === "web" });
  const rec: SceneRecord = { id: scene.id, hash: sceneHash(demo, scene, o.audio, o.env), offset: 0, cues: [], idle: [], heals: [], ledger: [], findings: [], errors: [] };
  const secrets = secretValues(demo, o.env);
  let driver: SceneDriver | undefined;
  let t0 = Date.now();
  const now = (): number => (Date.now() - t0) / 1000;
  const track = new SpeechTrack({ now, sleep: (s) => new Promise((r) => setTimeout(r, s * 1000)) });
  const inspect = (where: string, text?: string): void => {
    if (!text) return;
    for (const f of scanSecrets(text, secrets)) rec.findings.push(`${where}: secret on screen (${f.kind} ${f.sample})`);
    const banner = findErrorBanner(text);
    if (banner) rec.findings.push(`${where}: error text on screen ("${banner}")`);
  };
  try {
    driver = await makeDriver(demo, scene, surface, o.env);
    for (const [n, st] of scene.setup.entries()) {
      const verb = verbOf(st);
      if (!verb || verb === "say") continue;
      await driver.run(st, verb, now).catch((e: Error) => { throw new Error(`setup[${n}] ${verb}: ${e.message}`); });
    }
    rec.offset = driver.go();
    t0 = Date.now();
    for (const [n, st] of scene.steps.entries()) {
      const verb = verbOf(st);
      if (!verb) continue;
      if (verb === "say") {
        if (o.fast) continue;
        const text = interpolate(String(st["say"]), o.env);
        const a = o.audio.get(text);
        if (!a) throw new Error(`steps[${n}] say: no audio for "${text.slice(0, 40)}…" (run walkthru voice)`);
        rec.cues.push({ ...(await track.say(text, a.file, a.seconds)), audio: a.file });
        continue;
      }
      o.log(`  ${scene.id} ${verb}${typeof st[verb] === "string" ? `: ${(st[verb] as string).slice(0, 50)}` : ""}`);
      const r = await driver.run(st, verb, now).catch((e: Error) => { throw new Error(`steps[${n}] ${verb}: ${e.message}`); });
      if (r.idle) rec.idle.push(r.idle);
      if (r.healed) rec.heals.push(r.healed);
      if (r.note) rec.ledger.push({ scene: scene.id, note: r.note });
      inspect(`${scene.id} steps[${n}]`, r.text);
    }
    await track.drain();
    await surface.pause(1200);
  } finally {
    const closed = driver ? await driver.close().catch(() => undefined) : await surface.close().catch(() => undefined);
    rec.errors = closed?.errors ?? [];
  }
  if (!o.fast) writeJson(clipFile(scene.id, "json"), rec);
  return rec;
}
