import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { run } from "../adapters/media-run.js";
import { runtimeDir } from "./paths.js";
import { importRuntime, piperPaths } from "./runtime.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  needed: "always" | "web" | "terminal" | "code" | "voice";
}

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const PIPER_URL: Record<string, string> = {
  "linux-x64": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
  "linux-arm64": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz",
  "darwin-x64": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz",
  "darwin-arm64": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz",
  "win32-x64": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
};
const VOICE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium";

async function has(pkg: string): Promise<boolean> {
  try { await importRuntime(pkg); return true; } catch { return false; }
}

export async function check(): Promise<Check[]> {
  const out: Check[] = [];
  const node = Number(process.versions.node.split(".")[0]);
  out.push({ name: "node >= 22", ok: node >= 22, detail: process.versions.node, needed: "always" });
  let ff = true;
  try { const { ffmpegPath, ffprobePath } = await import("./runtime.js"); ffmpegPath(); ffprobePath(); } catch { ff = false; }
  out.push({ name: "ffmpeg + ffprobe", ok: ff, detail: ff ? "found" : "will install ffmpeg-static", needed: "always" });
  out.push({ name: "playwright", ok: await has("playwright"), detail: "browser automation", needed: "web" });
  let chromium = false;
  try { const pw = (await importRuntime("playwright")) as { chromium: { executablePath(): string } }; chromium = existsSync(pw.chromium.executablePath()); } catch { /* not installed */ }
  out.push({ name: "chromium browser", ok: chromium, detail: "renders every scene", needed: "web" });
  out.push({ name: "terminal engine (node-pty, xterm)", ok: (await has("@homebridge/node-pty-prebuilt-multiarch")) && (await has("@xterm/xterm")), detail: "terminal scenes", needed: "terminal" });
  out.push({ name: "code viewer (highlight.js)", ok: await has("highlight.js"), detail: "code scenes", needed: "code" });
  out.push({ name: "free local voice (Piper)", ok: !!piperPaths(), detail: "offline narration, no account needed", needed: "voice" });
  return out;
}

async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status}): ${url}`);
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(dest));
}

export async function fix(log: (m: string) => void, only?: Check["needed"][]): Promise<void> {
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(resolve(dir, "package.json"))) writeFileSync(resolve(dir, "package.json"), JSON.stringify({ name: "walkthru-runtime", private: true }));
  const want = (n: Check["needed"]): boolean => !only || only.includes(n);
  const checks = await check();
  const bad = (name: string): boolean => checks.some((c) => c.name.startsWith(name) && !c.ok);
  const need: string[] = [];
  if (bad("ffmpeg")) need.push("ffmpeg-static", "ffprobe-static");
  if (want("web") && bad("playwright")) need.push("playwright");
  if (want("terminal") && bad("terminal")) need.push("@xterm/xterm", "@xterm/addon-fit", "@homebridge/node-pty-prebuilt-multiarch");
  if (want("code") && bad("code")) need.push("highlight.js");
  if (need.length) {
    log(`installing ${need.join(", ")} into ${dir} …`);
    const r = await run(NPM, ["install", "--no-audit", "--no-fund", "--loglevel=error", ...need], { cwd: dir });
    if (r.code !== 0) throw new Error(`npm install failed: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  }
  if (want("web") && bad("chromium")) {
    log("installing the chromium browser (about 150 MB, once) …");
    const cli = resolve(dir, "node_modules", "playwright", "cli.js");
    const r = await run(process.execPath, [existsSync(cli) ? cli : resolve(process.cwd(), "node_modules", "playwright", "cli.js"), "install", "chromium"], { cwd: dir });
    if (r.code !== 0) throw new Error(`chromium install failed: ${r.stderr.trim().slice(-300)}`);
  }
  if (want("voice") && bad("free local voice")) {
    const url = PIPER_URL[`${process.platform}-${process.arch}`];
    if (!url) log("no prebuilt Piper for this platform; use voice.provider: elevenlabs or tone");
    else {
      const pd = resolve(dir, "piper");
      mkdirSync(pd, { recursive: true });
      log("downloading the free Piper voice (about 80 MB, once) …");
      const archive = resolve(pd, url.endsWith(".zip") ? "piper.zip" : "piper.tgz");
      await download(url, archive);
      const r = url.endsWith(".zip") ? await run("tar", ["-xf", archive, "-C", pd]) : await run("tar", ["-xzf", archive, "-C", pd]);
      if (r.code !== 0) throw new Error(`could not unpack Piper: ${r.stderr.slice(-200)}`);
      await download(`${VOICE}.onnx`, resolve(pd, "voice.onnx"));
      await download(`${VOICE}.onnx.json`, resolve(pd, "voice.onnx.json"));
    }
  }
}
