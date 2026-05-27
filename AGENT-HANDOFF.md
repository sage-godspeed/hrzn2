# Agent Handoff (hrzn)

## What this is

`hrzn` is a provider-agnostic TypeScript agent/CLI scaffold intended to:

- parse `testcases/*.md` (a parseable Markdown DSL)
- generate/maintain E2E tests (Playwright/Cypress)
- run tests, collect evidence, and self-heal tests within policy
- write an append-only **graph changelog** for E2E test evolution

## Current capabilities

- CLI supports `init` and `run <testcase.md|TEST_ID>` with `--projectRoot` and `--config`.
- Testcase Markdown parsing works (into a structured `TestcaseSpec`).
- Graph changelog writes `Run` + `TestCase` nodes/events to `e2e/changelog/e2e-graph.json`.
- Runner/healer/provider interfaces exist (no concrete runners or provider adapters yet).

## Next big pieces

- Implement Playwright/Cypress runners + artifact collection.
- Implement policy engine + healing loop + patch application.
- Implement real LLM provider adapters behind the `LLMProvider` interface.
