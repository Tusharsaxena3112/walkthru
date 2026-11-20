/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from "node:fs";
import { importRuntime } from "./runtime.js";

export interface Pty {
  write(data: string): void;
  onData(cb: (d: string) => void): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

const PS1 = String.raw`\[\e[1;32m\]➜ \[\e[1;36m\]\W\[\e[0m\] `;

/** A real pseudo-terminal running the user's shell with a clean, readable prompt. */
export async function spawnPty(cwd: string, cols: number, rows: number, env: Record<string, string>): Promise<Pty> {
  const mod: any = await importRuntime("@homebridge/node-pty-prebuilt-multiarch").catch(() => {
    throw new Error("Terminal recording needs node-pty. Run: walkthru doctor --fix");
  });
  const win = process.platform === "win32";
  const shell = win ? "powershell.exe" : existsSync("/bin/bash") ? "/bin/bash" : (process.env["SHELL"] ?? "/bin/sh");
  const args = win ? ["-NoLogo", "-NoProfile"] : shell.endsWith("bash") ? ["--noprofile", "--norc", "-i"] : [];
  const p = mod.spawn(shell, args, {
    name: "xterm-256color", cols, rows, cwd,
    env: { ...process.env, ...env, TERM: "xterm-256color", PS1, HISTFILE: "/dev/null", FORCE_COLOR: "1", CLICOLOR_FORCE: "1" },
  });
  return { write: (d) => p.write(d), onData: (cb) => p.onData(cb), resize: (c, r) => p.resize(c, r), kill: () => { try { p.kill(); } catch { /* already gone */ } } };
}
