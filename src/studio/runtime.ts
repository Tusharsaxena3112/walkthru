import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runtimeDir } from "./paths.js";

const exe = (n: string): string => (process.platform === "win32" ? `${n}.exe` : n);

function onPath(name: string): string | null {
  for (const d of (process.env["PATH"] ?? "").split(delimiter)) {
    const f = join(d, exe(name));
    if (d && existsSync(f)) return f;
  }
  return null;
}

/** Loads an npm package from the runtime dir (installed by `doctor --fix`) or from the plugin's own node_modules. */
export async function importRuntime<T = unknown>(pkg: string): Promise<T> {
  for (const base of [runtimeDir(), process.cwd(), import.meta.dirname]) {
    try {
      const r = createRequire(resolve(base, "noop.js"));
      const m = (await import(pathToFileURL(r.resolve(pkg)).href)) as T & { default?: T };
      return (m as { chromium?: unknown }).chromium ? m : (m.default ?? m);
    } catch {
      /* try next */
    }
  }
  throw new Error(`${pkg} is not installed. Run: walkthru doctor --fix`);
}

export function ffmpegPath(): string {
  const env = process.env["WALKTHRU_FFMPEG"];
  if (env) return env;
  const sys = onPath("ffmpeg");
  if (sys) return sys;
  const bundled = resolve(runtimeDir(), "node_modules", "ffmpeg-static", exe("ffmpeg"));
  if (existsSync(bundled)) return bundled;
  throw new Error("ffmpeg not found. Run: walkthru doctor --fix");
}

export function ffprobePath(): string {
  const sys = onPath("ffprobe");
  if (sys) return sys;
  const dir = resolve(runtimeDir(), "node_modules", "ffprobe-static", "bin");
  const arch = process.arch === "x64" ? "x64" : process.arch;
  const plat = process.platform === "win32" ? "win32" : process.platform;
  const f = resolve(dir, plat, arch, exe("ffprobe"));
  if (existsSync(f)) return f;
  throw new Error("ffprobe not found. Run: walkthru doctor --fix");
}

export function piperPaths(): { bin: string; model: string } | null {
  const dir = resolve(runtimeDir(), "piper");
  const bin = resolve(dir, "piper", exe("piper"));
  const model = resolve(dir, "voice.onnx");
  return existsSync(bin) && existsSync(model) ? { bin, model } : null;
}

/** Absolute path of a file inside an installed package (runtime dir first, then the plugin's own node_modules). */
export function requireFile(pkg: string, rel: string): string {
  for (const base of [runtimeDir(), process.cwd(), import.meta.dirname]) {
    for (const root of [resolve(base, "node_modules", pkg), resolve(base, "..", "node_modules", pkg), resolve(base, "..", "..", "node_modules", pkg)]) {
      const f = resolve(root, rel);
      if (existsSync(f)) return f;
    }
  }
  throw new Error(`${pkg}/${rel} not found. Run: walkthru doctor --fix`);
}
