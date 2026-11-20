import { type Segment, type TightenOptions, outputLength, planTighten } from "../domain/tighten-plan.js";
import type { FileStore } from "../ports/files.js";
import type { MediaTool } from "../ports/media.js";

export interface TightenArgs {
  input: string;
  output: string;
  options: TightenOptions;
  noiseDb: number;
  fps: number;
}

export type TightenResult =
  | { ok: true; before: number; after: number; segments: Segment[] }
  | { ok: false; reason: string };

/**
 * Keeps narration at normal speed and speeds up the long silent stretches between lines. Each segment is encoded on
 * its own and the pieces are joined afterwards: one big filter graph over a long 1080p video can exhaust memory.
 */
export async function tighten(deps: { media: MediaTool; files: FileStore }, args: TightenArgs): Promise<TightenResult> {
  const probe = await deps.media.probe(args.input);
  if (!probe.hasVideo) return { ok: false, reason: "The input has no video stream." };
  if (!probe.hasAudio) return { ok: false, reason: "The input has no audio track; add the voice-over first, then tighten." };

  const silences = await deps.media.detectSilences(args.input, args.noiseDb, args.options.minGap, probe.duration);
  const segments = planTighten(silences, probe.duration, args.options);
  const work = await deps.files.makeTempDir("walkthru-tighten-");
  try {
    const parts: string[] = [];
    for (const [i, seg] of segments.entries()) {
      const out = `${work}/part-${String(i).padStart(3, "0")}.mp4`;
      await deps.media.encodeSegment({ src: args.input, start: seg.start, end: seg.end, speed: seg.speed, fps: args.fps, out });
      parts.push(out);
    }
    await deps.media.concat(parts, args.output, `${work}/list.txt`);
  } finally {
    await deps.files.remove(work);
  }
  return { ok: true, before: probe.duration, after: outputLength(segments), segments };
}
