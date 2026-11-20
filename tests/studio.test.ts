import { describe, expect, it } from "vitest";
import { SpeechTrack } from "../src/domain/sync.js";
import { mapTime, normaliseIdle, rampPieces, rampedLength } from "../src/domain/ramp.js";
import { cursorPath, rng, typingDelays } from "../src/domain/motion.js";
import { findErrorBanner, scanSecrets } from "../src/domain/secrets.js";
import { bestMatch, similarity } from "../src/domain/heal.js";

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (s: number) => { t += s; }, advance: (s: number) => { t += s; } };
}

describe("SpeechTrack", () => {
  it("never overlaps sentences and lets the action follow speech by `lead`", async () => {
    const clock = fakeClock();
    const track = new SpeechTrack(clock, 0.3, 0.5);
    const a = await track.say("one", "a.wav", 4);
    expect(a.start).toBe(0);
    expect(clock.now()).toBeCloseTo(0.5);
    clock.advance(1); // action takes 1s; sentence still speaking
    const b = await track.say("two", "b.wav", 2);
    expect(b.start).toBeCloseTo(4.3); // waits for sentence one to finish + gap
    expect(b.start).toBeGreaterThanOrEqual(a.end);
    await track.drain(0.5);
    expect(clock.now()).toBeGreaterThanOrEqual(b.end + 0.5);
  });
});

describe("ramp", () => {
  it("speeds idle regions and maps times", () => {
    const idle = normaliseIdle([{ start: 10, end: 20 }, { start: 19, end: 30 }, { start: 40, end: 41 }], 60);
    expect(idle).toEqual([{ start: 10, end: 30 }]); // merged; 1s idle dropped
    const pieces = rampPieces(idle, 60, 5);
    expect(rampedLength(pieces)).toBeCloseTo(10 + 4 + 30);
    expect(mapTime(pieces, 5)).toBeCloseTo(5);
    expect(mapTime(pieces, 40)).toBeCloseTo(10 + 4 + 10);
  });
});

describe("motion", () => {
  it("ends exactly on target and eases", () => {
    const pts = cursorPath({ x: 0, y: 0 }, { x: 800, y: 400 }, rng(7));
    expect(pts[pts.length - 1]).toEqual({ x: 800, y: 400 });
    expect(pts.length).toBeGreaterThan(10);
  });
  it("types with varied but bounded delays", () => {
    const d = typingDelays("hello, world", 60, rng(3));
    expect(d).toHaveLength(12);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(18);
    expect(new Set(d).size).toBeGreaterThan(3);
  });
});

describe("secrets", () => {
  it("flags key shapes and the user's own secret values, masked", () => {
    const f = scanSecrets("token AKIAABCDEFGHIJKLMNOP and hunter2secret", ["hunter2secret"]);
    expect(f.map((x) => x.kind).sort()).toEqual(["aws-access-key", "env-secret"]);
    expect(JSON.stringify(f)).not.toContain("hunter2secret");
  });
  it("finds error banners", () => {
    expect(findErrorBanner("Oops. Something went wrong")).toBeTruthy();
    expect(findErrorBanner("All good")).toBeNull();
  });
});

describe("heal", () => {
  it("picks the nearest label", () => {
    const { best } = bestMatch("Sign in", [{ index: 0, name: "Log in" }, { index: 1, name: "Sign in with email" }, { index: 2, name: "Help" }]);
    expect(best?.candidate.index).toBe(1);
    expect(similarity("save", "cancel")).toBe(0);
  });
});
