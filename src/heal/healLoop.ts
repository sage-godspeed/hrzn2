import type { AgentConfig } from "../config.ts";
import type { TestcaseSpec } from "../spec/types.ts";
import type { Evidence } from "../e2e/e2eRunner.ts";
import { runE2E } from "../e2e/index.ts";
import { classifyFailure } from "./triage.ts";
import type { PatchPlan } from "./patchPlan.ts";
import { validatePatchPlan } from "./validatePlan.ts";
import type { SafePolicy } from "../policy/types.ts";
import { applyPlaywrightPatch } from "./applyPlaywrightPatch.ts";
import { resolve } from "node:path";

function patchPlanSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["testId", "classification", "confidence", "runner", "changes", "rerun"],
    properties: {
      testId: { type: "string" },
      classification: { type: "string" },
      confidence: { type: "number" },
      runner: { type: "string" },
      changes: { type: "array" },
      rerun: { type: "object" }
    }
  };
}

export async function healOnce(input: {
  config: AgentConfig;
  spec: TestcaseSpec;
  policy: SafePolicy;
  llm: { structured: <T>(req: any) => Promise<T> };
  evidence: Evidence;
}): Promise<{ applied: number; plan: PatchPlan }> {
  const failMsg = input.evidence.failingTests[0]?.errorMessage ?? "";
  const classification = classifyFailure(failMsg);

  const prompt = [
    "You are an E2E test healing assistant.",
    "Return a JSON PatchPlan for updating the test to match the UI change WITHOUT weakening product requirements.",
    "",
    `TestId: ${input.spec.id}`,
    `Title: ${input.spec.title}`,
    `FailureClassHint: ${classification}`,
    "",
    "Spec (testcase.md parsed):",
    JSON.stringify(input.spec, null, 2),
    "",
    "Failure evidence excerpt:",
    failMsg.slice(-2000)
  ].join("\n");

  const plan = (await input.llm.structured<PatchPlan>({
    input: prompt,
    schema: patchPlanSchema()
  })) as PatchPlan;

  validatePatchPlan(input.policy, plan);

  const testFilePath = resolve(input.config.projectRoot, "e2e", "tests", `${input.spec.id}.spec.ts`);
  const res = await applyPlaywrightPatch(testFilePath, plan);
  return { applied: res.applied, plan };
}

export async function healLoop(input: {
  config: AgentConfig;
  spec: TestcaseSpec;
  policy: SafePolicy;
  llm: { structured: <T>(req: any) => Promise<T> };
}): Promise<{ finalEvidence: Evidence; iterations: number; plans: PatchPlan[] }> {
  let iterations = 0;
  const plans: PatchPlan[] = [];
  let evidence = await runE2E(input.config, { testId: input.spec.id, retries: 0 });

  while (evidence.failingTests.length && iterations < input.policy.maxHealIterations) {
    iterations++;
    const healed = await healOnce({ ...input, evidence });
    if (healed.applied <= 0) break;
    plans.push(healed.plan);
    evidence = await runE2E(input.config, { testId: input.spec.id, retries: 0 });
  }

  return { finalEvidence: evidence, iterations, plans };
}
