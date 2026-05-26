export type HealCapability =
  | "selector_update"
  | "timing_waits"
  | "flow_popups"
  | "test_data_update"
  | "assertion_update";

export interface SafePolicy {
  source: "default" | "workspace" | "merged";
  allow: HealCapability[];
  deny: HealCapability[];
  specUpdatesRequireApprovalFor: Array<"assertions" | "steps" | "preconditions">;
  maxHealIterations: number;
  requireEvidenceForChanges: boolean;
  allowProductionCodeEdits: boolean;
}

