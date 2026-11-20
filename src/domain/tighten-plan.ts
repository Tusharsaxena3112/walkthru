import type { Interval } from "./intervals.js";

export interface Segment {
  start: number;
  end: number;
  /** 1 = normal speed with audio; >1 = sped-up video with silent audio. */
  speed: number;
}

export interface TightenOptions {
  /** Silences at least this long are candidates for speed-up (seconds). */
  minGap: number;
  /** Seconds of a silence kept at normal speed right after speech. */
  keep: number;
  /** Seconds kept at normal speed right before the next speech. */
  lead: number;
  speed: number;
}

export const DEFAULT_TIGHTEN: TightenOptions = { minGap: 3, keep: 1.2, lead: 0.8, speed: 4 };

/**
 * Plans segments covering [0, duration]. Speech and short pauses stay at 1x; the middle of each long silence plays
 * at `speed`. A silence is only sped up if the sped part is at least 1 second long, so tiny gaps are left alone.
 */
export function planTighten(silences: Interval[], duration: number, opts: TightenOptions): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  const push = (start: number, end: number, speed: number): void => {
    if (end - start < 0.001) return;
    const last = segments[segments.length - 1];
    if (last && last.speed === speed && Math.abs(last.end - start) < 0.001) last.end = end;
    else segments.push({ start, end, speed });
  };
  for (const s of silences) {
    const length = s.end - s.start;
    const fastStart = s.start + opts.keep;
    const fastEnd = s.end >= duration - 0.05 ? s.end : s.end - opts.lead;
    if (length < opts.minGap || fastEnd - fastStart < 1) continue;
    push(cursor, fastStart, 1);
    push(fastStart, fastEnd, opts.speed);
    cursor = fastEnd;
  }
  push(cursor, duration, 1);
  return segments;
}

export function outputLength(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start) / s.speed, 0);
}
