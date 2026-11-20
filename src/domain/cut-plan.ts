export interface Mark {
  name: string;
  /** Seconds since the recording started. */
  at: number;
}

/**
 * Snaps each mark to the nearest scene change within `tolerance` seconds. Marks are written when a step is issued,
 * but the window switch shows on screen slightly later, so the scene change is the truthful cut point.
 */
export function snapMarks(marks: Mark[], sceneTimes: number[], tolerance: number): Mark[] {
  return marks.map((mark) => {
    let best: number | null = null;
    for (const t of sceneTimes) {
      if (t < mark.at - 0.5) continue; // the visible change never precedes the step
      const d = Math.abs(t - mark.at);
      if (d <= tolerance && (best === null || d < Math.abs(best - mark.at))) best = t;
    }
    return { name: mark.name, at: best ?? mark.at };
  });
}

export interface ClipRange {
  name: string;
  start: number;
  end: number;
}

/** Turns consecutive clip-start marks into ranges; the last clip ends at `total`. */
export function clipRanges(starts: Mark[], total: number): ClipRange[] {
  const sorted = [...starts].sort((a, b) => a.at - b.at);
  return sorted.map((m, i) => ({ name: m.name, start: m.at, end: sorted[i + 1]?.at ?? total }));
}
