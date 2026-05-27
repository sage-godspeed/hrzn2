import { readFile, writeFile } from "node:fs/promises";
import type { PatchPlan } from "./patchPlan.ts";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locatorExpression(strategy: string, value: unknown): string | null {
  if (!strategy) return null;
  if (strategy === "testid") {
    return `cy.get(${JSON.stringify(`[data-testid=\"${String(value)}\"]`)})`;
  }
  if (strategy === "text")
    return `cy.contains(${JSON.stringify(String(value))})`;
  if (strategy === "label")
    return `cy.contains('label', ${JSON.stringify(String(value))})`;
  if (strategy === "css" || strategy === "xpath")
    return `cy.get(${JSON.stringify(String(value))})`;
  if (strategy === "role") {
    return `cy.contains(${JSON.stringify(String(value))})`;
  }
  return null;
}

function replaceLocator(
  src: string,
  from: any,
  to: any,
): { next: string; applied: number } {
  const fromStrategy = String(from?.strategy ?? "text");
  const fromValue = from?.value ?? from?.name ?? from?.text ?? "";
  const toStrategy = String(to?.strategy ?? "");
  const toValue = to?.value ?? to?.name ?? to?.text ?? "";
  if (!fromValue || !toStrategy || !toValue) return { next: src, applied: 0 };

  const replacement = locatorExpression(toStrategy, toValue);
  if (!replacement) return { next: src, applied: 0 };

  const patterns: RegExp[] = [];
  if (fromStrategy === "testid") {
    patterns.push(
      new RegExp(
        `cy\\.get\\(\\s*["']\\[data-testid=\\"${escapeRegExp(String(fromValue))}\\"\\]["']\\s*\\)`,
        "g",
      ),
    );
  } else if (fromStrategy === "text" || fromStrategy === "role") {
    patterns.push(
      new RegExp(
        `cy\\.contains\\(\\s*["']${escapeRegExp(String(fromValue))}["']\\s*\\)`,
        "g",
      ),
    );
  } else if (fromStrategy === "label") {
    patterns.push(
      new RegExp(
        `cy\\.contains\\(\\s*["']label["']\\s*,\\s*["']${escapeRegExp(String(fromValue))}["']\\s*\\)`,
        "g",
      ),
    );
  } else if (fromStrategy === "css" || fromStrategy === "xpath") {
    patterns.push(
      new RegExp(
        `cy\\.get\\(\\s*["']${escapeRegExp(String(fromValue))}["']\\s*\\)`,
        "g",
      ),
    );
  }

  let next = src;
  let applied = 0;
  for (const pat of patterns) {
    const candidate = next.replace(pat, replacement);
    if (candidate !== next) {
      next = candidate;
      applied++;
    }
  }
  return { next, applied };
}

function insertOnce(
  src: string,
  line: string,
  afterMatch: RegExp,
): { next: string; applied: number } {
  if (src.includes(line)) return { next: src, applied: 0 };
  const idx = src.search(afterMatch);
  if (idx === -1) return { next: src, applied: 0 };
  const insertAt = src.indexOf("\n", idx);
  if (insertAt === -1) return { next: src, applied: 0 };
  const next =
    src.slice(0, insertAt + 1) + line + "\n" + src.slice(insertAt + 1);
  return { next, applied: 1 };
}

export async function applyCypressPatch(
  testFilePath: string,
  plan: PatchPlan,
  options?: { dryRun?: boolean },
): Promise<{ changed: boolean; applied: number }> {
  let src = await readFile(testFilePath, "utf8");
  let applied = 0;

  for (const change of plan.changes) {
    if (change.type === "selector_update") {
      const res = replaceLocator(src, change.from, change.to);
      if (res.next !== src) {
        src = res.next;
        applied += res.applied;
      }
      continue;
    }
    if (change.type === "timing_waits") {
      const ms = Number(
        (change.to as any)?.ms ?? (change.to as any)?.timeout ?? 1000,
      );
      const line = `    cy.wait(${Number.isFinite(ms) ? ms : 1000});`;
      const res = insertOnce(src, line, /it\(.*?\{\s*$/m);
      if (res.next !== src) {
        src = res.next;
        applied += res.applied;
      }
      continue;
    }
    if (change.type === "flow_popups") {
      const line = "    cy.on('window:confirm', () => false);";
      const res = insertOnce(src, line, /it\(.*?\{\s*$/m);
      if (res.next !== src) {
        src = res.next;
        applied += res.applied;
      }
      continue;
    }
    if (
      change.type === "test_data_update" ||
      change.type === "assertion_update"
    ) {
      const fromValue = String((change.from as any)?.value ?? "");
      const toValue = String((change.to as any)?.value ?? "");
      if (!fromValue || !toValue) continue;
      const pat = new RegExp(escapeRegExp(fromValue), "g");
      const next = src.replace(pat, toValue);
      if (next !== src) {
        src = next;
        applied++;
      }
      continue;
    }
  }

  if (applied && !options?.dryRun) await writeFile(testFilePath, src, "utf8");
  return { changed: applied > 0, applied };
}
