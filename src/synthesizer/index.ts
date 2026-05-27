import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentConfig } from "../config.ts";
import type { TestcaseSpec } from "../spec/types.ts";
import { synthesizePlaywrightTest } from "./playwright.ts";

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function synthesizeTest(config: AgentConfig, spec: TestcaseSpec, opts: { overwrite: boolean }) {
  // For now: only Playwright synthesis into <projectRoot>/e2e/tests/<ID>.spec.ts
  const outDir = resolve(config.projectRoot, "e2e", "tests");
  await mkdir(outDir, { recursive: true });

  const pw = synthesizePlaywrightTest(spec);
  const outPath = resolve(outDir, pw.fileName);
  if (!opts.overwrite && (await exists(outPath))) {
    return { outPath, wrote: false, reason: "exists" as const };
  }
  await writeFile(outPath, pw.contents, "utf8");
  return { outPath, wrote: true as const };
}

