import { resolve } from "node:path";
import { run } from "../adapters/media-run.js";
import { formatLedger, type LedgerEntry } from "../domain/ledger.js";
import { ffmpegPath, ffprobePath } from "./runtime.js";
import { outDir } from "./paths.js";
import { clipFile, readJson, writeJson } from "./project.js";
import type { BuiltScene } from "./assemble.js";
import type { SceneRecord } from "./runner.js";
import type { Demo } from "../storyboard/demo.js";
import { writeFileSync } from "node:fs";

export interface Finding {
  severity: "error" | "warn";
  code: string;
  message: string;
}

export async function verifyVideo(file: string, demo: Demo, scenes: BuiltScene[]): Promise<{ findings: Finding[]; facts: string[] }> {
  const findings: Finding[] = [];
  const facts: string[] = [];
  const pr = JSON.parse((await run(ffprobePath(), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file])).stdout) as { streams: { codec_type: string; width?: number; height?: number; codec_name: string }[]; format: { duration: string } };
  const v = pr.streams.find((s) => s.codec_type === "video");
  const a = pr.streams.find((s) => s.codec_type === "audio");
  const dur = Number(pr.format.duration);
  facts.push(`duration ${Math.floor(dur / 60)}m${String(Math.round(dur % 60)).padStart(2, "0")}s, video ${v?.width}x${v?.height}, audio ${a?.codec_name ?? "none"}`);
  if (!v || v.width !== demo.viewport.width || v.height !== demo.viewport.height) findings.push({ severity: "error", code: "resolution", message: `expected ${demo.viewport.width}x${demo.viewport.height}` });
  if (!a) findings.push({ severity: "error", code: "no-audio", message: "no audio stream" });
  const r = await run(ffmpegPath(), ["-hide_banner", "-i", file, "-vf", "blackdetect=d=1.5:pic_th=0.97:pix_th=0.012,freezedetect=n=-55dB:d=14", "-af", "volumedetect,silencedetect=noise=-45dB:d=10", "-f", "null", "-"]);
  const mean = Number(/mean_volume: (-?[\d.]+)/.exec(r.stderr)?.[1] ?? NaN);
  const max = Number(/max_volume: (-?[\d.]+)/.exec(r.stderr)?.[1] ?? NaN);
  if (Number.isFinite(mean)) facts.push(`loudness mean ${mean} dB, peak ${max} dB`);
  if (max > -0.3) findings.push({ severity: "error", code: "clipping", message: `audio peaks at ${max} dB` });
  if (mean < -30) findings.push({ severity: "warn", code: "quiet", message: `audio is quiet (mean ${mean} dB)` });
  for (const m of r.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
    const t = Number(m[1]);
    if (t > 1.5 && t < dur - 3) findings.push({ severity: "error", code: "blank-frames", message: `blank screen at ${t.toFixed(0)}s for ${(Number(m[2]) - t).toFixed(1)}s` });
  }
  for (const m of r.stderr.matchAll(/freeze_start: ([\d.]+)/g)) findings.push({ severity: "warn", code: "frozen", message: `picture frozen from ${Number(m[1]).toFixed(0)}s (a long wait? mark the step idle or cut it)` });
  for (const m of r.stderr.matchAll(/silence_start: ([\d.]+)/g)) findings.push({ severity: "warn", code: "long-silence", message: `10s+ of silence from ${Number(m[1]).toFixed(0)}s` });
  const talk = scenes.reduce((n, s) => n + s.cues.reduce((x, c) => x + (c.end - c.start), 0), 0);
  facts.push(`${scenes.length} scenes, narration ${Math.round(talk)}s (${Math.round((talk / dur) * 100)}% of the video)`);
  if (talk / dur < 0.25 && talk > 0) findings.push({ severity: "warn", code: "sparse-narration", message: "less than a quarter of the video is narrated; add say steps" });
  return { findings, facts };
}

export function writeReport(demo: Demo, built: { file: string; scenes: BuiltScene[]; seconds: number }, qa: { findings: Finding[]; facts: string[] }, spent: number, voice: string): string {
  const recs = demo.scenes.map((s) => readJson<SceneRecord | null>(clipFile(s.id, "json"), null)).filter((x): x is SceneRecord => !!x);
  const heals = recs.flatMap((r) => r.heals.map((h) => `- [${r.id}] "${h.wanted}" → clicked "${h.used}" (check this is the right element)`));
  const sceneFindings = recs.flatMap((r) => [...r.findings, ...r.errors.map((e) => `${r.id}: ${e}`)]);
  const ledger: LedgerEntry[] = recs.flatMap((r) => r.ledger);
  const md = [
    `# ${demo.title}`,
    "",
    `Video: ${built.file}`,
    ...qa.facts.map((f) => `- ${f}`),
    `- voice: ${voice}${spent ? `, ${spent} ElevenLabs characters spent` : ""}`,
    `- also: ${resolve(outDir(), "captions.srt")}, thumbnail.png, preview.gif, chapters embedded in the mp4`,
    "",
    "## Scenes",
    ...built.scenes.map((s) => `- ${s.id}  ${Math.floor(s.start / 60)}:${String(Math.round(s.start % 60)).padStart(2, "0")}  ${s.length.toFixed(0)}s  ${s.title}`),
    "",
    "## Quality checks",
    ...(qa.findings.length ? qa.findings.map((f) => `- ${f.severity.toUpperCase()} ${f.code}: ${f.message}`) : ["- all passed"]),
    ...(sceneFindings.length ? ["", "## Seen while recording", ...sceneFindings.map((f) => `- ${f}`)] : []),
    ...(heals.length ? ["", "## Steps that were auto-corrected", ...heals] : []),
    "",
    "## Left behind in real systems (clean up if needed)",
    formatLedger(ledger),
    "",
  ].join("\n");
  writeFileSync(resolve(outDir(), "report.md"), md);
  writeJson(resolve(outDir(), "report.json"), { findings: qa.findings, sceneFindings, heals, ledger, seconds: built.seconds });
  return md;
}
