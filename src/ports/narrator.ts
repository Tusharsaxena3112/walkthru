export interface Narrator {
  readonly id: string;
  /** Writes speech for `text` to `out` (wav). Resolves when the file is complete. */
  synthesize(text: string, out: string): Promise<void>;
  /** Billable characters for `text` (0 for free providers). */
  cost(text: string): number;
}
