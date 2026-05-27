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

  const templatePath = resolve(config.paths.testcasesDir, "TEMPLATE.md");
  if (!(await exists(templatePath))) {
    let template = exampleTestcaseMarkdown();
    template = template.replace(/^#\s*TestCase:\s*.+$/m, "# TestCase: TEMPLATE");
    template = template.replace(
      /##\s*Title\s*\n([^\n]*)/m,
      "## Title\nShort human-readable title",
    );
    await writeFile(templatePath, template, "utf8");
  }
}
