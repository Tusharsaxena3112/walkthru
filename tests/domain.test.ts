import { describe, expect, it } from "vitest";
import { clipRanges, snapMarks } from "../src/domain/cut-plan.js";
import { parseSceneTimes, parseSilences, speechFromSilences } from "../src/domain/intervals.js";
import { buildBlurFilter, parseBox } from "../src/domain/redact.js";
import { estimateSpeechSeconds, formatSrt } from "../src/domain/srt.js";
import { DEFAULT_TIGHTEN, outputLength, planTighten } from "../src/domain/tighten-plan.js";
import { buildFindings, findSensitive } from "../src/domain/verify.js";
import { parseStoryboard } from "../src/storyboard/schema.js";

describe("silence parsing", () => {
  const stderr = "[silencedetect] silence_start: 4.4\n[silencedetect] silence_end: 9.1 | silence_duration: 4.7\n[silencedetect] silence_start: 20";
  it("pairs starts and ends and closes an unterminated silence at the duration", () => {
    expect(parseSilences(stderr, 30)).toEqual([{ start: 4.4, end: 9.1 }, { start: 20, end: 30 }]);
  });
  it("clamps a negative start to zero (ffmpeg emits those at the very beginning)", () => {
    expect(parseSilences("silence_start: -0.02\nsilence_end: 1.5", 10)).toEqual([{ start: 0, end: 1.5 }]);
  });
  it("derives speech as the complement", () => {
    expect(speechFromSilences([{ start: 4, end: 9 }, { start: 20, end: 30 }], 30)).toEqual([{ start: 0, end: 4 }, { start: 9, end: 20 }]);
  });
  it("parses scene times from showinfo output", () => {
    expect(parseSceneTimes("n:0 pts:1 pts_time:117.2 pos:3\nn:1 pts_time:267.7 ")).toEqual([117.2, 267.7]);
  });
});

describe("planTighten", () => {
  const o = DEFAULT_TIGHTEN; // minGap 3, keep 1.2, lead 0.8, speed 4
  it("speeds up only the middle of a long silence", () => {
    const segs = planTighten([{ start: 10, end: 30 }], 40, o);
    expect(segs).toEqual([
      { start: 0, end: 11.2, speed: 1 },
      { start: 11.2, end: 29.2, speed: 4 },
      { start: 29.2, end: 40, speed: 1 },
    ]);
  });
  it("leaves short silences alone and covers the whole video without overlap", () => {
    const segs = planTighten([{ start: 5, end: 6.5 }, { start: 10, end: 30 }], 40, o);
    expect(segs[0]?.start).toBe(0);
    expect(segs.at(-1)?.end).toBe(40);
    segs.slice(1).forEach((s, i) => expect(s.start).toBeCloseTo(segs[i]?.end ?? -1, 6));
  });
  it("does not speed up a silence whose fast part would be under a second", () => {
    expect(planTighten([{ start: 10, end: 12.9 }], 20, { ...o, minGap: 2 })).toEqual([{ start: 0, end: 20, speed: 1 }]);
  });
  it("lets a trailing silence run to the end without a lead", () => {
    const segs = planTighten([{ start: 30, end: 40 }], 40, o);
    expect(segs.at(-1)).toEqual({ start: 31.2, end: 40, speed: 4 });
  });
  it("shortens the output", () => {
    const segs = planTighten([{ start: 10, end: 30 }], 40, o);
    expect(outputLength(segs)).toBeCloseTo(11.2 + 18 / 4 + 10.8, 6);
  });
});

describe("cut plan", () => {
  it("snaps a mark to the first scene change after it, not an earlier one", () => {
    const out = snapMarks([{ name: "a", at: 10 }], [8, 11.5, 12], 4);
    expect(out[0]?.at).toBe(11.5);
  });
  it("keeps the mark when no scene change is close enough", () => {
    expect(snapMarks([{ name: "a", at: 10 }], [30], 4)[0]?.at).toBe(10);
  });
  it("makes consecutive ranges ending at the total", () => {
    expect(clipRanges([{ name: "b", at: 5 }, { name: "a", at: 0 }], 12)).toEqual([
      { name: "a", start: 0, end: 5 }, { name: "b", start: 5, end: 12 },
    ]);
  });
});

