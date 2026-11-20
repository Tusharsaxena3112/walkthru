import { z } from "zod";

const windowStep = z.object({ do: z.literal("window"), match: z.string().min(1) });
const typeStep = z.object({
  do: z.literal("type"),
  text: z.string().min(1),
  /** tmux session to type into; defaults to the storyboard's `terminal`. */
  session: z.string().min(1).optional(),
});
const waitStep = z.object({ do: z.literal("wait"), seconds: z.number().positive().max(600) });

export const stepSchema = z.discriminatedUnion("do", [windowStep, typeStep, waitStep]);

export const clipSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, "clip id may only contain letters, digits, _ and -"),
  narration: z.string().default(""),
  steps: z.array(stepSchema).default([]),
});

export const storyboardSchema = z.object({
  title: z.string().min(1),
  size: z.string().regex(/^\d+x\d+$/).default("1920x1080"),
  fps: z.number().int().min(5).max(60).default(30),
  /** tmux session used by `type` steps that name none. */
  terminal: z.string().min(1).optional(),
  /** Seconds to keep recording after the last step. */
  tail: z.number().min(0).max(60).default(3),
  clips: z.array(clipSchema).min(1),
});

export type Step = z.infer<typeof stepSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Storyboard = z.infer<typeof storyboardSchema>;

export type ParseResult = { ok: true; storyboard: Storyboard } | { ok: false; reason: string };

/** Validates a parsed YAML/JSON value; duplicate clip ids are rejected so clip files cannot overwrite each other. */
export function parseStoryboard(value: unknown): ParseResult {
  const parsed = storyboardSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `${issue?.path.join(".") || "storyboard"}: ${issue?.message ?? "invalid"}` };
  }
  const ids = parsed.data.clips.map((c) => c.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return { ok: false, reason: `clips: duplicate id "${dup}"` };
  for (const clip of parsed.data.clips) {
    for (const step of clip.steps) {
      if (step.do === "type" && !step.session && !parsed.data.terminal) {
        return { ok: false, reason: `clip ${clip.id}: a type step needs a session or a storyboard-level terminal` };
      }
    }
  }
  return { ok: true, storyboard: parsed.data };
}
