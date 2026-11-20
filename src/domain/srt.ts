export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Speaking rate used to estimate how long a narration line takes. */
export const WORDS_PER_SECOND = 2.4;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateSpeechSeconds(text: string): number {
  return wordCount(text) / WORDS_PER_SECOND;
}

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function formatSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}

export function formatClock(seconds: number): string {
  return stamp(seconds).slice(0, 8);
}
