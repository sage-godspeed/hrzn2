# Agent Handoff (hrzn)

## What this is

`hrzn` is a provider-agnostic TypeScript agent/CLI scaffold intended to:

- parse `testcases/*.md` (a parseable Markdown DSL)
- generate/maintain E2E tests (Playwright/Cypress)
- run tests, collect evidence, and self-heal tests within policy
- write an append-only **graph changelog** for E2E test evolution

## Current capabilities

- CLI supports `init`, `run`, `template`, `synth`, `test`, and `heal` with `--projectRoot`, `--config`, and CI/report flags.
- Testcase Markdown parsing + serialization works (spec edits can be applied with approval gating).
- Playwright/Cypress runners collect artifacts and parse JSON failure output.
- Healing loop applies patches within policy and can propose spec updates.
- Graph changelog writes `Run` + `Change` nodes and tracks active test edges.
- Provider wiring supports OpenAI-compat plus native Claude/Gemini adapters.
- Workspace policy overrides are parsed from `AGENTS.md`.

## Next big pieces

- Add native DeepSeek/Qwen/Kimi adapters if needed (OpenAI-compat already works).
- Add CI/test automation coverage (lint/tests) and docs for verification steps.
- Add publish automation (npm scripts, release workflow).
