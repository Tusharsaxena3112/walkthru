import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FfmpegMedia } from "../src/adapters/ffmpeg-media.js";
import { NodeFiles } from "../src/adapters/node-files.js";
import { NodeShell } from "../src/adapters/node-shell.js";
import { DEFAULT_TIGHTEN } from "../src/domain/tighten-plan.js";
import type { Ocr } from "../src/ports/desktop.js";
import { cut } from "../src/use-cases/cut.js";
import { redact } from "../src/use-cases/redact.js";
import { tighten } from "../src/use-cases/tighten.js";
import { verify } from "../src/use-cases/verify.js";

const shell = new NodeShell();
const media = new FfmpegMedia(shell);
const files = new NodeFiles();
const noOcr: Ocr = { available: async () => false, read: async () => "" };
let dir: string;
let talky: string; // 40s: speech 0-3s and 25-28s, silence between and after
let silent: string; // video only
let scenes: string; // 3 coloured scenes, 4s each

const ff = (...args: string[]): void => void execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", ...args]);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "walkthru-test-"));
  talky = join(dir, "talky.mp4");
  silent = join(dir, "silent.mp4");
  scenes = join(dir, "scenes.mp4");
  ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=40", "-f", "lavfi", "-i",
    "aevalsrc=sin(2*PI*440*t)*0.5*(lt(t\\,3)+between(t\\,25\\,28)):s=44100:d=40",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", talky);
  ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent);
  ff("-f", "lavfi", "-i", "color=c=red:size=320x180:rate=30:duration=4", "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=30:duration=4",
    "-f", "lavfi", "-i", "color=c=green:size=320x180:rate=30:duration=4",
    "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", scenes);
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("tighten", () => {
  it("shortens a video with long silences and keeps audio and video aligned", async () => {
    const out = join(dir, "tight.mp4");
    const r = await tighten({ media, files }, { input: talky, output: out, options: DEFAULT_TIGHTEN, noiseDb: -35, fps: 30 });
    expect(r.ok).toBe(true);
    const before = await media.probe(talky);
    const after = await media.probe(out);
    expect(after.hasAudio).toBe(true);
    expect(after.duration).toBeLessThan(before.duration * 0.6);
    // speech is untouched: the two tone bursts are still ~3s each at normal speed
    const speech = (await media.detectSilences(out, -35, 0.5, after.duration)).reduce((s, i) => s + (i.end - i.start), 0);
    expect(after.duration - speech).toBeGreaterThan(5.5);
    expect(after.duration - speech).toBeLessThan(6.6);
  }, 120_000);

  it("refuses a video with no audio track", async () => {
    const r = await tighten({ media, files }, { input: silent, output: join(dir, "x.mp4"), options: DEFAULT_TIGHTEN, noiseDb: -35, fps: 30 });
    expect(r).toEqual({ ok: false, reason: "The input has no audio track; add the voice-over first, then tighten." });
  });
});

describe("verify", () => {
  it("reports long silences in the untightened video", async () => {
    const r = await verify({ media, files, ocr: noOcr }, { input: talky, maxSilence: 4, noiseDb: -35, storyboard: null, sensitive: [], ocrEverySeconds: 5 });
    expect(r.findings.filter((f) => f.code === "long-silence").length).toBe(2);
  });
  it("warns about a missing audio track and says when the sensitive-text check could not run", async () => {
    const r = await verify({ media, files, ocr: noOcr }, { input: silent, maxSilence: 4, noiseDb: -35, storyboard: null, sensitive: ["secret-host"], ocrEverySeconds: 5 });
    expect(r.findings.map((f) => f.code).sort()).toEqual(["low-resolution", "no-audio", "ocr-unavailable"]);
  });
  it("flags sensitive text found by OCR at the right time", async () => {
    const ocr: Ocr = { available: async () => true, read: async (p) => (p.endsWith("f-00002.png") ? "Host: SECRET-HOST" : "") };
    const r = await verify({ media, files, ocr }, { input: silent, maxSilence: 4, noiseDb: -35, storyboard: null, sensitive: ["secret-host"], ocrEverySeconds: 2 });
    expect(r.findings.find((f) => f.code === "sensitive-text")?.message).toContain("about 2s");
  });
});

describe("redact", () => {
  it("changes pixels inside the box and nothing outside it", async () => {
    const out = join(dir, "blurred.mp4");
    await redact({ media }, { input: silent, output: out, boxes: [{ x: 100, y: 100, w: 200, h: 100 }], strength: 20 });
    const md5 = (file: string, crop: string): string =>
      execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", file, "-vf", `trim=start_frame=10:end_frame=11,crop=${crop}`, "-frames:v", "1", "-f", "md5", "-"]).toString().trim();
    expect(md5(out, "200:100:100:100")).not.toBe(md5(silent, "200:100:100:100"));
    // outside the box the picture must be (nearly) identical; a lossy re-encode rules out bit equality
    const r = spawnSync("ffmpeg", ["-nostdin", "-i", out, "-i", silent, "-filter_complex", "[0:v]crop=200:100:420:240[a];[1:v]crop=200:100:420:240[b];[a][b]ssim", "-f", "null", "-"], { encoding: "utf8" });
    const all = Number(/All:([\d.]+)/.exec(r.stderr)?.[1]);
    expect(all).toBeGreaterThan(0.95);
  });
});

describe("cut", () => {
  it("cuts clips at the scene changes and joins them into a master", async () => {
    const out = join(dir, "cut-out");
    const r = await cut({ media, files }, {
      raw: scenes, outDir: out, storyboard: null, sceneThreshold: 0.4, snapTolerance: 2,
      marks: [{ name: "red", at: 0 }, { name: "blue", at: 3.7 }, { name: "green", at: 8.3 }],
    });
    expect(r.clips.map((c) => [c.name, Math.round(c.start)])).toEqual([["red", 0], ["blue", 4], ["green", 8]]);
    expect((await media.probe(r.master)).duration).toBeCloseTo(12, 0);
    expect(await files.exists(join(out, "clips", "blue.mp4"))).toBe(true);
  }, 60_000);
});
