import type { PatchPlan } from "./patchPlan.ts";
import type { SafePolicy } from "../policy/types.ts";

export function validatePatchPlan(policy: SafePolicy, plan: PatchPlan) {
  const denied = new Set(policy.deny);
  const allowed = new Set(policy.allow);
  for (const change of plan.changes) {
    if (denied.has(change.type as any)) {
      throw new Error(`PatchPlan change '${change.type}' is denied by policy.`);
    }
    if (allowed.size && !allowed.has(change.type as any)) {
      throw new Error(
        `PatchPlan change '${change.type}' is not allowed by policy.`,
      );
    }
  }
  return true;
}
