export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BackgroundProcess {
  /** Sends SIGINT (so ffmpeg finalises the file) and waits for exit. */
  stop(): Promise<void>;
}

export interface Shell {
  /** Runs a command with stdin closed; never invokes a shell, arguments are passed as given. */
  run(cmd: string, args: string[]): Promise<RunResult>;
  startBackground(cmd: string, args: string[]): BackgroundProcess;
}
