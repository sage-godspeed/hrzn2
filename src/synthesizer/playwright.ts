import { renderTemplate } from "./template.ts";
import type { TestcaseSpec } from "../spec/types.ts";

function jsString(s: string) {
  return JSON.stringify(s);
}

function opKey(step: Record<string, unknown>): string {
  const k = Object.keys(step)[0];
  return k ?? "";
}

function opVal(step: Record<string, unknown>): any {
  const k = opKey(step);
  return (step as any)[k];
}

function locatorFromTarget(target: any, spec: TestcaseSpec): string {
  const map = spec.locators?.map ?? {};
  if (typeof target === "string" && map[target]) {
    return locatorFromTarget(map[target], spec);
  }
  if (typeof target === "string") {
    if (target === "h1") return `page.locator("h1")`;
    return `page.getByText(${jsString(target)})`;
  }
  if (target && typeof target === "object") {
    if (target.testid)
      return `page.getByTestId(${jsString(String(target.testid))})`;
    if (target.role)
      return `page.getByRole(${jsString(String(target.role))}${target.name ? `, { name: ${jsString(String(target.name))} }` : ""})`;
    if (target.text) return `page.getByText(${jsString(String(target.text))})`;
    if (target.css) return `page.locator(${jsString(String(target.css))})`;
  }
  return `page.locator("body")`;
}

export function synthesizePlaywrightTest(spec: TestcaseSpec): {
  fileName: string;
  contents: string;
} {
  const id = spec.id;
  const title = spec.title;
  const baseUrl = String(
    spec.preconditions?.base_url ?? spec.preconditions?.baseUrl ?? "",
  );

  const lines: string[] = [];
  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push("");
  lines.push(`test(${jsString(`${id} - ${title}`)}, async ({ page }) => {`);

  if (baseUrl) {
    lines.push(`  await page.goto(${jsString(baseUrl)});`);
  }

  for (const step of spec.steps) {
    const op = opKey(step);
    const val = opVal(step);
    if (op === "goto") {
      const path = renderTemplate(String(val), spec.data);
      lines.push(
        `  await page.goto(${jsString(baseUrl ? new URL(path, baseUrl).toString() : path)});`,
      );
      continue;
    }
    if (op === "fill" && val && typeof val === "object") {
      const field = renderTemplate(String((val as any).field ?? ""), spec.data);
      const value = renderTemplate(String((val as any).value ?? ""), spec.data);
      lines.push(
        `  await page.getByLabel(${jsString(field)}).fill(${jsString(value)});`,
      );
      continue;
    }
    if (op === "click") {
      if (val && typeof val === "object") {
        const target = (val as any).target;
        const t = renderTemplate(String(target ?? ""), spec.data);
        const locator = spec.locators?.map?.[String(t)]
          ? locatorFromTarget(t, spec)
          : `page.getByRole("button", { name: ${jsString(t)} })`;
        lines.push(`  await ${locator}.click();`);
      } else {
        const t = renderTemplate(String(val ?? ""), spec.data);
        const locator = spec.locators?.map?.[String(t)]
          ? locatorFromTarget(t, spec)
          : `page.getByRole("button", { name: ${jsString(t)} })`;
        lines.push(`  await ${locator}.click();`);
      }
      continue;
    }
    if (op === "select" && val && typeof val === "object") {
      const field = renderTemplate(String((val as any).field ?? ""), spec.data);
      const value = renderTemplate(String((val as any).value ?? ""), spec.data);
      lines.push(
        `  await page.getByLabel(${jsString(field)}).selectOption(${jsString(value)});`,
      );
      continue;
    }
    if (op === "wait_for") {
      if (val && typeof val === "object") {
        const target = (val as any).target;
        const timeout = Number((val as any).ms ?? (val as any).timeout ?? 1000);
        lines.push(
          `  await ${locatorFromTarget(target, spec)}.waitFor({ timeout: ${Number.isFinite(timeout) ? timeout : 1000} });`,
        );
      } else {
        const timeout = Number(val ?? 1000);
        lines.push(
          `  await page.waitForTimeout(${Number.isFinite(timeout) ? timeout : 1000});`,
        );
      }
      continue;
    }
    if (op === "press" && val && typeof val === "object") {
      const key = String((val as any).key ?? "");
      lines.push(`  await page.keyboard.press(${jsString(key)});`);
      continue;
    }
    lines.push(`  // TODO: unsupported step op '${op}'`);
  }

  for (const assertion of spec.assertions) {
    const op = opKey(assertion);
    const val = opVal(assertion);
    if (op === "url_contains") {
      const s = renderTemplate(String(val), spec.data);
      lines.push(`  await expect(page).toHaveURL(new RegExp(${jsString(s)}));`);
      continue;
    }
    if (
      (op === "visible" || op === "not_visible") &&
      val &&
      typeof val === "object"
    ) {
      const target = (val as any).target;
      const text = (val as any).text;
      const locator =
        target === "text" && typeof text === "string"
          ? `page.getByText(${jsString(renderTemplate(text, spec.data))})`
          : locatorFromTarget(target, spec);
      lines.push(
        `  await expect(${locator}).${op === "visible" ? "toBeVisible" : "toBeHidden"}();`,
      );
      continue;
    }
    if (op === "text_contains" && val && typeof val === "object") {
      const target = (val as any).target;
      const text = renderTemplate(String((val as any).text ?? ""), spec.data);
      lines.push(
        `  await expect(${locatorFromTarget(target, spec)}).toContainText(${jsString(text)});`,
      );
      continue;
    }
    if (op === "equals" && val && typeof val === "object") {
      const target = (val as any).target;
      const expected = renderTemplate(
        String((val as any).value ?? (val as any).expected ?? ""),
        spec.data,
      );
      lines.push(
        `  await expect(${locatorFromTarget(target, spec)}).toHaveText(${jsString(expected)});`,
      );
      continue;
    }
    lines.push(`  // TODO: unsupported assertion op '${op}'`);
  }

  lines.push("});");
  lines.push("");

  return {
    fileName: `${id}.spec.ts`,
    contents: lines.join("\n"),
  };
}
