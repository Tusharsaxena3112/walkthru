export interface SyncClock {
  /** Seconds since the scene's video started. */
  now(): number;
  sleep(seconds: number): Promise<void>;
}

export interface SpeechCue {
  text: string;
  /** Audio file (or "" when the narrator is silent). */
  audio: string;
  start: number;
  end: number;
}

/**
 * Audio-first sync: the recorder asks the track for permission to start each sentence.
 * A sentence never starts before the previous one has finished (plus a small gap) and
 * the action it describes begins `lead` seconds after speech starts, so speech never overlaps itself
 * and the screen never runs behind the voice by more than `lead`.
 */
export class SpeechTrack {
  readonly cues: SpeechCue[] = [];
  private busyUntil = 0;

  constructor(
    private readonly clock: SyncClock,
    private readonly gap = 0.35,
    readonly lead = 0.7,
  ) {}

  async say(text: string, audio: string, durationSeconds: number): Promise<SpeechCue> {
    const wait = this.cues.length === 0 ? 0 : this.busyUntil + this.gap - this.clock.now();
    if (wait > 0) await this.clock.sleep(wait);
    const start = this.clock.now();
    const cue: SpeechCue = { text, audio, start, end: start + durationSeconds };
    this.cues.push(cue);
    this.busyUntil = cue.end;
    if (this.lead > 0) await this.clock.sleep(this.lead);
    return cue;
  }

  /** Waits until the last sentence has finished, plus a short tail. */
  async drain(tail = 0.6): Promise<void> {
    const wait = this.busyUntil + tail - this.clock.now();
    if (wait > 0) await this.clock.sleep(wait);
  }
}
