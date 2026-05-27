import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface RunReport {
  timestamp: string;
  command: string;
  testcaseId?: string;
  runner?: string;
  status: "pass" | "fail";
  iterations?: number;
  policySource?: string;
  llmProvider?: string;
  artifacts?: Record<string, unknown>;
  notes?: string[];
}

export async function writeRunReport(path: string, report: RunReport) {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(report, null, 2) + "\n", "utf8");
  return abs;
}

