import type { Interval } from "./intervals.js";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
}

export interface ProbeInfo {
  duration: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width: number | null;
  height: number | null;
}

export interface VerifyInput {
  probe: ProbeInfo;
  silences: Interval[];
  maxSilence: number;
  /** Narration seconds estimated from a storyboard, when one is given. */
  expectedNarrationSeconds: number | null;
  sensitiveHits: { at: number; pattern: string }[];
}

export function buildFindings(input: VerifyInput): Finding[] {
  const out: Finding[] = [];
  const { probe } = input;
  if (!probe.hasVideo) out.push({ severity: "error", code: "no-video", message: "No video stream." });
  if (!probe.hasAudio) {
    out.push({ severity: "warning", code: "no-audio", message: "No audio track (fine for a silent master, not for a finished video)." });
  } else {
    for (const s of input.silences) {
      const len = s.end - s.start;
      if (len > input.maxSilence) {
        out.push({
          severity: "warning",
          code: "long-silence",
          message: `${len.toFixed(1)}s of silence at ${s.start.toFixed(1)}s-${s.end.toFixed(1)}s (limit ${input.maxSilence}s).`,
        });
      }
    }
    if (input.expectedNarrationSeconds !== null) {
      const silent = input.silences.reduce((sum, s) => sum + (s.end - s.start), 0);
      const speech = probe.duration - silent;
      const ratio = speech / input.expectedNarrationSeconds;
      if (ratio < 0.6 || ratio > 1.6) {
        out.push({
          severity: "warning",
          code: "narration-length",
          message: `Detected speech is ${speech.toFixed(0)}s but the storyboard narration is about ${input.expectedNarrationSeconds.toFixed(0)}s; the voice-over may be missing or out of sync.`,
        });
      }
    }
  }
  if (probe.width !== null && probe.height !== null && (probe.width < 1280 || probe.height < 720)) {
    out.push({ severity: "warning", code: "low-resolution", message: `Resolution ${probe.width}x${probe.height} is below 1280x720.` });
  }
  for (const hit of input.sensitiveHits) {
    out.push({ severity: "error", code: "sensitive-text", message: `On-screen text matching "${hit.pattern}" at about ${hit.at.toFixed(0)}s.` });
  }
  return out;
}

/** Returns which patterns occur (case-insensitive, literal) in OCR text. */
export function findSensitive(text: string, patterns: string[]): string[] {
  const lower = text.toLowerCase();
  return patterns.filter((p) => p !== "" && lower.includes(p.toLowerCase()));
}
