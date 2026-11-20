import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileStore } from "../ports/files.js";

export class NodeFiles implements FileStore {
  readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }
  async writeText(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf8");
  }
  async makeDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }
  makeTempDir(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
  }
  async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }
  async exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false);
  }
  listFiles(dir: string): Promise<string[]> {
    return readdir(dir);
  }
}
