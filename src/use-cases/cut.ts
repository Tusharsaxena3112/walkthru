import { type ClipRange, type Mark, clipRanges, snapMarks } from "../domain/cut-plan.js";
import { formatClock, formatSrt, estimateSpeechSeconds, type Cue } from "../domain/srt.js";
import type { Storyboard } from "../storyboard/schema.js";
import type { FileStore } from "../ports/files.js";
import type { MediaTool } from "../ports/media.js";

export interface CutArgs {
  raw: string;
  marks: Mark[];
  storyboard: Storyboard | null;
  outDir: string;
  sceneThreshold: number;
  snapTolerance: number;
}

export interface CutResult {
  clips: ClipRange[];
  master: string;
}

/**
 * Cuts the raw capture into one file per clip at scene-detected boundaries, joins them into a master, and writes the
 * narration script and SRT timed to that master (each line starts 1s after its clip and is bounded by the clip end).
 */
export async function cut(deps: { media: MediaTool; files: FileStore }, args: CutArgs): Promise<CutResult> {
  const probe = await deps.media.probe(args.raw);
  const scenes = await deps.media.detectScenes(args.raw, args.sceneThreshold);
  const snapped = snapMarks(args.marks, scenes, args.snapTolerance);
  const clips = clipRanges(snapped, probe.duration);

  const clipsDir = `${args.outDir}/clips`;
  await deps.files.makeDir(clipsDir);
  const fps = 30;
  const files: string[] = [];
  for (const c of clips) {
    const out = `${clipsDir}/${c.name}.mp4`;
    await deps.media.cutClip(args.raw, c.start, c.end, out, fps);
    files.push(out);
  }
  const master = `${args.outDir}/master.mp4`;
  await deps.media.concat(files, master, `${args.outDir}/clips.txt`);

  if (args.storyboard) {
    const cues: Cue[] = [];
    const lines: string[] = [`# ${args.storyboard.title}: narration timed to master.mp4`, ""];
    let at = 0;
    for (const c of clips) {
      const len = c.end - c.start;
      const clip = args.storyboard.clips.find((s) => s.id === c.name);
      if (clip?.narration) {
        const want = estimateSpeechSeconds(clip.narration);
        const start = at + 1;
        const end = Math.min(start + want, at + len);
        cues.push({ start, end, text: clip.narration });
        const over = want > len - 1 ? "  (narration longer than the clip: shorten it or hold the last frame)" : "";
        lines.push(`## ${c.name}   [${formatClock(at)} - ${formatClock(at + len)}]  (${len.toFixed(0)}s clip, narration about ${want.toFixed(0)}s)${over}`, clip.narration, "");
      }
      at += len;
    }
    await deps.files.writeText(`${args.outDir}/narration.md`, lines.join("\n"));
    await deps.files.writeText(`${args.outDir}/script.srt`, formatSrt(cues));
  }
  return { clips, master };
}
