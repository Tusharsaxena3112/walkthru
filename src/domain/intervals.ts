export interface Interval {
  start: number;
  end: number;
}

const SILENCE_RE = /silence_(start|end): (-?[\d.]+)/g;
const SCENE_RE = /pts_time:([\d.]+)/g;

/** Parses ffmpeg `silencedetect` stderr into silent intervals; an unterminated silence runs to `duration`. */
export function parseSilences(stderr: string, duration: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(SILENCE_RE)) {
    const value = Number(m[2]);
    if (m[1] === "start") {
      open = Math.max(0, value);
    } else if (open !== null) {
      out.push({ start: open, end: Math.min(value, duration) });
      open = null;
    }
  }
  if (open !== null && open < duration) out.push({ start: open, end: duration });
  return out;
}

/** Parses ffmpeg `select=gt(scene,x),showinfo` stderr into scene-change timestamps. */
export function parseSceneTimes(stderr: string): number[] {
  return [...stderr.matchAll(SCENE_RE)].map((m) => Number(m[1]));
}

/** Complement of `silences` inside [0, duration]. */
export function speechFromSilences(silences: Interval[], duration: number): Interval[] {
  const out: Interval[] = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start > cursor) out.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration) out.push({ start: cursor, end: duration });
  return out;
}

export function totalLength(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}
