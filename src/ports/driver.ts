import type { DemoStep } from "../storyboard/demo.js";

export interface HealRecord {
  scene: string;
  wanted: string;
  used: string;
}

export interface StepOutcome {
  /** Visible text after the step, for secret/error scanning. */
  text?: string;
  /** Seconds the step spent waiting on something slow (network, build); sped up in the final cut. */
  idle?: { start: number; end: number };
  healed?: { wanted: string; used: string };
  /** Entities created in real systems (for the cleanup ledger). */
  note?: string;
}

/** A recorded surface (browser page, terminal, code viewer). One driver instance per scene. */
export interface SceneDriver {
  run(step: DemoStep, verb: string, now: () => number): Promise<StepOutcome>;
  /** Marks the start of the visible part (setup before this is trimmed). Returns trim offset in seconds. */
  go(): number;
  /** Finishes recording; returns the clip path (or "" when not recording). */
  close(): Promise<{ clip: string; offset: number; errors: string[] }>;
}
