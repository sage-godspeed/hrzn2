import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AgentConfig } from "./config.ts";
import { exampleTestcaseMarkdown } from "./spec/example.ts";

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureProjectScaffold(config: AgentConfig): Promise<void> {
  await mkdir(resolve(config.paths.testcasesDir), { recursive: true });
  await mkdir(resolve(config.paths.e2eDir), { recursive: true });
  await mkdir(resolve(config.paths.artifactsDir), { recursive: true });
  await mkdir(resolve(dirname(config.paths.graphChangelogPath)), { recursive: true });

  const examplePath = resolve(config.paths.testcasesDir, "AUTH-LOGIN-001.md");
  if (!(await exists(examplePath))) {
    await writeFile(examplePath, exampleTestcaseMarkdown(), "utf8");
  }
}
