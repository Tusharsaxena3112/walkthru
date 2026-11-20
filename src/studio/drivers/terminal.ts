/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { typingDelays, rng } from "../../domain/motion.js";
import type { SceneDriver, StepOutcome } from "../../ports/driver.js";
import { type DemoStep, interpolate } from "../../storyboard/demo.js";
import { type Pty, spawnPty } from "../pty.js";
import { requireFile } from "../runtime.js";
import { BrowserSurface } from "../surface.js";

const KEYS: Record<string, string> = { enter: "\r", tab: "\t", esc: "\x1b", up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D", backspace: "\x7f", space: " " };
const keySeq = (k: string): string => {
  const m = /^ctrl\+([a-z])$/i.exec(k);
  return m?.[1] ? String.fromCharCode(m[1].toLowerCase().charCodeAt(0) - 96) : (KEYS[k.toLowerCase()] ?? k);
};

const PAGE = (css: string) => `<!doctype html><meta charset=utf-8><style>${css}
html,body{margin:0;height:100%;background:#0d1117;overflow:hidden}#t{position:absolute;inset:28px 36px 28px 36px}
.bar{position:absolute;left:0;right:0;top:0;height:0}</style><div id=t></div>`;

export class TerminalDriver implements SceneDriver {
  private pty!: Pty;
  private queue: Promise<unknown> = Promise.resolve();
  private lastData = Date.now();
  private readonly random = rng(11);

  private constructor(private readonly s: BrowserSurface, private readonly env: Record<string, string>) {}

  static async create(s: BrowserSurface, cwd: string, env: Record<string, string>): Promise<TerminalDriver> {
    const d = new TerminalDriver(s, env);
    const page = s.page;
    await page.setContent(PAGE(readFileSync(requireFile("@xterm/xterm", "css/xterm.css"), "utf8")));
    await page.addScriptTag({ content: readFileSync(requireFile("@xterm/xterm", "lib/xterm.js"), "utf8") });
    await page.addScriptTag({ content: readFileSync(requireFile("@xterm/addon-fit", "lib/addon-fit.js"), "utf8") });
    const dims = await page.evaluate(() => {
      const w: any = window;
      const term = new w.Terminal({ fontSize: 26, fontFamily: "DejaVu Sans Mono, Menlo, Consolas, monospace", cursorBlink: true, convertEol: false, scrollback: 2000,
        theme: { background: "#0d1117", foreground: "#e6edf3", cursor: "#f59e0b", selectionBackground: "#264f78" } });
      const fit = new w.FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(document.getElementById("t"));
      fit.fit();
      w.term = term;
      return { cols: term.cols, rows: term.rows };
    });
    d.pty = await spawnPty(resolve(cwd), dims.cols, dims.rows, env);
    d.pty.onData((chunk) => {
      d.lastData = Date.now();
      d.queue = d.queue.then(() => page.evaluate((c: string) => (window as any).term.write(c), chunk).catch(() => undefined));
    });
    await page.waitForTimeout(800);
    return d;
  }

  go(): number { return this.s.go(); }
  async close(): ReturnType<BrowserSurface["close"]> { this.pty.kill(); return this.s.close(); }

  private async screenText(): Promise<string> {
    await this.queue;
    return (await this.s.page.evaluate(() => {
      const b = (window as any).term.buffer.active;
      const out: string[] = [];
      for (let i = Math.max(0, b.length - 80); i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? "");
      return out.join("\n");
    })) as string;
  }

  private async typeLine(text: string): Promise<void> {
    const delays = typingDelays(text, 62, this.random);
    let i = 0;
    for (const ch of text) { this.pty.write(ch); await this.s.pause(this.s.fast ? 0 : delays[i++] ?? 60); }
    await this.s.pause(450);
    this.pty.write("\r");
  }

  /** Waits until output stops for `settleMs` (and `until` text appears if given). */
  private async settle(settleMs: number, timeoutS: number, until?: string): Promise<void> {
    const end = Date.now() + timeoutS * 1000;
    await this.s.page.waitForTimeout(this.s.fast ? 100 : 500);
    for (;;) {
      const quiet = Date.now() - this.lastData >= settleMs;
      if (quiet && (!until || (await this.screenText()).includes(until))) return;
      if (Date.now() > end) throw new Error(until ? `timed out waiting for "${until}" in the terminal` : "command still producing output after timeout");
      await this.s.page.waitForTimeout(150);
    }
  }

  async run(step: DemoStep, verb: string, now: () => number): Promise<StepOutcome> {
    const t0 = now();
    const out: StepOutcome = {};
    const val = step[verb];
    const text = (v: unknown): string => interpolate(typeof v === "string" ? v : String(v ?? ""), this.env);
    switch (verb) {
      case "run": {
        await this.typeLine(text(val));
        await this.settle(Number(step["settle"] ?? 1100), Number(step["timeout"] ?? 120), typeof step["until"] === "string" ? step["until"] : undefined);
        await this.s.pause(900);
        break;
      }
      case "type": await this.typeLine(text(val)); break;
      case "key": this.pty.write(keySeq(text(val))); await this.s.pause(500); break;
      case "clear": this.pty.write("\x0c"); await this.s.pause(500); break;
      case "wait": case "pause": await this.s.pause(Number(val) * 1000); break;
      case "note": out.note = text(val); break;
      case "highlight": await this.s.pause(1500); break;
      default: throw new Error(`step "${verb}" is not available in terminal scenes (use run, type, key, clear, wait)`);
    }
    if (now() - t0 > 4 && (verb === "run" || step["idle"] === true)) out.idle = { start: t0 + 1.5, end: now() - 1 };
    out.text = await this.screenText();
    return out;
  }
}
