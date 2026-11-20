export interface Point {
  x: number;
  y: number;
}

/** Small deterministic PRNG so motion is reproducible in tests. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Points along a gently curved, eased path from a to b (inclusive), with a slight overshoot-and-settle at the end. */
export function cursorPath(a: Point, b: Point, random: () => number = Math.random): Point[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(8, Math.min(60, Math.round(dist / 18)));
  const nx = dist === 0 ? 0 : -(b.y - a.y) / dist;
  const ny = dist === 0 ? 0 : (b.x - a.x) / dist;
  const bend = (random() - 0.5) * Math.min(120, dist * 0.25);
  const c: Point = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  if (dist > 250) {
    const over = Math.min(10, dist * 0.02);
    const ux = (b.x - a.x) / dist;
    const uy = (b.y - a.y) / dist;
    pts.splice(-1, 1, { x: b.x + ux * over, y: b.y + uy * over }, { x: b.x, y: b.y });
  }
  return pts;
}

/** Milliseconds to wait after each typed character: steady rhythm, jitter, slightly longer after spaces and punctuation. */
export function typingDelays(text: string, base = 60, random: () => number = Math.random): number[] {
  return [...text].map((ch) => {
    const jitter = (random() - 0.5) * base * 0.8;
    const extra = ch === " " ? base * 0.5 : /[.,;:!?@]/.test(ch) ? base * 1.2 : 0;
    return Math.max(18, Math.round(base + jitter + extra));
  });
}
