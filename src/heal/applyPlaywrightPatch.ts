import { readFile, writeFile } from "node:fs/promises";
import type { PatchPlan } from "./patchPlan.ts";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function applyPlaywrightPatch(testFilePath: string, plan: PatchPlan): Promise<{ changed: boolean; applied: number }> {
  let src = await readFile(testFilePath, "utf8");
  let applied = 0;

  for (const change of plan.changes) {
    if (change.type !== "selector_update") continue;
    const targetText = String(change.from?.value ?? "");
    const toStrategy = String(change.to?.strategy ?? "");
    const toValue = String(change.to?.value ?? "");
    if (!targetText || !toStrategy || !toValue) continue;

    // Minimal pattern: replace getByRole("button", { name: "<targetText>" }) with getByTestId("<toValue>")
    const pat = new RegExp(
      `page\\.getByRole\\(\\s*["']button["']\\s*,\\s*\\{\\s*name:\\s*["']${escapeRegExp(targetText)}["']\\s*\\}\\s*\\)`,
      "g"
    );
    const replacement = toStrategy === "testid" ? `page.getByTestId(${JSON.stringify(toValue)})` : null;
    if (!replacement) continue;

    const next = src.replace(pat, replacement);
    if (next !== src) {
      src = next;
      applied++;
    }
  }

  if (applied) await writeFile(testFilePath, src, "utf8");
  return { changed: applied > 0, applied };
}

