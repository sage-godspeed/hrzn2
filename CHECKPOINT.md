# Checkpoint (hrzn)

Date: 2026-05-27 (Africa/Lagos)

## What’s working now

- `hrzn` CLI runs locally (Node v22+ strip-types): `node bin/hrzn2.js ...`
- `init` creates scaffold folders + example testcase if missing.
- `run` parses a testcase, prints selected LLM provider + effective policy, and logs runs to the graph changelog.
- `template` generates testcase templates (supports `--auto`).
- `synth` generates Playwright/Cypress tests (respects `preferredRunner`).
- `test` runs Playwright/Cypress and collects artifacts + runner logs.
- `heal` runs the healing loop, applies patches within policy, and can propose spec updates.
- Policy engine supports workspace overrides via `AGENTS.md` and testcase allow/deny merging.
- LLM providers include OpenAI-compat plus native Claude/Gemini adapters; `none` disables LLM calls.
- Graph changelog writes `Run` + `Change` nodes and tracks active test edges.

## Key files

- Config: `agent.config.json`
- CLI: `src/cli.ts`
- Spec example: `src/spec/example.ts`
- Spec parser: `src/spec/parser.ts`
- Graph changelog writer: `src/graph/changelog.ts`
- Policy engine + default policy: `src/policy/policyEngine.ts`, `src/policy/defaultPolicy.ts`
- LLM provider wiring: `src/llm/loadProvider.ts`, `src/llm/providers/*`
- Synthesizer: `src/synthesizer/*`
- Runners: `src/e2e/*`
- Healer: `src/heal/*`
- Spec update/serialization: `src/spec/update.ts`, `src/spec/serialize.ts`

## How to run

- `node bin/hrzn2.js init`
- `node bin/hrzn2.js run AUTH-LOGIN-001`
- `node bin/hrzn2.js run testcases/AUTH-LOGIN-001.md`
- Cross-project targeting: `--projectRoot <dir>` and `--config <path>`

## Current git history (high level)

- `Initial scaffold: spec parser + graph log`
- `Add runner/healer/provider interfaces`
- `Add installable CLI + projectRoot/config flags`
- `Run without build step (Node strip-types)`
- `Rename CLI and agent to hrzn`
- `Add LLM provider allowlist + config wiring`
- `Add default safe policy engine`

## What’s not implemented yet (next milestones)

- Native adapters for DeepSeek/Qwen/Kimi (optional; OpenAI-compat works).
- Automated CI/lint/test workflow.
- Publish automation and release docs.

## Next suggested task (to unblock everything)

Add a CI workflow and publish automation (npm release steps).
