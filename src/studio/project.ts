import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { type Demo, parseDemo } from "../storyboard/demo.js";
import { demoDir, outDir, projectRoot, storyboardPath } from "./paths.js";

export function loadDemo(file = storyboardPath()): Demo {
  if (!existsSync(file)) throw new Error(`No storyboard at ${file}. Run: walkthru init`);
  const r = parseDemo(parseYaml(readFileSync(file, "utf8")));
  if (!r.ok) throw new Error(`storyboard invalid: ${r.reason}`);
  return r.demo;
}

/** Reads .env.demo (project root). Values are never printed. */
export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const f = resolve(projectRoot(), ".env.demo");
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1]) out[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

/** Values that must never appear on screen: names listed in the storyboard plus anything that looks like a credential. */
export function secretValues(demo: Demo, env: Record<string, string>): string[] {
  const names = new Set(demo.secrets);
  for (const k of Object.keys(env)) if (/KEY|PASSWORD|TOKEN|SECRET/i.test(k)) names.add(k);
  return [...names].map((n) => env[n] ?? "").filter((v) => v.length >= 6);
}

export const sha = (x: unknown): string => createHash("sha1").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 12);

export function ensureDirs(): void {
  for (const d of ["clips", "audio", "seg", "sheets"]) mkdirSync(resolve(outDir(), d), { recursive: true });
}

export const clipFile = (id: string, ext: string): string => resolve(outDir(), "clips", `${id}.${ext}`);
export const readJson = <T>(f: string, fallback: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : fallback);
export const writeJson = (f: string, v: unknown): void => writeFileSync(f, JSON.stringify(v, null, 2));
export { demoDir, outDir };
