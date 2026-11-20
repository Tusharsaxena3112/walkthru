import type { Interval } from "../domain/intervals.js";
import type { ProbeInfo } from "../domain/verify.js";

export interface EncodeSegmentArgs {
  src: string;
  start: number;
  end: number;
  /** 1 keeps the source audio; >1 speeds the video up and writes silent audio. */
  speed: number;
  fps: number;
  out: string;
}

export interface MediaTool {
  probe(path: string): Promise<ProbeInfo>;
  detectSilences(path: string, noiseDb: number, minSeconds: number, duration: number): Promise<Interval[]>;
  detectScenes(path: string, threshold: number): Promise<number[]>;
  encodeSegment(args: EncodeSegmentArgs): Promise<void>;
  concat(files: string[], out: string, listFile: string): Promise<void>;
  cutClip(src: string, start: number, end: number, out: string, fps: number): Promise<void>;
  blur(src: string, filterGraph: string, out: string): Promise<void>;
  extractFrames(src: string, everySeconds: number, dir: string): Promise<void>;
}
