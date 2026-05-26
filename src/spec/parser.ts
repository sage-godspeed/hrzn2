import type { TestcaseSpec } from "./types.ts";

function requiredHeading(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const match = re.exec(md);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = md.slice(start);
  const next = rest.search(/^##\s+/m);
  const block = (next === -1 ? rest : rest.slice(0, next)).trim();
  return block;
}

function parseFrontId(md: string): string {
  const m = md.match(/^#\s*TestCase:\s*([A-Za-z0-9._-]+)\s*$/m);
  if (!m) throw new Error("Missing first line '# TestCase: <ID>'");
  return m[1]!;
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("-")) continue;
    const kv = t.replace(/^-+\s*/, "");
    const idx = kv.indexOf(":");
    if (idx === -1) continue;
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx + 1).trim();
    if (k) tags[k] = v;
  }
  return tags;
}

function parseRunner(block: string): { preferredRunner: "playwright" | "cypress" | "any"; suite?: string } {
  let preferredRunner: "playwright" | "cypress" | "any" = "any";
  let suite: string | undefined;
  for (const line of block.split("\n")) {
    const t = line.trim().replace(/^-+\s*/, "");
    const [kRaw, ...rest] = t.split(":");
    const k = (kRaw ?? "").trim();
    const v = rest.join(":").trim();
    if (k === "preferred" && (v === "playwright" || v === "cypress" || v === "any")) preferredRunner = v;
    if (k === "suite" && v) suite = v;
  }
  return { preferredRunner, suite };
}

function parseInlineValue(raw: string): unknown {
  const v = raw.trim();
  if (!v) return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]"))) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseDashKVMap(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*-\s*([^:]+):\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1]!.trim();
    const raw = m[2]!.trim();
    if (!k) continue;
    out[k] = parseInlineValue(raw);
  }
  return out;
}

function parseNumberedOps(block: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*\d+\.\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)\s*$/);
    if (!m) continue;
    const op = m[1]!.trim();
    const raw = m[2]!.trim();
    out.push({ [op]: parseInlineValue(raw) });
  }
  return out;
}

function parseDashOps(block: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*-\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)\s*$/);
    if (!m) continue;
    const op = m[1]!.trim();
    const raw = m[2]!.trim();
    out.push({ [op]: parseInlineValue(raw) });
  }
  return out;
}

function parseLocators(block: string): TestcaseSpec["locators"] | undefined {
  if (!block.trim()) return undefined;
  const strategyOrderMatch = block.match(/^\s*-\s*strategy_order:\s*(\[.*\])\s*$/m);
  const strategyOrder = strategyOrderMatch ? (parseInlineValue(strategyOrderMatch[1]!) as any) : undefined;

  const map: Record<string, Record<string, unknown>> = {};
  const mapStart = block.search(/^\s*-\s*map:\s*$/m);
  if (mapStart !== -1) {
    const after = block.slice(mapStart).split("\n").slice(1);
    for (const line of after) {
      const m = line.match(/^\s{2,}([A-Za-z0-9._-]+):\s*(\{.*\})\s*$/);
      if (!m) continue;
      const key = m[1]!.trim();
      const obj = parseInlineValue(m[2]!.trim());
      if (obj && typeof obj === "object" && !Array.isArray(obj)) map[key] = obj as Record<string, unknown>;
    }
  }

  return {
    strategyOrder: Array.isArray(strategyOrder) ? (strategyOrder as any) : undefined,
    map: Object.keys(map).length ? map : undefined
  };
}

function parseHealingPolicy(block: string): TestcaseSpec["healingPolicy"] | undefined {
  if (!block.trim()) return undefined;
  const allow: string[] = [];
  const deny: string[] = [];

  let section: "allow" | "deny" | "other" = "other";
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- allow:")) {
      section = "allow";
      continue;
    }
    if (trimmed.startsWith("- deny:")) {
      section = "deny";
      continue;
    }
    const item = trimmed.match(/^\-\s*([A-Za-z0-9._-]+)\s*$/)?.[1];
    if (item && section === "allow") allow.push(item);
    if (item && section === "deny") deny.push(item);
  }

  const reqMatch = block.match(/require_approval_for:\s*(\[.*\])/);
  const req = reqMatch ? parseInlineValue(reqMatch[1]!) : undefined;

  return {
    allow: allow.length ? allow : undefined,
    deny: deny.length ? deny : undefined,
    specUpdatesRequireApprovalFor: Array.isArray(req) ? (req as string[]) : undefined
  };
}

export function parseTestcaseMarkdown(md: string): TestcaseSpec {
  const id = parseFrontId(md);
  const title = requiredHeading(md, "Title").split("\n")[0]?.trim();
  if (!title) throw new Error("Missing ## Title");

  const tagsBlock = requiredHeading(md, "Tags");
  const tags = parseTags(tagsBlock);

  const runnerBlock = requiredHeading(md, "Runner");
  const runner = parseRunner(runnerBlock);

  const preconditionsBlock = requiredHeading(md, "Preconditions");
  const preconditions = parseDashKVMap(preconditionsBlock);

  const dataBlock = requiredHeading(md, "Data");
  const data = parseDashKVMap(dataBlock);

  const stepsBlock = requiredHeading(md, "Steps");
  const steps = parseNumberedOps(stepsBlock);

  const assertionsBlock = requiredHeading(md, "Assertions");
  const assertions = parseDashOps(assertionsBlock);

  const locatorsBlock = requiredHeading(md, "Locators (Optional)");
  const healingPolicyBlock = requiredHeading(md, "Healing Policy");

  const locators = locatorsBlock ? parseLocators(locatorsBlock) : undefined;
  const healingPolicy = healingPolicyBlock ? parseHealingPolicy(healingPolicyBlock) : undefined;

  return {
    id,
    title,
    tags,
    preferredRunner: runner.preferredRunner,
    suite: runner.suite,
    preconditions,
    data,
    steps,
    assertions,
    locators,
    healingPolicy
  };
}

