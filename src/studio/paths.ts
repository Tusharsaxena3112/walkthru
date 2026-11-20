import { homedir } from "node:os";
import { resolve } from "node:path";

export const projectRoot = (): string => process.cwd();
export const demoDir = (): string => resolve(projectRoot(), process.env["WALKTHRU_DIR"] ?? "demo");
export const outDir = (): string => resolve(demoDir(), "out");
export const storyboardPath = (): string => resolve(demoDir(), "demo.yaml");
/** Machine-wide runtime (playwright, ffmpeg-static, piper) so it survives plugin updates and is shared across projects. */
export const runtimeDir = (): string => process.env["WALKTHRU_RUNTIME"] ?? resolve(homedir(), ".cache", "walkthru", "runtime");
/** Folder holding assets shipped with the plugin (xterm, highlight.js). */
export const assetsDir = (): string => resolve(new URL(".", import.meta.url).pathname, process.env["WALKTHRU_ASSETS_REL"] ?? "../assets");
