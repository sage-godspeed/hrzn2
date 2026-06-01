import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTestcaseMarkdown } from "../src/spec/parser.ts";

test("parseTestcaseMarkdown parses core fields and policy", () => {
  const md = [
    "# TestCase: AUTH-LOGIN-001",
    "## Title",
    "Login works",
    "## Tags",
    "- feature: auth",
    "- priority: high",
    "## Runner",
    "- preferred: playwright",
    "- suite: smoke",
    "## Preconditions",
    "- user.role: admin",
    '- org: "ACME"',
    "## Data",
    '- user.email: "a@b.com"',
    '- user.meta: { foo: "bar" }',
    "## Steps",
    "1. goto: /login",
    '2. fill: { target: "Email", value: "{{user.email}}" }',
    '3. click: "Log in"',
    "## Assertions",
    '- url_contains: "/dashboard"',
    "## Locators (Optional)",
    '- strategy_order: ["testid", "role"]',
    "- map:",
    '  loginButton: { testid: "login-submit" }',
    "## Healing Policy",
    "- allow:",
    "- selector_update",
    "- deny:",
    "- assertion_update",
    'require_approval_for: ["assertions"]',
  ].join("\n");

  const spec = parseTestcaseMarkdown(md);
  assert.equal(spec.id, "AUTH-LOGIN-001");
  assert.equal(spec.title, "Login works");
  assert.equal(spec.preferredRunner, "playwright");
  assert.equal(spec.suite, "smoke");
  assert.equal(spec.tags.feature, "auth");
  assert.equal(spec.tags.priority, "high");
  assert.deepEqual(spec.preconditions, {
    user: { role: "admin" },
    org: "ACME",
  });
  assert.deepEqual(spec.data, {
    user: { email: "a@b.com", meta: { foo: "bar" } },
  });
  assert.deepEqual(spec.locators?.strategyOrder, ["testid", "role"]);
  assert.equal(spec.locators?.map?.loginButton?.testid, "login-submit");
  assert.deepEqual(spec.healingPolicy?.allow, ["selector_update"]);
  assert.deepEqual(spec.healingPolicy?.deny, ["assertion_update"]);
  assert.deepEqual(spec.healingPolicy?.specUpdatesRequireApprovalFor, [
    "assertions",
  ]);
});

test("parseTestcaseMarkdown throws on missing Title", () => {
  const md = [
    "# TestCase: AUTH-LOGIN-002",
    "## Tags",
    "- feature: auth",
    "## Runner",
    "- preferred: playwright",
    "## Preconditions",
    "- user.role: admin",
    "## Data",
    '- user.email: "a@b.com"',
    "## Steps",
    "1. goto: /login",
    "## Assertions",
    '- url_contains: "/dashboard"',
  ].join("\n");

  assert.throws(() => parseTestcaseMarkdown(md), /Missing ## Title/);
});
