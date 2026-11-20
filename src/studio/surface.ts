/* eslint-disable @typescript-eslint/no-explicit-any */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cursorPath, rng, typingDelays } from "../domain/motion.js";
import { bestMatch } from "../domain/heal.js";
import { outDir } from "./paths.js";
import { importRuntime } from "./runtime.js";

export const CURSOR_JS = `(() => {
  if (window.__cur) return; window.__cur = 1; let c;
  const mk = () => { const d = document.createElement('div'); d.id = '__cursor';
    d.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;margin:-3px 0 0 -3px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    d.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(d); return d };
  const ensure = () => { if (!c || !c.isConnected) c = mk(); return c };
  addEventListener('mousemove', e => { ensure().style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)' }, true);
  addEventListener('mousedown', e => { const r = document.createElement('div');
    r.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #f59e0b;border-radius:50%;width:12px;height:12px;left:' + (e.clientX - 6) + 'px;top:' + (e.clientY - 6) + 'px;transition:all .5s ease-out;opacity:.95';
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.width = '60px'; r.style.height = '60px'; r.style.left = (e.clientX - 30) + 'px'; r.style.top = (e.clientY - 30) + 'px'; r.style.opacity = '0' });
    setTimeout(() => r.remove(), 700) }, true);
})()`;

export interface SurfaceOptions {
  id: string;
  viewport: { width: number; height: number };
  theme?: "light" | "dark" | undefined;
  storage?: Record<string, string>;
  record: boolean;
  /** Rehearsal: no video, no human pacing. */
  fast: boolean;
  cursor?: boolean;
}

/** A Playwright page that records itself and moves like a person. Shared by web, terminal and code scenes. */
export class BrowserSurface {
  private pos = { x: 960, y: 540 };
  private offset = 0;
  private readonly created = Date.now();
  readonly errors: string[] = [];
  private readonly random = rng(42);

  private constructor(
    readonly page: any,
    private readonly ctx: any,
    private readonly browser: any,
    private readonly opts: SurfaceOptions,
  ) {
    page.on("pageerror", (e: Error) => this.errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  }

  static async open(opts: SurfaceOptions): Promise<BrowserSurface> {
    const pw: any = await importRuntime("playwright");
    const dir = resolve(outDir(), "clips-raw", opts.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const browser = await pw.chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
    const ctx = await browser.newContext({
      viewport: opts.viewport,
      ...(opts.record ? { recordVideo: { dir, size: opts.viewport } } : {}),
      ...(opts.theme ? { colorScheme: opts.theme } : {}),
    });
    const storage = { ...(opts.storage ?? {}) };
    if (Object.keys(storage).length) {
      await ctx.addInitScript((kv: Record<string, string>) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch { /* storage blocked */ } }, storage);
    }
    if (opts.cursor !== false && !opts.fast) await ctx.addInitScript(CURSOR_JS);
    const page = await ctx.newPage();
    return new BrowserSurface(page, ctx, browser, opts);
  }

  get fast(): boolean { return this.opts.fast; }
  pause(ms: number): Promise<void> { return this.fast ? Promise.resolve() : this.page.waitForTimeout(ms); }
  /** Marks where the visible part of the video starts. */
  go(): number {
    this.offset = Math.max(0, (Date.now() - this.created) / 1000 - 0.15);
    return this.offset;
  }

  async moveTo(x: number, y: number): Promise<void> {
    if (this.fast) { this.pos = { x, y }; return; }
    for (const p of cursorPath(this.pos, { x, y }, this.random)) {
      await this.page.mouse.move(p.x, p.y);
      await this.page.waitForTimeout(9);
    }
    this.pos = { x, y };
  }

  async hover(loc: any): Promise<void> {
    await loc.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);
    const b = await loc.boundingBox();
    if (b) await this.moveTo(b.x + b.width * (0.4 + this.random() * 0.2), b.y + b.height * (0.4 + this.random() * 0.2));
  }

  async click(loc: any): Promise<void> {
    await this.hover(loc);
    await this.pause(260);
    await loc.click({ timeout: 15000 });
    await this.pause(650);
  }

