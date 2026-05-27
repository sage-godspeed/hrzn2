import type { AgentConfig } from "../config.ts";
import type { E2ERunner, RunRequest } from "./e2eRunner.ts";
import { createPlaywrightRunner } from "./playwrightRunner.ts";

export function loadRunner(config: AgentConfig): E2ERunner {
  if (config.defaultRunner === "playwright") {
    return createPlaywrightRunner({ projectRoot: config.projectRoot, artifactsDir: config.paths.artifactsDir });
  }
  throw new Error("Cypress runner not implemented yet.");
}

export async function runE2E(config: AgentConfig, req: Omit<RunRequest, "runner">) {
  const runner = loadRunner(config);
  await runner.prepare({ runner: runner.kind, ...req });
  try {
    return await runner.run({ runner: runner.kind, ...req });
  } finally {
    await runner.cleanup({ runner: runner.kind, ...req });
  }
}

