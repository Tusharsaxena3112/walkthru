const tokens = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** 0..1 similarity between a wanted label and a candidate label (token overlap, substring bonus). */
export function similarity(want: string, have: string): number {
  const a = tokens(want);
  const b = tokens(have);
  if (a.length === 0 || b.length === 0) return 0;
  const hit = a.filter((t) => b.includes(t)).length;
  let score = hit / Math.max(a.length, b.length);
  const w = a.join(" ");
  const h = b.join(" ");
  if (h.includes(w) || w.includes(h)) score = Math.max(score, 0.6 + 0.4 * (Math.min(w.length, h.length) / Math.max(w.length, h.length)));
  return Math.min(1, score);
}

export interface Candidate {
  index: number;
  name: string;
}

export interface Match {
  candidate: Candidate;
  score: number;
}

/** Best candidate at or above `threshold`, plus the top suggestions for error messages. */
export function bestMatch(want: string, candidates: Candidate[], threshold = 0.5): { best: Match | null; top: Match[] } {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: similarity(want, candidate.name) }))
    .sort((x, y) => y.score - x.score);
  const first = ranked[0];
  return { best: first && first.score >= threshold ? first : null, top: ranked.slice(0, 6) };
}
