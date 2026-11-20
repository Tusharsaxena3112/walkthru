import type { Interval } from "./intervals.js";

export interface RampPiece {
  start: number;
  end: number;
  speed: number;
}

/** Normalises idle intervals (sorted, merged, clipped to [0,total], at least `minLength` long). */
export function normaliseIdle(idle: Interval[], total: number, minLength = 2): Interval[] {
  const sorted = idle
    .map((i) => ({ start: Math.max(0, i.start), end: Math.min(total, i.end) }))
    .filter((i) => i.end - i.start >= minLength)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Splits [0,total] into pieces: normal speed outside idle intervals, `speed`x inside them. */
export function rampPieces(idle: Interval[], total: number, speed: number): RampPiece[] {
  const pieces: RampPiece[] = [];
  let cursor = 0;
  for (const i of idle) {
    if (i.start > cursor) pieces.push({ start: cursor, end: i.start, speed: 1 });
    pieces.push({ start: i.start, end: i.end, speed });
    cursor = i.end;
  }
  if (cursor < total) pieces.push({ start: cursor, end: total, speed: 1 });
  return pieces;
}

/** Maps a source time to the time it will have in the sped-up output. */
export function mapTime(pieces: RampPiece[], t: number): number {
  let out = 0;
  for (const p of pieces) {
    if (t >= p.end) out += (p.end - p.start) / p.speed;
    else {
      if (t > p.start) out += (t - p.start) / p.speed;
      break;
    }
  }
  return out;
}

export function rampedLength(pieces: RampPiece[]): number {
  return pieces.reduce((n, p) => n + (p.end - p.start) / p.speed, 0);
}
