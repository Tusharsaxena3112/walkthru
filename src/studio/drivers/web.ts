import type { SceneDriver, StepOutcome } from "../../ports/driver.js";
import { type DemoStep, interpolate } from "../../storyboard/demo.js";
import { BrowserSurface } from "../surface.js";

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export class WebDriver implements SceneDriver {
  constructor(
    protected readonly s: BrowserSurface,
    private readonly baseUrl: string | undefined,
    private readonly env: Record<string, string>,
  ) {}

  go(): number { return this.s.go(); }
  close(): ReturnType<BrowserSurface["close"]> { return this.s.close(); }

  private url(t: string): string {
    if (/^https?:\/\//.test(t) || t.startsWith("data:") || t.startsWith("file:")) return t;
    if (!this.baseUrl) throw new Error(`go: "${t}" is relative but the storyboard has no baseUrl`);
    return new URL(t, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).toString();
  }

  async run(step: DemoStep, verb: string, now: () => number): Promise<StepOutcome> {
    const s = this.s;
    const t0 = now();
    const out: StepOutcome = {};
    const val = step[verb];
    const text = (v: unknown): string => interpolate(str(v), this.env);
    const mark = (r: { healed?: { wanted: string; used: string } }): void => { if (r.healed) out.healed = r.healed; };
    switch (verb) {
      case "go": {
        await s.page.goto(this.url(text(val)), { waitUntil: "domcontentloaded", timeout: 60000 });
        await s.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
        await s.pause(1200);
        break;
      }
      case "click": { const r = await s.locate(text(val), "click"); mark(r); await s.click(r.loc); break; }
      case "hover": { const r = await s.locate(text(val), "click"); mark(r); await s.hover(r.loc); await s.pause(900); break; }
      case "type": {
        const into = step["into"];
        if (typeof into === "string") { const r = await s.locate(into, "field"); mark(r); await s.type(r.loc, text(val)); } else await s.type(null, text(val));
        break;
      }
      case "press": await s.page.keyboard.press(text(val)); await s.pause(600); break;
      case "select": {
        const r = await s.locate(text(step["in"] ?? ""), "field"); mark(r);
        await s.hover(r.loc); await r.loc.selectOption({ label: text(val) }); await s.pause(600); break;
      }
      case "scroll": await s.scroll(Number(val) || 500); break;
      case "wait": {
        if (typeof val === "number") await s.pause(val * 1000);
        else {
          const w = text(val);
          await s.page.getByText(w).first().waitFor({ state: "visible", timeout: Number(step["timeout"] ?? 60) * 1000 });
        }
        break;
      }
      case "highlight": case "zoom": { const r = await s.locate(text(val), "click"); mark(r); await s.emphasise(r.loc); break; }
      case "blur": await s.blur(text(val)); break;
      case "note": out.note = text(val); break;
      default: throw new Error(`step "${verb}" is not available in web scenes`);
    }
    if (step["idle"] === true || now() - t0 > 4 && verb !== "wait") out.idle = { start: t0, end: now() };
    else if (verb === "wait" && typeof val !== "number" && now() - t0 > 3) out.idle = { start: t0, end: now() };
    out.text = await s.visibleText();
    return out;
  }
}
