import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface RunReport {
  timestamp: string;
  command: string;
  testcaseId?: string;
  testcases?: string[];
  results?: Array<Record<string, unknown>>;
  suite?: string;
  runner?: string;
  status: "pass" | "fail";
  iterations?: number;
  retries?: number;
  headed?: boolean;
  all?: boolean;
  policySource?: string;
  llmProvider?: string;
  artifacts?: Record<string, unknown>;
  notes?: string[];
  ci?: boolean;
  dryRun?: boolean;
  patchFile?: string;
  projectRoot?: string;
  git?: {
    branch?: string;
    commit?: string;
    remote?: string;
  };
}

export async function writeRunReport(path: string, report: RunReport) {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(report, null, 2) + "\n", "utf8");
  return abs;
}
