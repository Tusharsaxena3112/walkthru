import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { type Interval, parseSceneTimes, parseSilences } from "../domain/intervals.js";
import type { ProbeInfo } from "../domain/verify.js";
import type { EncodeSegmentArgs, MediaTool } from "../ports/media.js";
import type { Shell } from "../ports/shell.js";

const probeSchema = z.object({
  format: z.object({ duration: z.string().optional() }),
  streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })),
});

const X264 = ["-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p"];
const AAC = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"];

export class FfmpegMedia implements MediaTool {
  constructor(private readonly shell: Shell) {}

  private async ffmpeg(args: string[]): Promise<string> {
    // -nostdin: ffmpeg must never read the terminal, which breaks loops and background runs.
    const r = await this.shell.run("ffmpeg", ["-nostdin", "-hide_banner", "-y", ...args]);
    if (r.code !== 0) throw new Error(`ffmpeg failed (exit ${r.code}): ${r.stderr.split("\n").slice(-4).join(" ").trim()}`);
    return r.stderr;
  }

  async probe(path: string): Promise<ProbeInfo> {
    const r = await this.shell.run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path]);
    if (r.code !== 0) throw new Error(`ffprobe could not read ${path}`);
    const parsed = probeSchema.parse(JSON.parse(r.stdout));
    const video = parsed.streams.find((s) => s.codec_type === "video");
    return {
      duration: Number(parsed.format.duration ?? 0),
      hasVideo: video !== undefined,
      hasAudio: parsed.streams.some((s) => s.codec_type === "audio"),
      width: video?.width ?? null,
      height: video?.height ?? null,
    };
  }

  async detectSilences(path: string, noiseDb: number, minSeconds: number, duration: number): Promise<Interval[]> {
    const stderr = await this.ffmpeg(["-i", path, "-vn", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSeconds}`, "-f", "null", "-"]);
    return parseSilences(stderr, duration);
  }

  async detectScenes(path: string, threshold: number): Promise<number[]> {
    const stderr = await this.ffmpeg(["-i", path, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"]);
    return parseSceneTimes(stderr);
  }

  async encodeSegment(a: EncodeSegmentArgs): Promise<void> {
    const range = ["-ss", a.start.toFixed(3), "-to", a.end.toFixed(3), "-i", a.src];
    if (a.speed === 1) {
      await this.ffmpeg([...range, "-map", "0:v:0", "-map", "0:a:0", "-r", String(a.fps), ...X264, ...AAC, a.out]);
      return;
    }
    const outSeconds = ((a.end - a.start) / a.speed).toFixed(3);
    await this.ffmpeg([
      ...range, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-map", "0:v:0", "-map", "1:a:0", "-vf", `setpts=PTS/${a.speed}`, "-r", String(a.fps), "-t", outSeconds,
      ...X264, ...AAC, a.out,
    ]);
  }

  async concat(files: string[], out: string, listFile: string): Promise<void> {
    const body = files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n");
    await writeFile(listFile, body, "utf8");
    await this.ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);
  }

  async cutClip(src: string, start: number, end: number, out: string, fps: number): Promise<void> {
    await this.ffmpeg(["-ss", start.toFixed(3), "-to", end.toFixed(3), "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-r", String(fps), ...X264, ...AAC, out]);
  }

  async blur(src: string, filterGraph: string, out: string): Promise<void> {
    await this.ffmpeg(["-i", src, "-filter_complex", filterGraph, "-map", "[v]", "-map", "0:a?", ...X264, "-c:a", "copy", out]);
  }

  async extractFrames(src: string, everySeconds: number, dir: string): Promise<void> {
    await this.ffmpeg(["-i", src, "-an", "-vf", `fps=1/${everySeconds}`, `${dir}/f-%05d.png`]);
  }
}
