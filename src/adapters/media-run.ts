import { spawn } from "node:child_process";
import { ffmpegPath, ffprobePath } from "../studio/runtime.js";

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(cmd: string, args: string[], opts: { cwd?: string; input?: string } = {}): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => resolveRun({ code: 127, stdout, stderr: stderr + e.message }));
    child.on("close", (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(opts.input ?? "");
  });
}

export async function ffmpeg(args: string[]): Promise<Run> {
  const r = await run(ffmpegPath(), ["-hide_banner", "-v", "error", "-y", ...args]);
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  return r;
}

export async function probeDuration(file: string): Promise<number> {
  const r = await run(ffprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const n = Number(r.stdout.trim());
  if (r.code !== 0 || !Number.isFinite(n)) throw new Error(`cannot read duration of ${file}`);
  return n;
}
