export function renderTemplate(input: string, vars: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([A-Za-z0-9._-]+)\s*\}\}/g, (_m, key) => {
    const parts = String(key).split(".");
    let cur: any = vars;
    for (const p of parts) cur = cur?.[p];
    if (cur == null) return "";
    return String(cur);
  });
}

