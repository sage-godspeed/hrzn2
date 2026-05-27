import type { AgentConfig } from "../config.ts";
import type { TestcaseSpec } from "../spec/types.ts";
import type { Evidence } from "../e2e/e2eRunner.ts";
import { runE2E } from "../e2e/index.ts";
import { classifyFailure } from "./triage.ts";
import type { PatchPlan } from "./patchPlan.ts";
import { validatePatchPlan } from "./validatePlan.ts";
import type { SafePolicy } from "../policy/types.ts";
import { applyPlaywrightPatch } from "./applyPlaywrightPatch.ts";
import { applyCypressPatch } from "./applyCypressPatch.ts";
import { resolve } from "node:path";
import { access } from "node:fs/promises";

function patchPlanSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: [
      "testId",
      "classification",
      "confidence",
      "runner",
      "changes",
      "rerun",
    ],
    properties: {
      testId: { type: "string" },
      classification: { type: "string" },
      confidence: { type: "number" },
      runner: { type: "string" },
      changes: { type: "array" },
      rerun: { type: "object" },
      specUpdate: { type: "object" },
    },
  };
}

export async function healOnce(input: {
  config: AgentConfig;
  spec: TestcaseSpec;
  policy: SafePolicy;
  llm: { structured: <T>(req: any) => Promise<T> };
  evidence: Evidence;
  dryRun?: boolean;
}): Promise<{ applied: number; plan: PatchPlan }> {
  const failMsg = input.evidence.failingTests[0]?.errorMessage ?? "";
  const classification = classifyFailure(failMsg);

  const prompt = [
    "You are an E2E test healing assistant.",
    "Return a JSON PatchPlan for updating the test to match the UI change WITHOUT weakening product requirements.",
    "If the testcase.md should be updated, set specUpdate.required=true and include proposedEdits entries with {section, op, path, value, index}.",
    "",
    `TestId: ${input.spec.id}`,
    `Title: ${input.spec.title}`,
    `FailureClassHint: ${classification}`,
    "",
    "Spec (testcase.md parsed):",
    JSON.stringify(input.spec, null, 2),
    "",
    "Failure evidence excerpt:",
    failMsg.slice(-2000),
  ].join("\n");

  const plan = (await input.llm.structured<PatchPlan>({
    input: prompt,
    schema: patchPlanSchema(),
  })) as PatchPlan;

  validatePatchPlan(input.policy, plan);

  const testFilePath = await resolveTestFilePath(
    input.config.projectRoot,
    input.spec.id,
    plan.runner,
  );
  const res =
    plan.runner === "cypress"
      ? await applyCypressPatch(testFilePath, plan, { dryRun: input.dryRun })
      : await applyPlaywrightPatch(testFilePath, plan, {
          dryRun: input.dryRun,
        });
  return { applied: res.applied, plan };
}

export async function healLoop(input: {
  config: AgentConfig;
  spec: TestcaseSpec;
  policy: SafePolicy;
  llm: { structured: <T>(req: any) => Promise<T> };
  dryRun?: boolean;
}): Promise<{
  finalEvidence: Evidence;
  iterations: number;
  plans: PatchPlan[];
}> {
  let iterations = 0;
  const plans: PatchPlan[] = [];
  if (input.dryRun) {
    return {
      finalEvidence: {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        runner: input.config.defaultRunner,
        runId: "dry-run",
        artifacts: {},
        failingTests: [],
      },
      iterations: 0,
      plans: [],
    };
  }

  let evidence = await runE2E(input.config, {
    testId: input.spec.id,
    retries: 0,
  });

  while (
    evidence.failingTests.length &&
    iterations < input.policy.maxHealIterations
  ) {
    iterations++;
    const healed = await healOnce({ ...input, evidence, dryRun: input.dryRun });
    if (healed.applied <= 0) break;
    plans.push(healed.plan);
    evidence = await runE2E(input.config, {
      testId: input.spec.id,
      retries: 0,
    });
  }

  return { finalEvidence: evidence, iterations, plans };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveTestFilePath(
  projectRoot: string,
  testId: string,
  runner: string,
): Promise<string> {
  if (runner === "cypress") {
    const candidates = [
      resolve(projectRoot, "cypress", "e2e", `${testId}.cy.ts`),
      resolve(projectRoot, "cypress", "e2e", `${testId}.cy.js`),
      resolve(projectRoot, "cypress", "integration", `${testId}.spec.ts`),
      resolve(projectRoot, "cypress", "integration", `${testId}.spec.js`),
    ];
    for (const c of candidates) if (await exists(c)) return c;
  }
  return resolve(projectRoot, "e2e", "tests", `${testId}.spec.ts`);
}
