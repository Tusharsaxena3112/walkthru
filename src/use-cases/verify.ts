import { estimateSpeechSeconds } from "../domain/srt.js";
import { type Finding, buildFindings, findSensitive } from "../domain/verify.js";
import type { Storyboard } from "../storyboard/schema.js";
import type { FileStore } from "../ports/files.js";
import type { MediaTool } from "../ports/media.js";
import type { Ocr } from "../ports/desktop.js";

export interface VerifyArgs {
  input: string;
  maxSilence: number;
  noiseDb: number;
  storyboard: Storyboard | null;
  /** Literal strings that must not appear on screen (hostnames, tokens, real emails). */
  sensitive: string[];
  ocrEverySeconds: number;
}

export interface VerifyReport {
  duration: number;
  hasAudio: boolean;
  findings: Finding[];
  ocrRan: boolean;
}

export async function verify(
  deps: { media: MediaTool; files: FileStore; ocr: Ocr },
  args: VerifyArgs,
): Promise<VerifyReport> {
  const probe = await deps.media.probe(args.input);
  const silences = probe.hasAudio ? await deps.media.detectSilences(args.input, args.noiseDb, 1, probe.duration) : [];
  const expected = args.storyboard
    ? args.storyboard.clips.reduce((sum, c) => sum + estimateSpeechSeconds(c.narration), 0)
    : null;

  const hits: { at: number; pattern: string }[] = [];
  let ocrRan = false;
  if (args.sensitive.length > 0 && probe.hasVideo && (await deps.ocr.available())) {
    ocrRan = true;
    const dir = await deps.files.makeTempDir("walkthru-verify-");
    try {
      await deps.media.extractFrames(args.input, args.ocrEverySeconds, dir);
      const frames = (await deps.files.listFiles(dir)).sort();
      const seen = new Set<string>();
      for (const [i, frame] of frames.entries()) {
        const text = await deps.ocr.read(`${dir}/${frame}`);
        for (const pattern of findSensitive(text, args.sensitive)) {
          if (seen.has(pattern)) continue; // report the first sighting of each pattern
          seen.add(pattern);
          hits.push({ at: i * args.ocrEverySeconds, pattern });
        }
      }
    } finally {
      await deps.files.remove(dir);
    }
  }

  const findings = buildFindings({
    probe,
    silences: silences.filter((s) => s.end - s.start >= args.maxSilence),
    maxSilence: args.maxSilence,
    expectedNarrationSeconds: expected,
    sensitiveHits: hits,
  });
  if (args.sensitive.length > 0 && !ocrRan) {
    findings.push({
      severity: "info",
      code: "ocr-unavailable",
      message: "Sensitive-text check skipped: install tesseract (sudo apt install tesseract-ocr) or check frames by eye.",
    });
  }
  return { duration: probe.duration, hasAudio: probe.hasAudio, findings, ocrRan };
}
