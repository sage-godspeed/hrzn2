import type { SafePolicy } from "./types.ts";

export function defaultSafePolicy(): SafePolicy {
  return {
    source: "default",
    allow: ["selector_update", "timing_waits", "flow_popups"],
    deny: ["assertion_update"],
    specUpdatesRequireApprovalFor: ["assertions", "steps", "preconditions"],
    maxHealIterations: 3,
    requireEvidenceForChanges: true,
    allowProductionCodeEdits: false
  };
}

