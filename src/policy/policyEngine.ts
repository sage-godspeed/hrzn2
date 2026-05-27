import type { TestcaseSpec } from "../spec/types.ts";
import { defaultSafePolicy } from "./defaultPolicy.ts";
import type { SafePolicy, HealCapability } from "./types.ts";
import {
  detectWorkspaceRules,
  policyFromWorkspaceRules,
} from "./workspaceRules.ts";

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function asCapability(x: unknown): HealCapability | null {
  const v = String(x ?? "").trim();
  switch (v) {
    case "selector_update":
    case "timing_waits":
    case "flow_popups":
    case "test_data_update":
    case "assertion_update":
      return v;
    case "timing_wait":
      return "timing_waits";
    case "flow_popup_handler":
      return "flow_popups";
    case "remove_assertions":
    case "weaken_assertions":
      return "assertion_update";
    default:
      return null;
  }
}

function applyTestcaseOverrides(
  base: SafePolicy,
  spec: TestcaseSpec,
): SafePolicy {
  const allowOverrides = (spec.healingPolicy?.allow ?? [])
    .map(asCapability)
    .filter(Boolean) as HealCapability[];
  const denyOverrides = (spec.healingPolicy?.deny ?? [])
    .map(asCapability)
    .filter(Boolean) as HealCapability[];

  const allow = uniq([...base.allow, ...allowOverrides]).filter(
    (c) => !denyOverrides.includes(c),
  );
  const deny = uniq([...base.deny, ...denyOverrides]).filter(
    (c) => !allowOverrides.includes(c),
  );

  const specReq = spec.healingPolicy?.specUpdatesRequireApprovalFor ?? [];
  const approval = uniq([
    ...base.specUpdatesRequireApprovalFor,
    ...(specReq as Array<"assertions" | "steps" | "preconditions">),
  ]);

  return {
    ...base,
    source: "merged",
    allow,
    deny,
    specUpdatesRequireApprovalFor: approval,
  };
}

export async function resolvePolicy(input: {
  projectRoot: string;
  spec?: TestcaseSpec;
}) {
  const base = defaultSafePolicy();
  const workspaceRules = await detectWorkspaceRules(input.projectRoot);
  const workspaceOverrides = policyFromWorkspaceRules(workspaceRules);

  const workspacePolicy: SafePolicy = {
    ...base,
    ...workspaceOverrides,
    source: Object.keys(workspaceRules).length ? "workspace" : "default",
  };

  const effective = input.spec
    ? applyTestcaseOverrides(workspacePolicy, input.spec)
    : workspacePolicy;

  return { workspaceRules, policy: effective };
}
