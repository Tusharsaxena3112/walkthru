import { parse } from "yaml";
import { z } from "zod";
import type { Mark } from "../domain/cut-plan.js";
import type { FileStore } from "../ports/files.js";
import { type ParseResult, parseStoryboard } from "./schema.js";

export async function loadStoryboard(files: FileStore, path: string): Promise<ParseResult> {
  let text: string;
  try {
    text = await files.readText(path);
  } catch {
    return { ok: false, reason: `cannot read ${path}` };
  }
  try {
    return parseStoryboard(parse(text));
  } catch {
    return { ok: false, reason: `${path} is not valid YAML` };
  }
}

const marksSchema = z.array(z.object({ name: z.string().min(1), at: z.number().min(0) }));

export async function loadMarks(files: FileStore, path: string): Promise<{ ok: true; marks: Mark[] } | { ok: false; reason: string }> {
  try {
    const parsed = marksSchema.safeParse(JSON.parse(await files.readText(path)));
    return parsed.success ? { ok: true, marks: parsed.data } : { ok: false, reason: `${path} is not a marks file` };
  } catch {
    return { ok: false, reason: `cannot read ${path}` };
  }
}
