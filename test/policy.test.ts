import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePolicy } from "../src/policy/policyEngine.ts";
import { validatePatchPlan } from "../src/heal/validatePlan.ts";
import type { PatchPlan } from "../src/heal/patchPlan.ts";
import type { TestcaseSpec } from "../src/spec/types.ts";

test("resolvePolicy merges testcase allow/deny overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hrzn-policy-"));
  try {
    const spec: TestcaseSpec = {
      id: "AUTH-LOGIN-001",
      title: "Login works",
      tags: {},
      preferredRunner: "playwright",
      preconditions: {},
      data: {},
      steps: [],
      assertions: [],
      healingPolicy: {
        allow: ["assertion_update"],
        deny: ["selector_update"],
        specUpdatesRequireApprovalFor: ["assertions"],
      },
    };

    const { policy } = await resolvePolicy({ projectRoot: dir, spec });
    assert.ok(policy.allow.includes("assertion_update"));
    assert.ok(!policy.allow.includes("selector_update"));
    assert.ok(policy.deny.includes("selector_update"));
    assert.ok(policy.specUpdatesRequireApprovalFor.includes("assertions"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validatePatchPlan enforces allow and deny lists", () => {
  const basePlan: PatchPlan = {
    testId: "AUTH-LOGIN-001",
    classification: "selector_drift",
    confidence: 0.5,
    runner: "playwright",
    changes: [],
    rerun: { scope: "single_test", runner: "playwright" },
  };

  assert.throws(() =>
    validatePatchPlan(
      {
        source: "default",
        allow: ["selector_update"],
        deny: [],
        specUpdatesRequireApprovalFor: ["assertions"],
        maxHealIterations: 1,
        requireEvidenceForChanges: true,
        allowProductionCodeEdits: false,
      },
      {
        ...basePlan,
        changes: [{ type: "timing_waits", reason: "slow" }],
      },
    ),
  );

  assert.throws(() =>
    validatePatchPlan(
      {
        source: "default",
        allow: [],
        deny: ["assertion_update"],
        specUpdatesRequireApprovalFor: ["assertions"],
        maxHealIterations: 1,
        requireEvidenceForChanges: true,
        allowProductionCodeEdits: false,
      },
      {
        ...basePlan,
        changes: [{ type: "assertion_update", reason: "remove" }],
      },
    ),
  );
});
