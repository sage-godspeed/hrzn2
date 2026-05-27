import type { FailureClass } from "../e2e/e2eRunner.ts";

export function classifyFailure(message: string): FailureClass {
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return "timing_flake";
  if (m.includes("locator") || m.includes("strict mode violation") || m.includes("waiting for")) return "selector_drift";
  if (m.includes("navigation") || m.includes("net::")) return "data_env";
  return "unknown";
}

