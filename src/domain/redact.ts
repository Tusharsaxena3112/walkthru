export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  from?: number;
  to?: number;
}

/** Parses "x,y,w,h" or "x,y,w,h,from,to"; returns null when malformed. */
export function parseBox(spec: string): Box | null {
  const parts = spec.split(",").map((p) => Number(p.trim()));
  if ((parts.length !== 4 && parts.length !== 6) || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h, from, to] = parts as [number, number, number, number, number | undefined, number | undefined];
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  if (from !== undefined && to !== undefined) {
    if (from < 0 || to <= from) return null;
    return { x, y, w, h, from, to };
  }
  return { x, y, w, h };
}

/** ffmpeg filter graph that blurs each box (optionally only between `from` and `to` seconds). */
export function buildBlurFilter(boxes: Box[], strength = 20): string {
  const lines: string[] = [];
  let label = "0:v";
  boxes.forEach((b, i) => {
    const enable = b.from !== undefined && b.to !== undefined ? `:enable='between(t,${b.from},${b.to})'` : "";
    lines.push(
      `[${label}]split[base${i}][src${i}]`,
      `[src${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},boxblur=${strength}:3[blur${i}]`,
      `[base${i}][blur${i}]overlay=${b.x}:${b.y}${enable}[o${i}]`,
    );
    label = `o${i}`;
  });
  return lines.join(";") + `;[${label}]null[v]`;
}
