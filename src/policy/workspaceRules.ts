import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SafePolicy } from "./types.ts";

export interface WorkspaceRules {
  agentsMdPath?: string;
  agentsMdExcerpt?: string;
  agentsMdContent?: string;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function detectWorkspaceRules(
  projectRoot: string,
): Promise<WorkspaceRules> {
  const agentsMdPath = resolve(projectRoot, "AGENTS.md");
  const agentsMd = await readIfExists(agentsMdPath);
  if (!agentsMd) return {};
  const excerpt = agentsMd.trim().split("\n").slice(0, 40).join("\n");
  return { agentsMdPath, agentsMdExcerpt: excerpt, agentsMdContent: agentsMd };
}

function parseListInline(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((v) => v.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
    .filter(Boolean);
}

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parsePolicyFromText(text: string): Partial<SafePolicy> {
  const lines = text.split("\n");
  const allow: string[] = [];
  const deny: string[] = [];
  let maxHealIterations: number | undefined;
  let requireEvidenceForChanges: boolean | undefined;
  let allowProductionCodeEdits: boolean | undefined;
  let specUpdatesRequireApprovalFor:
    | Array<"assertions" | "steps" | "preconditions">
    | undefined;

  let section: "allow" | "deny" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^allow\s*:/i.test(trimmed)) {
      section = "allow";
      const inline = trimmed.split(":").slice(1).join(":");
      allow.push(...parseListInline(inline));
      continue;
    }
    if (/^deny\s*:/i.test(trimmed)) {
      section = "deny";
      const inline = trimmed.split(":").slice(1).join(":");
      deny.push(...parseListInline(inline));
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s*([A-Za-z0-9._-]+)\s*$/)?.[1];
    if (listItem && section === "allow") {
      allow.push(listItem);
      continue;
    }
    if (listItem && section === "deny") {
      deny.push(listItem);
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z0-9._-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const value = kv[2] ?? "";

    if (key === "max_heal_iterations") {
      const num = Number(value.trim());
      if (Number.isFinite(num)) maxHealIterations = num;
      continue;
    }
    if (key === "require_evidence_for_changes") {
      const b = parseBool(value);
      if (b != null) requireEvidenceForChanges = b;
      continue;
    }
    if (key === "allow_production_code_edits") {
      const b = parseBool(value);
      if (b != null) allowProductionCodeEdits = b;
      continue;
    }
    if (key === "spec_updates_require_approval_for") {
      const list = parseListInline(value) as Array<
        "assertions" | "steps" | "preconditions"
      >;
      if (list.length) specUpdatesRequireApprovalFor = list;
      continue;
    }
  }

  const out: Partial<SafePolicy> = {};
  if (allow.length) out.allow = allow as any;
  if (deny.length) out.deny = deny as any;
  if (maxHealIterations != null) out.maxHealIterations = maxHealIterations;
  if (requireEvidenceForChanges != null)
    out.requireEvidenceForChanges = requireEvidenceForChanges;
  if (allowProductionCodeEdits != null)
    out.allowProductionCodeEdits = allowProductionCodeEdits;
  if (specUpdatesRequireApprovalFor)
    out.specUpdatesRequireApprovalFor = specUpdatesRequireApprovalFor;

  return out;
}

export function policyFromWorkspaceRules(
  rules: WorkspaceRules,
): Partial<SafePolicy> {
  if (!rules.agentsMdContent) return {};
  return parsePolicyFromText(rules.agentsMdContent);
}
