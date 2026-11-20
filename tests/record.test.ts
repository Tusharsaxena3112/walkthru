import { describe, expect, it } from "vitest";
import type { Clock, ScreenRecorder, Terminal, Windows } from "../src/ports/desktop.js";
import type { FileStore } from "../src/ports/files.js";
import { parseStoryboard } from "../src/storyboard/schema.js";
import { record } from "../src/use-cases/record.js";

function setup(windowsOk: boolean) {
  const log: string[] = [];
  let now = 0;
  const clock: Clock = { now: () => now, sleep: async (ms) => { now += ms; } };
  const written = new Map<string, string>();
  const files = {
    makeDir: async () => undefined,
    writeText: async (p: string, c: string) => { written.set(p, c); },
  } as unknown as FileStore;
  const recorder: ScreenRecorder = { start: async () => ({ stop: async () => { log.push("stop"); } }) };
  const windows: Windows = { activate: async (m) => { log.push(`window:${m}`); return windowsOk; } };
  const terminal: Terminal = { type: async (s, t) => { log.push(`type:${s}:${t}`); return true; } };
  return { log, written, deps: { recorder, windows, terminal, clock, files } };
}

const sb = (() => {
  const r = parseStoryboard({
    title: "t", terminal: "demo", tail: 2,
    clips: [
      { id: "1A", steps: [{ do: "window", match: "Dash" }, { do: "wait", seconds: 10 }] },
      { id: "2A", steps: [{ do: "type", text: "ls" }, { do: "wait", seconds: 5 }] },
    ],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.storyboard;
})();

describe("record", () => {
  it("marks each clip when its first step is issued and always stops the recorder", async () => {
    const { log, written, deps } = setup(true);
    const r = await record(deps, { storyboard: sb, outDir: "out", lead: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.marks).toEqual([{ name: "1A", at: 3 }, { name: "2A", at: 13 }]);
    expect(log).toEqual(["window:Dash", "type:demo:ls", "stop"]);
    expect(written.get("out/marks.json")).toContain('"2A"');
  });
  it("stops recording and reports a failed step instead of continuing", async () => {
    const { log, written, deps } = setup(false);
    const r = await record(deps, { storyboard: sb, outDir: "out", lead: 3 });
    expect(r).toEqual({ ok: false, reason: 'Clip failed: no window matching "Dash"' });
    expect(log).toEqual(["window:Dash", "stop"]);
    expect(written.size).toBe(0);
  });
});
