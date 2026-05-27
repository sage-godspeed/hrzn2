import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentConfig, RunnerKind } from "../config.ts";
import type { TestcaseSpec } from "../spec/types.ts";
import { synthesizePlaywrightTest } from "./playwright.ts";
import { synthesizeCypressTest } from "./cypress.ts";

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function synthesizeTest(
  config: AgentConfig,
  spec: TestcaseSpec,
  opts: { overwrite: boolean; dryRun?: boolean },
) {
  const runner: RunnerKind =
    spec.preferredRunner && spec.preferredRunner !== "any"
      ? spec.preferredRunner
      : config.defaultRunner;

  const outDir =
    runner === "cypress"
      ? resolve(config.projectRoot, "cypress", "e2e")
      : resolve(config.projectRoot, "e2e", "tests");
  if (!opts.dryRun) {
    await mkdir(outDir, { recursive: true });
  }

  const generated =
    runner === "cypress"
      ? synthesizeCypressTest(spec)
      : synthesizePlaywrightTest(spec);
  const outPath = resolve(outDir, generated.fileName);
  if (!opts.overwrite && (await exists(outPath))) {
    return { outPath, wrote: false, reason: "exists" as const };
  }
  if (opts.dryRun) {
    return { outPath, wrote: false, reason: "dry_run" as const };
  }
  await writeFile(outPath, generated.contents, "utf8");
  return { outPath, wrote: true as const };
}
