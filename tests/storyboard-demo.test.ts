import { describe, expect, it } from "vitest";
import { interpolate, parseDemo, verbOf } from "../src/storyboard/demo.js";
import { splitLines } from "../src/studio/drivers/code.js";

const base = { title: "T", scenes: [{ id: "a", steps: [{ go: "/" }, { say: "Hi." }] }] };

describe("parseDemo", () => {
  it("accepts a minimal storyboard and fills defaults", () => {
    const r = parseDemo(base);
    expect(r.ok && r.demo.voice.provider).toBe("piper");
    expect(r.ok && r.demo.viewport.width).toBe(1920);
  });
  it("rejects duplicate scene ids, unknown verbs and empty scenes", () => {
    expect(parseDemo({ ...base, scenes: [base.scenes[0], base.scenes[0]] })).toMatchObject({ ok: false });
    expect(parseDemo({ ...base, scenes: [{ id: "a", steps: [{ dance: 1 }] }] })).toMatchObject({ ok: false });
    expect(parseDemo({ ...base, scenes: [] })).toMatchObject({ ok: false });
  });
  it("finds the verb of a step with modifiers", () => {
    expect(verbOf({ type: "x", into: "Email" })).toBe("type");
  });
});

describe("helpers", () => {
  it("interpolates known env names only", () => {
    expect(interpolate("a ${X} ${Y}", { X: "1" })).toBe("a 1 ${Y}");
  });
  it("splits highlighted html into balanced lines", () => {
    const lines = splitLines('<span class="c">/* a\nb */</span>\nx');
    expect(lines).toEqual(['<span class="c">/* a</span>', '<span class="c">b */</span>', "x"]);
  });
});
