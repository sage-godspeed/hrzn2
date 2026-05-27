import type { TestcaseSpec } from "./types.ts";
import { parseTestcaseMarkdown } from "./parser.ts";
import { serializeTestcaseMarkdown } from "./serialize.ts";

export type SpecSection =
  | "preconditions"
  | "data"
  | "steps"
  | "assertions"
  | "locators";

export type SpecEdit = {
  section: SpecSection;
  op: "set" | "add" | "remove";
  path?: string;
  value?: unknown;
  index?: number;
};

function setDeep(obj: Record<string, any>, path: string[], value: unknown) {
  let cur = obj;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    if (i === path.length - 1) {
      cur[key] = value;
    } else {
      if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
      cur = cur[key];
    }
  }
}

function deleteDeep(obj: Record<string, any>, path: string[]) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!cur[key] || typeof cur[key] !== "object") return;
    cur = cur[key];
  }
  delete cur[path[path.length - 1]!];
}

function applyEditsToSpec(
  spec: TestcaseSpec,
  edits: SpecEdit[],
): SpecSection[] {
  const touched = new Set<SpecSection>();
  for (const edit of edits) {
    if (!edit.section || !edit.op) continue;
    touched.add(edit.section);
    if (edit.section === "preconditions" || edit.section === "data") {
      const path = (edit.path ?? "").split(".").filter(Boolean);
      if (!path.length) continue;
      if (edit.op === "set" || edit.op === "add") {
        setDeep(spec[edit.section] as any, path, edit.value);
      } else if (edit.op === "remove") {
        deleteDeep(spec[edit.section] as any, path);
      }
      continue;
    }
    if (edit.section === "steps" || edit.section === "assertions") {
      const list = spec[edit.section] as Array<Record<string, unknown>>;
      const idx =
        typeof edit.index === "number"
          ? edit.index
          : edit.path && /^\d+$/.test(edit.path)
            ? Number(edit.path)
            : undefined;
      if (edit.op === "add" && edit.value) {
        if (typeof idx === "number" && idx >= 0 && idx <= list.length) {
          list.splice(idx, 0, edit.value as any);
        } else {
          list.push(edit.value as any);
        }
      }
      if (edit.op === "set" && edit.value && typeof idx === "number") {
        if (idx >= 0 && idx < list.length) list[idx] = edit.value as any;
      }
      if (edit.op === "remove" && typeof idx === "number") {
        if (idx >= 0 && idx < list.length) list.splice(idx, 1);
      }
      continue;
    }
    if (edit.section === "locators") {
      spec.locators = spec.locators ?? {};
      const path = (edit.path ?? "").trim();
      if (!path) continue;
      if (path === "strategyOrder") {
        if (edit.op === "set") {
          spec.locators.strategyOrder = Array.isArray(edit.value)
            ? (edit.value as any)
            : spec.locators.strategyOrder;
        }
        continue;
      }
      spec.locators.map = spec.locators.map ?? {};
      if (edit.op === "set" || edit.op === "add") {
        spec.locators.map[path] = edit.value as any;
      }
      if (edit.op === "remove") {
        delete spec.locators.map[path];
      }
      continue;
    }
  }
  return Array.from(touched);
}

export function applySpecEditsToMarkdown(md: string, edits: SpecEdit[]) {
  const spec = parseTestcaseMarkdown(md);
  const touchedSections = applyEditsToSpec(spec, edits);
  const updatedMarkdown = serializeTestcaseMarkdown(spec);
  return { updatedMarkdown, touchedSections, spec };
}
