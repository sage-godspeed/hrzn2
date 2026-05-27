# hrzn (Provider-agnostic E2E agent)

This folder contains a TypeScript agent that:

- parses `testcases/*.md`
- generates/updates E2E tests (Playwright or Cypress)
- runs tests and collects evidence
- self-heals **tests** (selectors/timing/flow handlers) within policy
- appends an append-only graph changelog

## Configure AI provider

Edit `agent.config.json` → `llm.provider` and `llm.model`.

- Allowed providers: `llama`, `gemini`, `claude`, `gpt`, `kimi`, `qwen`, `deepseek`, `none`
- If `llm.baseUrl` is set, hrzn treats it as an OpenAI-compatible endpoint (recommended for local Llama).
- If `llm.provider` is omitted, hrzn auto-detects from common env vars (or defaults to `gpt`).
- API keys are intended to come from env vars in CI (names default by provider; overridable via `llm.apiKeyEnv`).
- Set `llm.provider: "none"` to disable LLM calls (commands that require the LLM, like `heal`, will fail with a clear error).

Common API key envs:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `DEEPSEEK_API_KEY`
- `QWEN_API_KEY`
- `KIMI_API_KEY`
- `LLAMA_API_KEY`

You can also set an OpenAI-compatible base URL via env vars:

- `HRZN_LLM_BASE_URL`, `LLM_BASE_URL`, `OPENAI_COMPAT_BASE_URL`, or `OPENAI_BASE_URL`

Provider-specific base URL envs are supported too:

- `ANTHROPIC_BASE_URL` or `CLAUDE_BASE_URL`
- `DEEPSEEK_BASE_URL`
- `QWEN_BASE_URL`
- `KIMI_BASE_URL`
- `GEMINI_BASE_URL`
- `LLAMA_BASE_URL` or `OLLAMA_HOST`

Provider model envs (optional):

- `OPENAI_MODEL`
- `CLAUDE_MODEL` or `ANTHROPIC_MODEL`
- `GEMINI_MODEL` or `GOOGLE_MODEL`
- `DEEPSEEK_MODEL`
- `QWEN_MODEL`
- `KIMI_MODEL`
- `OLLAMA_MODEL` or `LLAMA_MODEL`

### IDE detection (optional)

If VS Code settings are available, hrzn adopts the configured model/provider when `llm.provider` is not set in config.
It falls back to environment variables when no VS Code settings are found.

### Workspace policy overrides

If `AGENTS.md` exists at the project root, hrzn will read simple policy overrides such as:

- `allow: [selector_update, timing_waits]`
- `deny: [assertion_update]`
- `max_heal_iterations: 3`
- `require_evidence_for_changes: true`
- `allow_production_code_edits: false`
- `spec_updates_require_approval_for: [assertions, steps, preconditions]`

## Requirements

- Node.js v22+ (uses `--experimental-strip-types` to run TypeScript without a build step).

## Run (this project)

- Initialize scaffold: `node bin/hrzn2.js init`
- Run against a testcase: `node bin/hrzn2.js run AUTH-LOGIN-001`

## Run against another project (reuse)

From _this_ repo (short + memorable):

- `node bin/hrzn2.js init --projectRoot /path/to/project`
- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project`

If the other project keeps its config elsewhere:

- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project --config /path/to/project/agent.config.json`

## CLI

- `hrzn init [--projectRoot <dir>] [--config <path>]`
- `hrzn run <testcase.md|TEST_ID> [--projectRoot <dir>] [--config <path>]`
- `hrzn template <TEST_ID> [--out <path>] [--overwrite] [--auto]`
- `hrzn synth <TEST_ID|testcase.md> [--overwrite] [--dry-run] [--report <path>] [--patch <path>]`
- `hrzn test <TEST_ID|testcase.md> [--suite <name> | --all] [--headed] [--retries N] [--dry-run] [--report <path>]`
- `hrzn heal <TEST_ID|testcase.md> [--suite <name> | --all] [--dry-run] [--report <path>] [--patch <path>] [--approve <path>]`

Spec updates:

- Healing can propose testcase.md edits.
- If policy requires approval, hrzn writes a JSON file and exits in CI.
- Apply an approved update with `--approve <path>`.

`--ci` prints a JSON report to stdout and uses non-zero exit codes on failures.

## Testcase format

Template file: [testcases/TEMPLATE.md](testcases/TEMPLATE.md)

Required sections (missing any will error):

- `# TestCase: <ID>`
- `## Title`
- `## Tags`
- `## Runner`
- `## Preconditions`
- `## Data`
- `## Steps`
- `## Assertions`

Optional sections:

- `## Locators (Optional)`
- `## Healing Policy`

Notes:

- `Steps` use numbered entries: `1. op: value`.
- `Assertions` use dash entries: `- op: value`.
- Values can be JSON objects or arrays, and templates like `{{user.email}}` are supported.

### Install as a CLI in other projects (no publishing)

From this folder:

- Global install from a local path: `npm i -g .`
- Then you can run: `hrzn ...`

Alternative (dev linking):

- `npm link` (in this folder)
- `npm link hrzn` (in the target project)

### Publish to npm

1) Set `private` to `false` in `package.json`.
2) Log in and publish:

```bash
npm login
npm publish --access public
```

If you plan to publish under a scope, update `name` in `package.json` to `@scope/hrzn` first.
