import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SafePolicy } from "./types.ts";

export interface WorkspaceRules {
  agentsMdPath?: string;
  agentsMdExcerpt?: string;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function detectWorkspaceRules(projectRoot: string): Promise<WorkspaceRules> {
  const agentsMdPath = resolve(projectRoot, "AGENTS.md");
  const agentsMd = await readIfExists(agentsMdPath);
  if (!agentsMd) return {};
  const excerpt = agentsMd.trim().split("\n").slice(0, 40).join("\n");
  return { agentsMdPath, agentsMdExcerpt: excerpt };
}

export function policyFromWorkspaceRules(_rules: WorkspaceRules): Partial<SafePolicy> {
  return {};
}

