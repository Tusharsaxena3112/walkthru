import { z } from "zod";

/** One step = one verb key plus optional modifiers. Parsed loosely, then validated per mode by the drivers. */
const step = z.record(z.string(), z.unknown()).refine((s) => Object.keys(s).length > 0, "empty step");

const voice = z.object({
  provider: z.enum(["piper", "elevenlabs", "none", "tone"]).default("piper"),
  /** ElevenLabs voice id or Piper model name. */
  id: z.string().optional(),
  /** Playback tempo; <1 slows the voice. */
  tempo: z.number().min(0.6).max(1.3).default(0.92),
});

const card = z.object({ title: z.string(), sub: z.string().optional(), bullets: z.array(z.string()).optional() });

const scene = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().optional(),
  mode: z.enum(["web", "terminal", "code", "card"]).optional(),
  card: card.optional(),
  /** Steps run before the visible part starts (logins, loading); trimmed from the video. */
  setup: z.array(step).default([]),
  steps: z.array(step).default([]),
  /** Working directory for terminal and code scenes (defaults to the storyboard's). */
  cwd: z.string().optional(),
});

export const demoSchema = z.object({
  title: z.string().min(1),
  mode: z.enum(["web", "terminal", "code"]).default("web"),
  baseUrl: z.string().optional(),
  theme: z.enum(["light", "dark"]).optional(),
  /** localStorage entries set before every page loads (e.g. an app's own theme key). */
  storage: z.record(z.string(), z.string()).default({}),
  viewport: z.object({ width: z.number().int().min(640), height: z.number().int().min(480) }).default({ width: 1920, height: 1080 }),
  voice: voice.default({ provider: "piper", tempo: 0.92 }),
  cwd: z.string().optional(),
  /** Environment variable names (from .env.demo) whose values must never appear on screen or in narration. */
  secrets: z.array(z.string()).default([]),
  intro: card.extend({ say: z.string().optional(), seconds: z.number().optional() }).optional(),
  outro: card.extend({ say: z.string().optional(), seconds: z.number().optional() }).optional(),
  scenes: z.array(scene).min(1),
});

export type DemoStep = z.infer<typeof step>;
export type DemoScene = z.infer<typeof scene>;
export type Demo = z.infer<typeof demoSchema>;

export type DemoParse = { ok: true; demo: Demo } | { ok: false; reason: string };

const VERBS = ["go", "click", "hover", "type", "press", "scroll", "select", "wait", "highlight", "zoom", "unzoom", "blur", "say", "note", "run", "key", "clear", "open", "lines", "scrollTo", "tree", "pause"];

export function parseDemo(value: unknown): DemoParse {
  const r = demoSchema.safeParse(value);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, reason: `${i?.path.join(".") || "demo"}: ${i?.message ?? "invalid"}` };
  }
  const ids = r.data.scenes.map((s) => s.id);
  const dup = ids.find((id, n) => ids.indexOf(id) !== n);
  if (dup) return { ok: false, reason: `scenes: duplicate id "${dup}"` };
  for (const s of r.data.scenes) {
    for (const [phase, list] of [["setup", s.setup], ["steps", s.steps]] as const) {
      for (const [n, st] of list.entries()) {
        const verb = verbOf(st);
        if (!verb) return { ok: false, reason: `scene ${s.id} ${phase}[${n}]: no known verb (${VERBS.join(", ")}); got keys ${Object.keys(st).join(", ")}` };
      }
    }
    if (s.mode === "card" && !s.card) return { ok: false, reason: `scene ${s.id}: card scenes need a card: {title}` };
  }
  return { ok: true, demo: r.data };
}

export function verbOf(st: DemoStep): string | undefined {
  return VERBS.find((v) => v in st);
}

/** Replaces ${NAME} with env values; unknown names are left alone so mistakes stay visible. */
export function interpolate(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, name: string) => env[name] ?? m);
}