describe("redact", () => {
  it("parses boxes and rejects malformed ones", () => {
    expect(parseBox("10,20,300,40")).toEqual({ x: 10, y: 20, w: 300, h: 40 });
    expect(parseBox("10,20,300,40,5,9")).toEqual({ x: 10, y: 20, w: 300, h: 40, from: 5, to: 9 });
    for (const bad of ["", "1,2,3", "a,b,c,d", "10,20,0,40", "10,20,30,40,9,5", "-1,0,5,5"]) expect(parseBox(bad)).toBeNull();
  });
  it("builds a time-limited overlay", () => {
    const g = buildBlurFilter([{ x: 1, y: 2, w: 3, h: 4, from: 5, to: 6 }]);
    expect(g).toContain("crop=3:4:1:2");
    expect(g).toContain("enable='between(t,5,6)'");
    expect(g.endsWith("[v]")).toBe(true);
  });
});

describe("srt", () => {
  it("formats cues with millisecond stamps", () => {
    expect(formatSrt([{ start: 1.5, end: 3725.25, text: "hello" }])).toBe("1\n00:00:01,500 --> 01:02:05,250\nhello\n");
  });
  it("estimates speech at 2.4 words per second", () => {
    expect(estimateSpeechSeconds("one two three four five six")).toBeCloseTo(2.5, 6);
  });
});

describe("verify findings", () => {
  const probe = { duration: 100, hasAudio: true, hasVideo: true, width: 1920, height: 1080 };
  it("flags long silences, a missing track, low resolution and sensitive text", () => {
    const f = buildFindings({
      probe: { ...probe, width: 640, height: 360 }, silences: [{ start: 10, end: 20 }], maxSilence: 4,
      expectedNarrationSeconds: null, sensitiveHits: [{ at: 30, pattern: "host-x" }],
    });
    expect(f.map((x) => x.code).sort()).toEqual(["long-silence", "low-resolution", "sensitive-text"]);
    expect(buildFindings({ probe: { ...probe, hasAudio: false }, silences: [], maxSilence: 4, expectedNarrationSeconds: null, sensitiveHits: [] }).map((x) => x.code)).toEqual(["no-audio"]);
  });
  it("flags a voice-over far shorter than the storyboard narration", () => {
    const f = buildFindings({ probe, silences: [{ start: 0, end: 95 }], maxSilence: 400, expectedNarrationSeconds: 60, sensitiveHits: [] });
    expect(f.map((x) => x.code)).toEqual(["narration-length"]);
  });
  it("matches sensitive text literally and case-insensitively", () => {
    expect(findSensitive("Host: FiftyFive-ThinkPad", ["fiftyfive-thinkpad", "zzz", ""])).toEqual(["fiftyfive-thinkpad"]);
  });
});

describe("storyboard schema", () => {
  const base = { title: "t", terminal: "demo", clips: [{ id: "1A", steps: [{ do: "wait", seconds: 2 }] }] };
  it("accepts a valid storyboard and applies defaults", () => {
    const r = parseStoryboard(base);
    expect(r.ok && r.storyboard.size).toBe("1920x1080");
  });
  it("rejects duplicate clip ids, unsafe ids, unknown steps and type steps with no terminal", () => {
    expect(parseStoryboard({ ...base, clips: [{ id: "a" }, { id: "a" }] }).ok).toBe(false);
    expect(parseStoryboard({ ...base, clips: [{ id: "../x" }] }).ok).toBe(false);
    expect(parseStoryboard({ ...base, clips: [{ id: "a", steps: [{ do: "rm" }] }] }).ok).toBe(false);
    const noTerm = { title: "t", clips: [] };
    expect(parseStoryboard({ ...noTerm, clips: [{ id: "a", steps: [{ do: "type", text: "ls" }] }] }).ok).toBe(false);
  });
});
