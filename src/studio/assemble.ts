import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ffmpeg, probeDuration } from "../adapters/media-run.js";
import { mapTime, normaliseIdle, rampPieces, rampedLength } from "../domain/ramp.js";
import { formatSrt, type Cue } from "../domain/srt.js";
import type { Demo } from "../storyboard/demo.js";
import { interpolate } from "../storyboard/demo.js";
import { outDir } from "./paths.js";
import { clipFile, readJson } from "./project.js";
import type { SceneRecord } from "./runner.js";
import type { AudioInfo } from "./voice.js";

const FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"];
const FONTS_R = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "C:/Windows/Fonts/arial.ttf"];
const font = (list: string[]): string => { const f = list.find((p) => existsSync(p)); return f ? `fontfile='${f.replace(/:/g, "\\:")}':` : ""; };
const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’").replace(/%/g, "\\%");
const venc = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"];
const aenc = ["-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"];

export interface BuiltScene {
  id: string;
  title: string;
  start: number;
  length: number;
  cues: Cue[];
}

function mixGraph(starts: number[], firstInput: number, length: number): string {
  if (!starts.length) return `anullsrc=r=44100:cl=stereo,atrim=0:${length.toFixed(3)}[aout]`;
  return starts.map((t, k) => `[${firstInput + k}:a]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[a${k}]`).join(";") + ";" +
    starts.map((_, k) => `[a${k}]`).join("") + `amix=inputs=${starts.length}:normalize=0:duration=longest,apad,atrim=0:${length.toFixed(3)}[aout]`;
}

async function card(demo: Demo, id: "intro" | "outro", audio: Map<string, AudioInfo>, env: Record<string, string>, out: string): Promise<{ length: number; cues: Cue[] }> {
  const c = demo[id];
  if (!c) throw new Error("no card");
  const say = c.say ? interpolate(c.say, env) : "";
  const a = say ? audio.get(say) : undefined;
  const length = Math.max(c.seconds ?? 5, a ? a.seconds + 2.2 : 0);
  const [W, H] = [demo.viewport.width, demo.viewport.height];
  const lines = [
    `drawtext=${font(FONTS)}text='${esc(c.title)}':fontsize=${Math.round(H / 11)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-${Math.round(H / 14)}`,
    ...(c.sub ? [`drawtext=${font(FONTS_R)}text='${esc(c.sub)}':fontsize=${Math.round(H / 28)}:fontcolor=0xf59e0b:x=(w-text_w)/2:y=(h/2)+${Math.round(H / 14)}`] : []),
    ...(c.bullets ?? []).map((b, i) => `drawtext=${font(FONTS_R)}text='${esc("•  " + b)}':fontsize=${Math.round(H / 32)}:fontcolor=0xd0d7de:x=(w-text_w)/2:y=(h/2)+${Math.round(H / 7) + i * Math.round(H / 18)}`),
    `fade=t=in:st=0:d=0.8`, `fade=t=out:st=${(length - 0.8).toFixed(2)}:d=0.8`,
  ].join(",");
  const start = 0.9;
  const inputs = a ? ["-i", a.file] : [];
  await ffmpeg(["-f", "lavfi", "-i", `color=c=0x0f172a:s=${W}x${H}:d=${length.toFixed(3)}:r=30`, ...inputs, "-filter_complex", `[0:v]${lines}[v];${mixGraph(a ? [start] : [], 1, length)}`, "-map", "[v]", "-map", "[aout]", ...venc, ...aenc, "-t", length.toFixed(3), out]);
  return { length, cues: a ? [{ start, end: start + a.seconds, text: say }] : [] };
}

