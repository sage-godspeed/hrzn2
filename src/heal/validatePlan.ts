import type { PatchPlan } from "./patchPlan.ts";
import type { SafePolicy } from "../policy/types.ts";

export function validatePatchPlan(policy: SafePolicy, plan: PatchPlan) {
  const denied = new Set(policy.deny);
  for (const change of plan.changes) {
    if (denied.has(change.type as any)) {
      throw new Error(`PatchPlan change '${change.type}' is denied by policy.`);
    }
  }
  return true;
}

