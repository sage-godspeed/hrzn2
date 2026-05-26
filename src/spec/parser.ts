import yaml from "js-yaml";
import type { TestcaseSpec } from "./types.js";

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

function parseLooseYamlList(block: string): unknown[] {
  const cleaned = block
    .split("\n")
    .map((l) => l.replace(/^\s*-\s?/, "- "))
    .join("\n");
  const doc = yaml.load(cleaned);
  if (!Array.isArray(doc)) return [];
  return doc as unknown[];
}

function parseLooseYamlMap(block: string): Record<string, unknown> {
  const cleaned = block
    .split("\n")
    .map((l) => (l.trim().startsWith("-") ? l.replace(/^\s*-\s?/, "") : l))
    .join("\n");
  const doc = yaml.load(cleaned);
  if (doc && typeof doc === "object" && !Array.isArray(doc)) return doc as Record<string, unknown>;
  return {};
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
  const preconditions = parseLooseYamlMap(preconditionsBlock);

  const dataBlock = requiredHeading(md, "Data");
  const data = parseLooseYamlMap(dataBlock);

  const stepsBlock = requiredHeading(md, "Steps");
  const steps = parseLooseYamlList(stepsBlock);

  const assertionsBlock = requiredHeading(md, "Assertions");
  const assertions = parseLooseYamlList(assertionsBlock);

  const locatorsBlock = requiredHeading(md, "Locators (Optional)");
  const healingPolicyBlock = requiredHeading(md, "Healing Policy");

  const locators = locatorsBlock ? parseLooseYamlMap(locatorsBlock) : undefined;
  const healingPolicy = healingPolicyBlock ? parseLooseYamlMap(healingPolicyBlock) : undefined;

  return {
    id,
    title,
    tags,
    preferredRunner: runner.preferredRunner,
    suite: runner.suite,
    preconditions,
    data,
    steps: steps as Array<Record<string, unknown>>,
    assertions: assertions as Array<Record<string, unknown>>,
    locators: locators as any,
    healingPolicy: healingPolicy as any
  };
}

