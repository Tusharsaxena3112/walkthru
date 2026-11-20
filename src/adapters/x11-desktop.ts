import type { Clock, Ocr, RecordingHandle, ScreenRecorder, Terminal, Windows } from "../ports/desktop.js";
import type { Shell } from "../ports/shell.js";

export class WmctrlWindows implements Windows {
  constructor(private readonly shell: Shell) {}
  async activate(match: string): Promise<boolean> {
    const found = await this.shell.run("wmctrl", ["-a", match]);
    if (found.code !== 0) return false;
    await this.shell.run("wmctrl", ["-r", match, "-b", "add,maximized_vert,maximized_horz"]);
    return true;
  }
}

export class TmuxTerminal implements Terminal {
  constructor(private readonly shell: Shell, private readonly clock: Clock) {}
  async type(session: string, text: string): Promise<boolean> {
    const has = await this.shell.run("tmux", ["has-session", "-t", session]);
    if (has.code !== 0) return false;
    for (const ch of text) {
      await this.shell.run("tmux", ["send-keys", "-t", session, "-l", "--", ch]);
      await this.clock.sleep(45); // readable typing speed on camera
    }
    await this.clock.sleep(800);
    return (await this.shell.run("tmux", ["send-keys", "-t", session, "Enter"])).code === 0;
  }
}

export class X11Recorder implements ScreenRecorder {
  constructor(private readonly shell: Shell, private readonly display: string, private readonly clock: Clock) {}
  async start(args: { out: string; size: string; fps: number }): Promise<RecordingHandle> {
    const proc = this.shell.startBackground("ffmpeg", [
      "-nostdin", "-loglevel", "error", "-y", "-f", "x11grab", "-framerate", String(args.fps), "-video_size", args.size, "-i", this.display,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", args.out,
    ]);
    await this.clock.sleep(1000); // let ffmpeg open the display before step 0
    return proc;
  }
}

export class TesseractOcr implements Ocr {
  constructor(private readonly shell: Shell) {}
  async available(): Promise<boolean> {
    return (await this.shell.run("which", ["tesseract"])).code === 0;
  }
  async read(imagePath: string): Promise<string> {
    const r = await this.shell.run("tesseract", [imagePath, "stdout"]);
    return r.code === 0 ? r.stdout : "";
  }
}

export const systemClock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
