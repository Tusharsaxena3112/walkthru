import { copyFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { assemble } from "../studio/assemble.js";
import { check, fix } from "../studio/doctor.js";
import { demoDir, outDir, projectRoot, storyboardPath } from "../studio/paths.js";
import { clipFile, ensureDirs, loadDemo, loadEnv, readJson } from "../studio/project.js";
import { verifyVideo, writeReport } from "../studio/qa.js";
import { recordScene, sceneHash, type SceneRecord } from "../studio/runner.js";
import { collectLines, ensureAudio, narratorFor, type AudioInfo } from "../studio/voice.js";
import type { Demo } from "../storyboard/demo.js";

const log = (m: string): void => console.log(m);

function needs(demo: Demo): ("web" | "terminal" | "code" | "voice")[] {
  const modes = new Set(demo.scenes.map((s) => (s.mode && s.mode !== "card" ? s.mode : demo.mode)));
  const out: ("web" | "terminal" | "code" | "voice")[] = ["web"];
  if (modes.has("terminal")) out.push("terminal");
  if (modes.has("code")) out.push("code");
  if (demo.voice.provider === "piper") out.push("voice");
  return out;
}

async function ensureReady(demo: Demo, auto: boolean): Promise<void> {
  const want = needs(demo);
  const bad = (await check()).filter((c) => !c.ok && (c.needed === "always" || want.includes(c.needed as never)));
  if (!bad.length) return;
  if (!auto) throw new Error(`missing: ${bad.map((b) => b.name).join(", ")}. Run: walkthru doctor --fix`);
  log(`First-run setup: ${bad.map((b) => b.name).join(", ")}`);
  await fix(log, [...want, "always"]);
}

async function voiceStep(demo: Demo, env: Record<string, string>, provider?: string, dry = false): Promise<{ audio: Map<string, AudioInfo>; spent: number; narratorId: string }> {
  const narrator = narratorFor(demo, env, provider);
  const lines = collectLines(demo, env);
  const r = await ensureAudio(demo, narrator, lines, { dry });
  log(`voice: ${narrator.id}, ${lines.length} sentences${narrator.cost("x") ? `, ${r.chars} characters in total, ${r.spent} newly spent` : ""}`);
  return { audio: r.audio, spent: r.spent, narratorId: narrator.id };
}

async function recordAll(demo: Demo, env: Record<string, string>, audio: Map<string, AudioInfo>, only: string[], force: boolean, fast: boolean): Promise<void> {
  ensureDirs();
  for (const scene of demo.scenes) {
    if (scene.mode === "card") continue;
    if (only.length && !only.includes(scene.id)) continue;
    const prev = readJson<SceneRecord | null>(clipFile(scene.id, "json"), null);
    if (!fast && !force && prev && existsSync(clipFile(scene.id, "webm")) && prev.hash === sceneHash(demo, scene, audio, env)) { log(`scene ${scene.id}: unchanged, reusing recording`); continue; }
    const t = Date.now();
    log(`${fast ? "rehearsing" : "recording"} scene ${scene.id} …`);
    try {
      const r = await recordScene(demo, scene, { fast, env, audio, log: fast ? log : () => undefined });
      log(`scene ${scene.id} ok (${((Date.now() - t) / 1000).toFixed(0)}s)${r.heals.length ? `, ${r.heals.length} step(s) auto-corrected` : ""}${r.findings.length ? `, ${r.findings.length} warning(s)` : ""}`);
      for (const f of r.findings) log(`  ! ${f}`);
    } catch (e) {
      throw new Error(`scene ${scene.id} failed: ${(e as Error).message}`);
    }
  }
}

export function registerStudio(program: Command): void {
  program.command("doctor").description("Check what is installed; --fix installs everything needed (no sudo)").option("--fix", "install what is missing").action(async (o: { fix?: boolean }) => {
    try {
      if (o.fix) await fix(log);
      const checks = await check();
      for (const c of checks) log(`${c.ok ? "ok     " : "MISSING"} ${c.name}  (${c.detail})`);
      if (checks.some((c) => !c.ok && c.needed === "always")) process.exitCode = 1;
    } catch (e) { console.error(`error: ${(e as Error).message}`); process.exitCode = 1; }
  });

  program.command("init").description("Create demo/demo.yaml and ignore secrets and output in git").action(() => {
    mkdirSync(demoDir(), { recursive: true });
    if (existsSync(storyboardPath())) log(`keep ${storyboardPath()}`);
    else { copyFileSync([resolve(import.meta.dirname, "..", "templates", "demo.yaml"), resolve(import.meta.dirname, "..", "..", "templates", "demo.yaml")].find((f) => existsSync(f)) ?? "", storyboardPath()); log(`created ${storyboardPath()}`); }
    const gi = resolve(projectRoot(), ".gitignore");
    const cur = existsSync(gi) ? readFileSync(gi, "utf8") : "";
    const add = [".env.demo", "demo/out/"].filter((l) => !cur.split("\n").includes(l));
    if (add.length) { appendFileSync(gi, `${cur && !cur.endsWith("\n") ? "\n" : ""}${add.join("\n")}\n`); log(`.gitignore += ${add.join(", ")}`); }
  });

  const wrap = (fn: () => Promise<void>) => async (): Promise<void> => { try { await fn(); } catch (e) { console.error(`error: ${(e as Error).message}`); process.exitCode = 1; } };

  program.command("plan").description("Validate the storyboard and show scenes, narration length and voice cost").action(wrap(async () => {
    const demo = loadDemo(); const env = loadEnv(); const lines = collectLines(demo, env);
    const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    log(`${demo.title}: ${demo.scenes.length} scenes, ${lines.length} spoken sentences, ~${Math.round(words / 2.3)}s of narration at the set tempo, voice ${demo.voice.provider}`);
    if (demo.voice.provider === "elevenlabs") log(`ElevenLabs cost: ${lines.reduce((n, l) => n + l.text.length, 0)} characters`);
    for (const s of demo.scenes) log(`  ${s.id}  [${s.mode ?? demo.mode}] ${s.steps.length} steps  ${s.title ?? ""}`);
  }));

  program.command("rehearse [scenes...]").description("Run every step quickly without recording or voice; reports broken steps and on-screen problems").action((scenes: string[]) => wrap(async () => {
    const demo = loadDemo(); const env = loadEnv();
    await ensureReady(demo, true);
    await recordAll(demo, env, new Map(), scenes, true, true);
    log("rehearsal finished");
  })());

  program.command("voice").description("Generate narration audio (cached; only new or changed sentences are synthesised)").option("--provider <p>", "piper | elevenlabs | tone").option("--dry", "only show the cost").action((o: { provider?: string; dry?: boolean }) => wrap(async () => {
    const demo = loadDemo(); const env = loadEnv();
    if (!o.dry) await ensureReady(demo, true);
    await voiceStep(demo, env, o.provider, !!o.dry);
  })());

  program.command("record [scenes...]").description("Record scenes (only changed ones unless --force)").option("--force", "re-record everything").option("--provider <p>", "voice provider override").action((scenes: string[], o: { force?: boolean; provider?: string }) => wrap(async () => {
    const demo = loadDemo(); const env = loadEnv();
    await ensureReady(demo, true);
    const v = await voiceStep(demo, env, o.provider);
    await recordAll(demo, env, v.audio, scenes, !!o.force, false);
  })());

  program.command("build").description("Assemble the final video, captions, thumbnail and preview").option("--provider <p>", "voice provider override").action((o: { provider?: string }) => wrap(async () => {
    const demo = loadDemo(); const env = loadEnv();
    const v = await voiceStep(demo, env, o.provider);
    const built = await assemble(demo, v.audio, env, log);
    const qa = await verifyVideo(built.file, demo, built.scenes);
    log(writeReport(demo, built, qa, v.spent, v.narratorId));
    if (qa.findings.some((f) => f.severity === "error")) process.exitCode = 1;
  })());

  program.command("make").description("Everything: setup, voice, record, build, quality checks, report").option("--force", "re-record everything").option("--provider <p>", "voice provider override").action((o: { force?: boolean; provider?: string }) => wrap(async () => {
    const demo = loadDemo(); const env = loadEnv();
    await ensureReady(demo, true);
    log("rehearsing quickly first …");
    await recordAll(demo, env, new Map(), [], true, true);
    const v = await voiceStep(demo, env, o.provider);
    await recordAll(demo, env, v.audio, [], !!o.force, false);
    const built = await assemble(demo, v.audio, env, log);
    const qa = await verifyVideo(built.file, demo, built.scenes);
    log(writeReport(demo, built, qa, v.spent, v.narratorId));
    if (qa.findings.some((f) => f.severity === "error")) process.exitCode = 1;
  })());

  program.command("verify").description("Re-run the quality checks on the built video").action(wrap(async () => {
    const demo = loadDemo();
    const file = resolve(outDir(), "walkthru.mp4");
    const qa = await verifyVideo(file, demo, []);
    for (const f of qa.facts) log(f);
    for (const f of qa.findings) log(`${f.severity.toUpperCase()} ${f.code}: ${f.message}`);
    if (!qa.findings.length) log("all passed");
    if (qa.findings.some((f) => f.severity === "error")) process.exitCode = 1;
  }));
}
