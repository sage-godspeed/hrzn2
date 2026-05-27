import type { TestcaseSpec } from "./types.ts";

function jsonInline(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

export function serializeTestcaseMarkdown(spec: TestcaseSpec): string {
  const lines: string[] = [];
  lines.push(`# TestCase: ${spec.id}`);
  lines.push("## Title");
  lines.push(spec.title);
  lines.push("");

  lines.push("## Tags");
  for (const [k, v] of Object.entries(spec.tags ?? {})) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");

  lines.push("## Runner");
  lines.push(`- preferred: ${spec.preferredRunner ?? "any"}`);
  if (spec.suite) lines.push(`- suite: ${spec.suite}`);
  lines.push("");

  lines.push("## Preconditions");
  for (const [k, v] of flatten(spec.preconditions ?? {})) {
    lines.push(`- ${k}: ${jsonInline(v)}`);
  }
  lines.push("");

  lines.push("## Data");
  for (const [k, v] of flatten(spec.data ?? {})) {
    lines.push(`- ${k}: ${jsonInline(v)}`);
  }
  lines.push("");

  lines.push("## Steps");
  const steps = spec.steps ?? [];
  steps.forEach((step, idx) => {
    const op = Object.keys(step)[0] ?? "";
    const val = (step as any)[op];
    lines.push(`${idx + 1}. ${op}: ${jsonInline(val)}`);
  });
  lines.push("");

  lines.push("## Assertions");
  const assertions = spec.assertions ?? [];
  for (const assertion of assertions) {
    const op = Object.keys(assertion)[0] ?? "";
    const val = (assertion as any)[op];
    lines.push(`- ${op}: ${jsonInline(val)}`);
  }
  lines.push("");

  lines.push("## Locators (Optional)");
  if (spec.locators?.strategyOrder) {
    lines.push(`- strategy_order: ${jsonInline(spec.locators.strategyOrder)}`);
  }
  if (spec.locators?.map && Object.keys(spec.locators.map).length) {
    lines.push("- map:");
    for (const [k, v] of Object.entries(spec.locators.map)) {
      lines.push(`  ${k}: ${jsonInline(v)}`);
    }
  }
  lines.push("");

  lines.push("## Healing Policy");
  if (spec.healingPolicy?.allow?.length) {
    lines.push("- allow:");
    for (const item of spec.healingPolicy.allow) lines.push(`  - ${item}`);
  }
  if (spec.healingPolicy?.deny?.length) {
    lines.push("- deny:");
    for (const item of spec.healingPolicy.deny) lines.push(`  - ${item}`);
  }
  if (spec.healingPolicy?.specUpdatesRequireApprovalFor?.length) {
    lines.push(
      `- require_approval_for: ${jsonInline(spec.healingPolicy.specUpdatesRequireApprovalFor)}`,
    );
  }
  lines.push("");

  return lines.join("\n");
}
