import type { RunnerKind } from "../config.js";

export type FailureClass =
  | "selector_drift"
  | "timing_flake"
  | "flow_drift"
  | "data_env"
  | "regression"
  | "unknown";

export interface RunRequest {
  runner: RunnerKind;
  testId?: string;
  suite?: string;
  baseUrl?: string;
  headed?: boolean;
  retries?: number;
}

export interface Evidence {
  startedAt: string;
  finishedAt: string;
  runner: RunnerKind;
  runId: string;
  artifacts: {
    screenshots?: string[];
    videos?: string[];
    traces?: string[];
    logs?: string[];
  };
  failingTests: Array<{
    testId: string;
    title: string;
    errorMessage: string;
    stack?: string;
    failureClassHint?: FailureClass;
  }>;
}

export interface E2ERunner {
  kind: RunnerKind;
  detect(): Promise<{ kind: RunnerKind; version?: string }>;
  prepare(req: RunRequest): Promise<void>;
  run(req: RunRequest): Promise<Evidence>;
  cleanup(req: RunRequest): Promise<void>;
}

