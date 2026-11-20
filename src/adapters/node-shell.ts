import { spawn } from "node:child_process";
import type { BackgroundProcess, RunResult, Shell } from "../ports/shell.js";

export class NodeShell implements Shell {
  run(cmd: string, args: string[]): Promise<RunResult> {
    return new Promise((resolve) => {
      // stdin is ignored so ffmpeg inside a loop can never swallow the caller's input.
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (e) => resolve({ code: 127, stdout, stderr: stderr + e.message }));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  }

  startBackground(cmd: string, args: string[]): BackgroundProcess {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
    const exited = new Promise<void>((resolve) => {
      child.on("close", () => resolve());
      child.on("error", () => resolve());
    });
    return {
      async stop(): Promise<void> {
        child.kill("SIGINT");
        await exited;
      },
    };
  }
}