  async type(loc: any | null, text: string): Promise<void> {
    if (loc) { await this.click(loc); }
    if (this.fast) { await this.page.keyboard.type(text); return; }
    const delays = typingDelays(text, 58, this.random);
    let i = 0;
    for (const ch of text) { await this.page.keyboard.type(ch); await this.page.waitForTimeout(delays[i++] ?? 55); }
    await this.pause(450);
  }

  async scroll(dy: number): Promise<void> {
    const steps = this.fast ? 1 : Math.max(6, Math.round(Math.abs(dy) / 80));
    for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await this.pause(70); }
    await this.pause(500);
  }

  /** Find the element a sentence like "Sign in" refers to; heals to the closest on-screen label when nothing matches. */
  async locate(target: string, kind: "click" | "field", timeoutMs = 8000): Promise<{ loc: any; healed?: { wanted: string; used: string } }> {
    const p = this.page;
    const css = /^[#.[]|[>:]|^[a-z]+\[/.test(target);
    const make = (): any[] => css ? [p.locator(target)] : kind === "field"
      ? [p.getByLabel(target), p.getByPlaceholder(target), p.getByRole("textbox", { name: target }), p.getByRole("combobox", { name: target }), p.locator(`[name="${target}"]`)]
      : [p.getByRole("button", { name: target }), p.getByRole("link", { name: target }), p.getByRole("tab", { name: target }), p.getByRole("menuitem", { name: target }), p.getByLabel(target), p.getByText(target)];
    const deadline = Date.now() + timeoutMs;
    do {
      for (const c of make()) {
        const v = c.filter({ visible: true });
        if ((await v.count().catch(() => 0)) > 0) return { loc: v.first() };
      }
      await p.waitForTimeout(250);
    } while (Date.now() < deadline);
    const sel = "button,a,[role=button],[role=tab],[role=menuitem],input,textarea,select,summary,label";
    const names: string[] = await p.evaluate((s: string) => [...document.querySelectorAll(s)].map((e: any) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? (e.getAttribute("aria-label") || e.innerText || e.placeholder || e.value || e.name || "").trim().slice(0, 80) : "";
    }), sel);
    const { best, top } = bestMatch(target, names.map((name, index) => ({ index, name })).filter((c) => c.name));
    if (best) return { loc: p.locator(sel).nth(best.candidate.index), healed: { wanted: target, used: best.candidate.name } };
    throw new Error(`could not find "${target}" on ${p.url()}. Closest on screen: ${top.slice(0, 5).map((m) => `"${m.candidate.name}"`).join(", ") || "(nothing interactive)"}`);
  }

  async visibleText(max = 6000): Promise<string> {
    return ((await this.page.evaluate(() => document.body?.innerText ?? "").catch(() => "")) as string).slice(0, max);
  }

  async emphasise(loc: any): Promise<void> {
    await loc.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);
    await loc.evaluate((el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "__hl";
      box.style.cssText = `position:fixed;left:${r.left - 8}px;top:${r.top - 8}px;width:${r.width + 16}px;height:${r.height + 16}px;border:3px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);z-index:2147483640;pointer-events:none;transition:opacity .4s`;
      document.documentElement.appendChild(box);
    });
    await this.pause(1800);
    await this.page.evaluate(() => document.querySelectorAll(".__hl").forEach((n) => n.remove()));
    await this.pause(250);
  }

  async blur(selectorOrText: string): Promise<void> {
    await this.page.evaluate((t: string) => {
      let els: Element[] = [];
      try { els = [...document.querySelectorAll(t)]; } catch { /* not a selector */ }
      if (!els.length) els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && (e.textContent ?? "").includes(t));
      els.forEach((e) => ((e as HTMLElement).style.filter = "blur(10px)"));
    }, selectorOrText);
  }

  async close(): Promise<{ clip: string; offset: number; errors: string[] }> {
    let clip = "";
    if (this.opts.record) {
      const v = this.page.video();
      await this.ctx.close();
      const src = await v.path();
      clip = resolve(outDir(), "clips", `${this.opts.id}.webm`);
      mkdirSync(resolve(outDir(), "clips"), { recursive: true });
      copyFileSync(src, clip);
      writeFileSync(resolve(outDir(), "clips", `${this.opts.id}.offset`), String(this.offset));
    } else await this.ctx.close();
    await this.browser.close();
    return { clip, offset: this.offset, errors: this.errors };
  }
}
