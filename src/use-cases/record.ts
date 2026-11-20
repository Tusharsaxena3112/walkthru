import type { Mark } from "../domain/cut-plan.js";
import type { Clock, ScreenRecorder, Terminal, Windows } from "../ports/desktop.js";
import type { FileStore } from "../ports/files.js";
import type { Storyboard } from "../storyboard/schema.js";

export interface RecordArgs {
  storyboard: Storyboard;
  outDir: string;
  /** Seconds of stillness before the first step so the first clip starts on a clean frame. */
  lead: number;
}

export type RecordResult = { ok: true; raw: string; marks: Mark[] } | { ok: false; reason: string };

/**
 * Runs the storyboard steps while the screen is recorded. A mark is written when each clip's first step is issued.
 * If any step fails, recording stops and the failure is reported; nothing is retried silently.
 */
export async function record(
  deps: { recorder: ScreenRecorder; windows: Windows; terminal: Terminal; clock: Clock; files: FileStore },
  args: RecordArgs,
): Promise<RecordResult> {
  const { storyboard } = args;
  await deps.files.makeDir(args.outDir);
  const raw = `${args.outDir}/raw.mp4`;
  const handle = await deps.recorder.start({ out: raw, size: storyboard.size, fps: storyboard.fps });
  const t0 = deps.clock.now();
  const marks: Mark[] = [];
  let failure: string | null = null;
  try {
    await deps.clock.sleep(args.lead * 1000);
    for (const clip of storyboard.clips) {
      marks.push({ name: clip.id, at: (deps.clock.now() - t0) / 1000 });
      for (const step of clip.steps) {
        if (step.do === "wait") {
          await deps.clock.sleep(step.seconds * 1000);
        } else if (step.do === "window") {
          if (!(await deps.windows.activate(step.match))) throw new Error(`no window matching "${step.match}"`);
        } else {
          const session = step.session ?? storyboard.terminal;
          if (!session || !(await deps.terminal.type(session, step.text))) {
            throw new Error(`could not type into tmux session "${session ?? ""}"`);
          }
        }
      }
    }
    await deps.clock.sleep(storyboard.tail * 1000);
  } catch (e) {
    failure = `Clip failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await handle.stop();
  }
  if (failure) return { ok: false, reason: failure };
  await deps.files.writeText(`${args.outDir}/marks.json`, JSON.stringify(marks, null, 2));
  return { ok: true, raw, marks };
}
