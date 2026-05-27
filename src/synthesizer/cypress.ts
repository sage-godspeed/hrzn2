import { renderTemplate } from "./template.ts";
import type { TestcaseSpec } from "../spec/types.ts";

function jsString(s: string) {
  return JSON.stringify(s);
}

function locatorFromTarget(target: any, spec: TestcaseSpec): string {
  const map = spec.locators?.map ?? {};
  if (typeof target === "string" && map[target]) {
    return locatorFromTarget(map[target], spec);
  }
  if (typeof target === "string") {
    return `cy.contains(${jsString(target)})`;
  }
  if (target && typeof target === "object") {
    if (target.testid)
      return `cy.get(${jsString(`[data-testid="${String(target.testid)}"]`)})`;
    if (target.text) return `cy.contains(${jsString(String(target.text))})`;
    if (target.css) return `cy.get(${jsString(String(target.css))})`;
  }
  return "cy.get('body')";
}

export function synthesizeCypressTest(spec: TestcaseSpec): {
  fileName: string;
  contents: string;
} {
  const id = spec.id;
  const title = spec.title;
  const baseUrl = String(
    spec.preconditions?.base_url ?? spec.preconditions?.baseUrl ?? "",
  );

  const lines: string[] = [];
  lines.push("describe(" + jsString(`${id} - ${title}`) + ", () => {");
  lines.push("  const fillByLabel = (label, value) => {");
  lines.push("    cy.contains('label', label).then(($label) => {");
  lines.push("      const id = $label.attr('for');");
  lines.push("      if (id) {");
  lines.push("        cy.get('#' + id).clear().type(value);");
  lines.push("      } else {");
  lines.push(
    "        cy.wrap($label).find('input, textarea, select').first().clear().type(value);",
  );
  lines.push("      }");
  lines.push("    });");
  lines.push("  };");
  lines.push("");
  lines.push("  it(" + jsString("runs") + ", () => {");

  if (baseUrl) {
    lines.push(`    cy.visit(${jsString(baseUrl)});`);
  }

  for (const step of spec.steps) {
    const op = Object.keys(step)[0] ?? "";
    const val = (step as any)[op];
    if (op === "goto") {
      const path = renderTemplate(String(val), spec.data);
      const url = baseUrl ? new URL(path, baseUrl).toString() : path;
      lines.push(`    cy.visit(${jsString(url)});`);
      continue;
    }
    if (op === "fill" && val && typeof val === "object") {
      const field = renderTemplate(String((val as any).field ?? ""), spec.data);
      const value = renderTemplate(String((val as any).value ?? ""), spec.data);
      lines.push(`    fillByLabel(${jsString(field)}, ${jsString(value)});`);
      continue;
    }
    if (op === "click") {
      const target = val && typeof val === "object" ? (val as any).target : val;
      const t = renderTemplate(String(target ?? ""), spec.data);
      lines.push(`    ${locatorFromTarget(t, spec)}.click();`);
      continue;
    }
    if (op === "wait_for") {
      const timeout = Number((val as any)?.ms ?? (val as any)?.timeout ?? 1000);
      lines.push(`    cy.wait(${Number.isFinite(timeout) ? timeout : 1000});`);
      continue;
    }
    lines.push(`    // TODO: unsupported step op '${op}'`);
  }

  for (const assertion of spec.assertions) {
    const op = Object.keys(assertion)[0] ?? "";
    const val = (assertion as any)[op];
    if (op === "url_contains") {
      const s = renderTemplate(String(val), spec.data);
      lines.push(`    cy.url().should('include', ${jsString(s)});`);
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
          ? `cy.contains(${jsString(renderTemplate(text, spec.data))})`
          : locatorFromTarget(target, spec);
      lines.push(
        `    ${locator}.should('${op === "visible" ? "be.visible" : "not.be.visible"}');`,
      );
      continue;
    }
    if (op === "text_contains" && val && typeof val === "object") {
      const target = (val as any).target;
      const text = renderTemplate(String((val as any).text ?? ""), spec.data);
      lines.push(
        `    ${locatorFromTarget(target, spec)}.should('contain.text', ${jsString(text)});`,
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
        `    ${locatorFromTarget(target, spec)}.should('have.text', ${jsString(expected)});`,
      );
      continue;
    }
    lines.push(`    // TODO: unsupported assertion op '${op}'`);
  }

  lines.push("  });");
  lines.push("});");
  lines.push("");

  return {
    fileName: `${id}.cy.ts`,
    contents: lines.join("\n"),
  };
}
