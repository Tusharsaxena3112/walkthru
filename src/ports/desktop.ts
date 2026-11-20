export interface Windows {
  /** Brings the first window whose title contains `match` to the front, maximised. */
  activate(match: string): Promise<boolean>;
}

export interface Terminal {
  /** Types `text` into a tmux session one character at a time, then presses Enter. */
  type(session: string, text: string): Promise<boolean>;
}

export interface RecordingHandle {
  stop(): Promise<void>;
}

export interface ScreenRecorder {
  start(args: { out: string; size: string; fps: number }): Promise<RecordingHandle>;
}

export interface Clock {
  /** Milliseconds from a monotonic source. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface Ocr {
  available(): Promise<boolean>;
  read(imagePath: string): Promise<string>;
}
