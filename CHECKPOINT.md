# Checkpoint (hrzn)

Date: 2026-05-27 (Africa/Lagos)

## What’s working now

- `hrzn` CLI runs locally (Node v22+ strip-types): `node bin/hrzn2.js ...`
- `init` creates scaffold folders + example testcase if missing.
- `run` parses a testcase (`testcases/<ID>.md` or a path), prints selected LLM provider + effective policy, and appends a run event to `e2e/changelog/e2e-graph.json`.
- A default safe policy engine exists and is applied when no workspace rules are found; it merges testcase `Healing Policy` allow/deny.
- LLM provider selection is validated against an allowlist: `llama|gemini|claude|gpt|kimi|qwen|deepseek` (adapters are placeholders; no network calls yet).
- Git repo initialized; commit history created to track major iterations.

## Key files

- Config: `agent.config.json`
- CLI: `src/cli.ts`
- Spec example: `src/spec/example.ts`
- Spec parser: `src/spec/parser.ts`
- Graph changelog writer: `src/graph/changelog.ts`
- Policy engine + default policy: `src/policy/policyEngine.ts`, `src/policy/defaultPolicy.ts`
- LLM provider wiring (placeholder): `src/llm/loadProvider.ts`, `src/llm/providers/placeholder.ts`

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

- Real LLM provider adapters (including `llama` local / OpenAI-compatible endpoint support).
- Playwright/Cypress runner implementations + evidence collection.
- Spec → test synthesizer (generate actual E2E test files).
- Patch plan execution (apply changes to tests) + self-heal loop (triage → patch → rerun).
- Changelog expansion to include explicit “Change” nodes + artifact references.
- CI-friendly output (`--ci`, `--dry-run`, run report JSON, PR/patch workflows).

## Next suggested task (to unblock everything)

Implement `llama` local provider via an OpenAI-compatible `baseUrl` (or `ollama` CLI), then implement Playwright runner first (best artifacts for healing).
