import type { RunnerKind } from "../config.ts";

export type LocatorStrategy =
  | "testid"
  | "role"
  | "label"
  | "text"
  | "css"
  | "xpath";

export type StepOp =
  | "goto"
  | "fill"
  | "click"
  | "press"
  | "select"
  | "wait_for"
  | "assert";
export type AssertionOp =
  | "url_contains"
  | "visible"
  | "not_visible"
  | "text_contains"
  | "equals";

export interface TestcaseSpec {
  id: string;
  title: string;
  tags: Record<string, string>;
  preferredRunner: RunnerKind | "any";
  suite?: string;
  preconditions: Record<string, unknown>;
  data: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  assertions: Array<Record<string, unknown>>;
  locators?: {
    strategyOrder?: LocatorStrategy[];
    map?: Record<string, Record<string, unknown>>;
  };
  healingPolicy?: {
    allow?: string[];
    deny?: string[];
    specUpdatesRequireApprovalFor?: string[];
  };
}
