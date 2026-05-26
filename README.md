# hrzn2 (Provider-agnostic E2E agent)

This folder contains a TypeScript agent that:
- parses `testcases/*.md`
- generates/updates E2E tests (Playwright or Cypress)
- runs tests and collects evidence
- self-heals **tests** (selectors/timing/flow handlers) within policy
- appends an append-only graph changelog

## Configure agent name
Edit `agent.config.json` → `agentName`.

## Configure AI provider
Edit `agent.config.json` → `llm.provider` and `llm.model`.
- Allowed providers: `llama`, `gemini`, `claude`, `gpt`, `kimi`, `qwen`, `deepseek`
- Adapters are placeholders for now (no network calls yet); selecting a provider is validated and surfaced by the CLI.
- API keys are intended to come from env vars in CI (names default by provider; overridable via `llm.apiKeyEnv`).

## Requirements
- Node.js v22+ (uses `--experimental-strip-types` to run TypeScript without a build step).

## Run (this project)
- Initialize scaffold: `node bin/hrzn2.js init`
- Run against a testcase: `node bin/hrzn2.js run AUTH-LOGIN-001`

## Run against another project (reuse)
From *this* repo (short + memorable):
- `node bin/hrzn2.js init --projectRoot /path/to/project`
- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project`

If the other project keeps its config elsewhere:
- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project --config /path/to/project/agent.config.json`

## CLI
- `hrzn2 init [--projectRoot <dir>] [--config <path>]`
- `hrzn2 run <testcase.md|TEST_ID> [--projectRoot <dir>] [--config <path>]`

### Install as a CLI in other projects (no publishing)
From this folder:
- Global install from a local path: `npm i -g .`
- Then you can run: `hrzn2 ...`

Alternative (dev linking):
- `npm link` (in this folder)
- `npm link agent-e2e-autofix` (in the target project)
