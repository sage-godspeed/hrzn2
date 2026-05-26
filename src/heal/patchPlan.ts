import type { RunnerKind } from "../config.js";
import type { FailureClass } from "../e2e/e2eRunner.js";

export type HealChangeType =
  | "selector_update"
  | "timing_wait"
  | "flow_popup_handler"
  | "test_data_update"
  | "assertion_update";

export interface HealChange {
  type: HealChangeType;
  target?: string;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  reason: string;
}

export interface PatchPlan {
  testId: string;
  classification: FailureClass;
  confidence: number;
  runner: RunnerKind;
  changes: HealChange[];
  rerun: { scope: "single_test" | "suite"; runner: RunnerKind };
  specUpdate?: { required: boolean; proposedEdits: Array<Record<string, unknown>> };
}

