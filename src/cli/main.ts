#!/usr/bin/env node
import { Command } from "commander";
import { NodeFiles } from "../adapters/node-files.js";
import { NodeShell } from "../adapters/node-shell.js";
import { FfmpegMedia } from "../adapters/ffmpeg-media.js";
import { TesseractOcr, TmuxTerminal, WmctrlWindows, X11Recorder, systemClock } from "../adapters/x11-desktop.js";
import { parseBox } from "../domain/redact.js";
import { formatClock } from "../domain/srt.js";
import { DEFAULT_TIGHTEN } from "../domain/tighten-plan.js";
import { cut } from "../use-cases/cut.js";
import { record } from "../use-cases/record.js";
import { redact } from "../use-cases/redact.js";
import { tighten } from "../use-cases/tighten.js";
import { verify } from "../use-cases/verify.js";
import { loadMarks, loadStoryboard } from "../storyboard/load.js";
import { registerStudio } from "./studio.js";

const shell = new NodeShell();
const files = new NodeFiles();
const media = new FfmpegMedia(shell);
const ocr = new TesseractOcr(shell);

const program = new Command().name("walkthru").description("Make a narrated product demo video: web apps, terminals, code, desktop").version("0.3.0");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

const num = (v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`"${v}" is not a number`);
  return n;
};

program
  .command("tighten <input> <output>")
  .description("Keep narration at normal speed and speed up long silent stretches")
  .option("--speed <n>", "speed for silent stretches", String(DEFAULT_TIGHTEN.speed))
  .option("--min-gap <s>", "silences at least this long are sped up", String(DEFAULT_TIGHTEN.minGap))
  .option("--keep <s>", "seconds of each silence kept at 1x after speech", String(DEFAULT_TIGHTEN.keep))
  .option("--lead <s>", "seconds kept at 1x before the next speech", String(DEFAULT_TIGHTEN.lead))
  .option("--noise-db <db>", "silence threshold in dB", "-35")
  .option("--fps <n>", "output frame rate", "30")
  .action((input: string, output: string, o: Record<string, string>) =>
    guarded(async () => {
      const r = await tighten({ media, files }, {
        input, output, noiseDb: num(o["noiseDb"] ?? "-35"), fps: num(o["fps"] ?? "30"),
        options: { speed: num(o["speed"] ?? "4"), minGap: num(o["minGap"] ?? "3"), keep: num(o["keep"] ?? "1.2"), lead: num(o["lead"] ?? "0.8") },
      });
      if (!r.ok) fail(r.reason);
      console.log(`${formatClock(r.before)} -> ${formatClock(r.after)} (${r.segments.length} segments) written to ${output}`);
    }),
  );

program
  .command("check-video <input>")
  .description("Report duration, audio, long silences, narration length and sensitive on-screen text")
  .option("--storyboard <file>", "compare detected speech with the storyboard narration")
  .option("--max-silence <s>", "longest acceptable silence", "4")
  .option("--noise-db <db>", "silence threshold in dB", "-35")
  .option("--sensitive <text...>", "literal strings that must not appear on screen (needs tesseract)")
  .option("--ocr-every <s>", "seconds between sampled frames", "5")
  .action((input: string, o: { storyboard?: string; maxSilence: string; noiseDb: string; sensitive?: string[]; ocrEvery: string }) =>
    guarded(async () => {
      let storyboard = null;
      if (o.storyboard) {
        const s = await loadStoryboard(files, o.storyboard);
        if (!s.ok) fail(s.reason);
        storyboard = s.storyboard;
      }
      const r = await verify({ media, files, ocr }, {
        input, storyboard, maxSilence: num(o.maxSilence), noiseDb: num(o.noiseDb), sensitive: o.sensitive ?? [], ocrEverySeconds: num(o.ocrEvery),
      });
      console.log(`${input}: ${formatClock(r.duration)}, audio ${r.hasAudio ? "yes" : "no"}`);
      for (const f of r.findings) console.log(`${f.severity.toUpperCase().padEnd(7)} ${f.code}: ${f.message}`);
      if (r.findings.length === 0) console.log("No findings.");
      if (r.findings.some((f) => f.severity === "error")) process.exit(1);
    }),
  );

program
  .command("redact <input> <output>")
  .description("Blur screen regions, optionally only between two times")
  .requiredOption("--box <spec...>", "x,y,w,h or x,y,w,h,fromSeconds,toSeconds (repeatable)")
  .option("--strength <n>", "blur strength", "20")
  .action((input: string, output: string, o: { box: string[]; strength: string }) =>
    guarded(async () => {
      const boxes = o.box.map((spec) => parseBox(spec) ?? fail(`bad --box "${spec}" (use x,y,w,h or x,y,w,h,from,to)`));
      await redact({ media }, { input, output, boxes, strength: num(o.strength) });
      console.log(`wrote ${output}`);
    }),
  );

program
  .command("screen-record <storyboard>")
  .description("Run the storyboard steps on this X11 desktop while recording the screen")
  .option("--out <dir>", "output directory", "out")
  .option("--lead <s>", "seconds of stillness before the first step", "3")
  .action((path: string, o: { out: string; lead: string }) =>
    guarded(async () => {
      const s = await loadStoryboard(files, path);
      if (!s.ok) fail(s.reason);
      const r = await record(
        { recorder: new X11Recorder(shell, process.env["DISPLAY"] ?? ":0", systemClock), windows: new WmctrlWindows(shell), terminal: new TmuxTerminal(shell, systemClock), clock: systemClock, files },
        { storyboard: s.storyboard, outDir: o.out, lead: num(o.lead) },
      );
      if (!r.ok) fail(r.reason);
      console.log(`recorded ${r.raw}; ${r.marks.length} clip marks written to ${o.out}/marks.json. Next: walkthru screen-cut ${r.raw} --marks ${o.out}/marks.json --storyboard ${path}`);
    }),
  );

program
  .command("screen-cut <raw>")
  .description("Cut the raw capture into clips at scene-detected boundaries; write master, narration and SRT")
  .requiredOption("--marks <file>", "marks.json written by `record`")
  .option("--storyboard <file>", "write narration.md and script.srt from this storyboard")
  .option("--out <dir>", "output directory", "out")
  .option("--scene <t>", "scene-change threshold (0-1)", "0.4")
  .option("--snap <s>", "max distance in seconds between a mark and its scene change", "4")
  .action((raw: string, o: { marks: string; storyboard?: string; out: string; scene: string; snap: string }) =>
    guarded(async () => {
      const m = await loadMarks(files, o.marks);
      if (!m.ok) fail(m.reason);
      let storyboard = null;
      if (o.storyboard) {
        const s = await loadStoryboard(files, o.storyboard);
        if (!s.ok) fail(s.reason);
        storyboard = s.storyboard;
      }
      const r = await cut({ media, files }, { raw, marks: m.marks, storyboard, outDir: o.out, sceneThreshold: num(o.scene), snapTolerance: num(o.snap) });
      for (const c of r.clips) console.log(`${c.name.padEnd(14)} ${c.start.toFixed(1)}s - ${c.end.toFixed(1)}s`);
      console.log(`master: ${r.master}`);
    }),
  );

registerStudio(program);
await program.parseAsync(process.argv);