async function sceneVideo(demo: Demo, id: string, rec: SceneRecord, out: string): Promise<{ length: number; cues: Cue[] }> {
  const src = clipFile(id, "webm");
  const total = (await probeDuration(src)) - rec.offset;
  // idle stretches are sped up, but never while someone is speaking over them
  const talking = rec.cues.map((c) => ({ start: c.start - 0.25, end: c.end + 0.25 }));
  const idle = normaliseIdle(rec.idle, total, 2.5).flatMap((i) => {
    let parts = [i];
    for (const t of talking) parts = parts.flatMap((p) => (t.end <= p.start || t.start >= p.end ? [p] : [{ start: p.start, end: Math.max(p.start, t.start) }, { start: Math.min(p.end, t.end), end: p.end }].filter((x) => x.end - x.start >= 2.5)));
    return parts;
  });
  const pieces = rampPieces(idle, total, 6);
  const length = rampedLength(pieces) + 1;
  const [W, H] = [demo.viewport.width, demo.viewport.height];
  const vparts = pieces.map((p, k) => `[0:v]trim=start=${(rec.offset + p.start).toFixed(3)}:end=${(rec.offset + p.end).toFixed(3)},setpts=(PTS-STARTPTS)/${p.speed}[p${k}]`);
  const vf = `${vparts.join(";")};${pieces.map((_, k) => `[p${k}]`).join("")}concat=n=${pieces.length}:v=1:a=0,scale=${W}:${H}:flags=lanczos,tpad=stop_mode=clone:stop_duration=1,fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0, length - 0.4).toFixed(2)}:d=0.4[v]`;
  const starts = rec.cues.map((c) => mapTime(pieces, c.start));
  await ffmpeg(["-i", src, ...rec.cues.flatMap((c) => ["-i", c.audio]), "-filter_complex", `${vf};${mixGraph(starts, 1, length)}`, "-map", "[v]", "-map", "[aout]", ...venc, ...aenc, "-t", length.toFixed(3), out]);
  return { length, cues: rec.cues.map((c, i) => ({ start: starts[i] ?? 0, end: (starts[i] ?? 0) + (c.end - c.start), text: c.text })) };
}

export async function assemble(demo: Demo, audio: Map<string, AudioInfo>, env: Record<string, string>, log: (m: string) => void): Promise<{ file: string; scenes: BuiltScene[]; seconds: number }> {
  const seg = resolve(outDir(), "seg");
  const files: string[] = [];
  const scenes: BuiltScene[] = [];
  let clock = 0;
  const push = async (id: string, title: string, file: string, r: { length: number; cues: Cue[] }): Promise<void> => {
    const real = await probeDuration(file);
    scenes.push({ id, title, start: clock, length: real, cues: r.cues.map((c) => ({ ...c, start: c.start + clock, end: c.end + clock })) });
    clock += real; files.push(file);
    log(`  built ${id}: ${real.toFixed(1)}s`);
  };
  if (demo.intro) await push("intro", demo.intro.title, resolve(seg, "intro.mp4"), await card(demo, "intro", audio, env, resolve(seg, "intro.mp4")));
  for (const s of demo.scenes) {
    const out = resolve(seg, `${s.id}.mp4`);
    if (s.mode === "card" && s.card) {
      throw new Error(`scene ${s.id}: card scenes are not supported yet (use intro/outro)`);
    }
    const rec = readJson<SceneRecord | null>(clipFile(s.id, "json"), null);
    if (!rec || !existsSync(clipFile(s.id, "webm"))) throw new Error(`scene ${s.id} has not been recorded (run walkthru record)`);
    await push(s.id, s.title ?? s.id, out, await sceneVideo(demo, s.id, rec, out));
  }
  if (demo.outro) await push("outro", demo.outro.title, resolve(seg, "outro.mp4"), await card(demo, "outro", audio, env, resolve(seg, "outro.mp4")));
  const list = resolve(seg, "list.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const file = resolve(outDir(), "walkthru.mp4");
  const meta = resolve(outDir(), "chapters.txt");
  writeFileSync(meta, ";FFMETADATA1\n" + scenes.map((s) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(s.start * 1000)}\nEND=${Math.round((s.start + s.length) * 1000)}\ntitle=${s.title}\n`).join("\n"));
  const loud = "loudnorm=I=-16:TP=-1.5:LRA=11";
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", meta, "-map_metadata", "1", "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", loud, ...aenc, "-movflags", "+faststart", file]);
  const cues = scenes.flatMap((s) => s.cues);
  writeFileSync(resolve(outDir(), "captions.srt"), formatSrt(cues));
  await ffmpeg(["-ss", String(Math.min(clock / 3, 12)), "-i", file, "-frames:v", "1", "-vf", "scale=1280:-1", resolve(outDir(), "thumbnail.png")]);
  await ffmpeg(["-i", file, "-t", "8", "-vf", "fps=8,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-an", resolve(outDir(), "preview.gif")]).catch(() => log("  (gif preview skipped)"));
  return { file, scenes, seconds: await probeDuration(file) };
}
