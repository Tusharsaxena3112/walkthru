export interface FileStore {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  makeDir(path: string): Promise<void>;
  makeTempDir(prefix: string): Promise<string>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listFiles(dir: string): Promise<string[]>;
}
