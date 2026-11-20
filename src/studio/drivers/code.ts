/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import type { SceneDriver, StepOutcome } from "../../ports/driver.js";
import type { DemoStep } from "../../storyboard/demo.js";
import { importRuntime, requireFile } from "../runtime.js";
import type { BrowserSurface } from "../surface.js";

const LANG: Record<string, string> = { ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".mjs": "javascript", ".jsx": "javascript", ".py": "python", ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby", ".sh": "bash", ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".md": "markdown", ".css": "css", ".html": "xml", ".sql": "sql", ".c": "c", ".cpp": "cpp", ".cs": "csharp", ".php": "php", ".kt": "kotlin", ".swift": "swift" };
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Splits highlight.js HTML into per-line HTML, closing and reopening spans across line breaks. */
export function splitLines(html: string): string[] {
  const lines: string[] = [];
  let cur = "";
  const open: string[] = [];
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === "\n") { cur += "</span>".repeat(open.length); lines.push(cur); cur = open.join(""); }
    else { if (part.startsWith("<span")) open.push(part); else if (part === "</span>") open.pop(); cur += part; }
  }
  lines.push(cur + "</span>".repeat(open.length));
  return lines;
}

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "out"]);

export class CodeDriver implements SceneDriver {
  private file = "";
  private lineCount = 0;
  private hljs: any;

  private constructor(private readonly s: BrowserSurface, private readonly cwd: string) {}

  static async create(s: BrowserSurface, cwd: string): Promise<CodeDriver> {
    const d = new CodeDriver(s, resolve(cwd));
    d.hljs = await importRuntime("highlight.js");
    const css = readFileSync(requireFile("highlight.js", "styles/github-dark.css"), "utf8");
    await s.page.setContent(`<!doctype html><meta charset=utf-8><style>${css}
      html,body{margin:0;height:100%;background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif}
      #wrap{display:flex;height:100%}#side{width:360px;background:#010409;border-right:1px solid #30363d;padding:22px 18px;overflow:hidden;font:20px/1.55 ui-monospace,monospace;color:#9da7b3;white-space:pre}
      #side b{color:#f59e0b}#main{flex:1;display:flex;flex-direction:column;min-width:0}
      #title{padding:16px 28px;background:#161b22;border-bottom:1px solid #30363d;font:600 22px ui-monospace,monospace;color:#e6edf3}
      #code{flex:1;overflow:hidden;padding:18px 0;font:24px/1.6 'DejaVu Sans Mono',Menlo,Consolas,monospace;position:relative}
      .ln{display:flex;white-space:pre;transition:opacity .45s,background .45s}.n{width:78px;flex:none;text-align:right;padding-right:22px;color:#6e7681;user-select:none}
      .c{flex:1;padding-right:30px}.dim .ln{opacity:.28}.dim .ln.hl{opacity:1;background:rgba(245,158,11,.16);box-shadow:inset 4px 0 #f59e0b}
    </style><div id=wrap><div id=side></div><div id=main><div id=title></div><div id=code></div></div></div>`);
    await s.page.evaluate(() => ((document.getElementById("side") as HTMLElement).style.display = "none"));
    return d;
  }

  go(): number { return this.s.go(); }
  close(): ReturnType<BrowserSurface["close"]> { return this.s.close(); }

  private tree(dir: string, depth = 0, out: string[] = []): string[] {
    if (depth > 2 || out.length > 34) return out;
    for (const name of readdirSync(dir).sort()) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      const isDir = statSync(full).isDirectory();
      out.push(`${"  ".repeat(depth)}${isDir ? name + "/" : name}`);
      if (isDir) this.tree(full, depth + 1, out);
      if (out.length > 34) break;
    }
    return out;
  }

  private async showFile(path: string): Promise<void> {
    const full = resolve(this.cwd, path);
    const code = readFileSync(full, "utf8").replace(/\t/g, "  ");
    const lang = LANG[extname(full).toLowerCase()];
    const html = lang && this.hljs.getLanguage(lang) ? this.hljs.highlight(code, { language: lang }).value : esc(code);
    const rows = splitLines(html).map((l, i) => `<div class=ln data-n=${i + 1}><span class=n>${i + 1}</span><span class=c>${l || " "}</span></div>`).join("");
    this.file = relative(this.cwd, full);
    this.lineCount = rows.split("class=ln").length - 1;
    await this.s.page.evaluate(([r, name]: [string, string]) => {
      (document.getElementById("code") as HTMLElement).innerHTML = r;
      (document.getElementById("code") as HTMLElement).classList.remove("dim");
      (document.getElementById("title") as HTMLElement).textContent = name;
    }, [rows, this.file] as [string, string]);
    await this.s.pause(1500);
  }

  private async focusLines(a: number, b: number): Promise<void> {
    await this.s.page.evaluate(([from, to]: [number, number]) => {
      const code = document.getElementById("code") as HTMLElement;
      code.classList.add("dim");
      code.querySelectorAll(".ln").forEach((el) => el.classList.toggle("hl", Number((el as HTMLElement).dataset["n"]) >= from && Number((el as HTMLElement).dataset["n"]) <= to));
      const mid = code.querySelector(`.ln[data-n="${Math.round((from + to) / 2)}"]`) as HTMLElement | null;
      if (mid) code.scrollTo({ top: Math.max(0, mid.offsetTop - code.clientHeight / 2), behavior: "smooth" });
    }, [a, b] as [number, number]);
    await this.s.pause(2200);
  }

  async run(step: DemoStep, verb: string): Promise<StepOutcome> {
    const val = step[verb];
    const out: StepOutcome = {};
    switch (verb) {
      case "open": await this.showFile(String(val)); if (typeof step["lines"] === "string") await this.range(step["lines"]); break;
      case "lines": case "scrollTo": await this.range(String(val)); break;
      case "highlight": {
        const needle = String(val);
        const n = await this.s.page.evaluate((t: string) => { const el = [...document.querySelectorAll(".ln")].find((e) => (e.textContent ?? "").includes(t)); return el ? Number((el as HTMLElement).dataset["n"]) : 0; }, needle);
        if (!n) throw new Error(`highlight: "${needle}" not found in ${this.file || "(no file open)"}`);
        await this.focusLines(n, n);
        break;
      }
      case "tree": {
        const dir = resolve(this.cwd, String(val || "."));
        const text = this.tree(dir).map((l) => esc(l)).join("\n");
        await this.s.page.evaluate((t: string) => { const s = document.getElementById("side") as HTMLElement; s.style.display = "block"; s.innerHTML = t; }, text);
        await this.s.pause(2000);
        break;
      }
      case "wait": case "pause": await this.s.pause(Number(val) * 1000); break;
      case "note": out.note = String(val); break;
      default: throw new Error(`step "${verb}" is not available in code scenes (use open, lines, highlight, tree, wait)`);
    }
    out.text = await this.s.visibleText();
    return out;
  }

  private async range(spec: string): Promise<void> {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(spec.trim());
    if (!m?.[1]) throw new Error(`lines: "${spec}" is not like 10-24`);
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b > this.lineCount || a > b) throw new Error(`lines: ${spec} is outside ${this.file} (${this.lineCount} lines)`);
    await this.focusLines(a, b);
  }
}
