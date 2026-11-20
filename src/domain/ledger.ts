export interface LedgerEntry {
  scene: string;
  note: string;
}

export function formatLedger(entries: LedgerEntry[]): string {
  if (entries.length === 0) return "Nothing was recorded as created in real systems.";
  return entries.map((e) => `- [${e.scene}] ${e.note}`).join("\n");
}
