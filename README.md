# hrzn

hrzn is a TypeScript CLI for E2E tests. You write testcase markdown, hrzn generates tests, runs them, heals failures within policy, and records changes in a graph changelog.

## What it does

- Parses `testcases/*.md`.
- Generates and updates Playwright or Cypress tests.
- Runs tests and collects evidence.
- Heals tests within policy.
- Appends a graph changelog of test runs and changes.

## Requirements

- Node.js v22+ (uses `--experimental-strip-types`).
- Playwright or Cypress installed in the target project (see install below).

## Quick start in this repo

- Initialise scaffold: `node bin/hrzn2.js init`
- Run against a testcase: `node bin/hrzn2.js run AUTH-LOGIN-001`

## Use in another project

From this repo:

- `node bin/hrzn2.js init --projectRoot /path/to/project`
- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project`

If the config is elsewhere:

- `node bin/hrzn2.js run AUTH-LOGIN-001 --projectRoot /path/to/project --config /path/to/project/agent.config.json`

When the config file does not exist, hrzn will create a default `agent.config.json` at the target root during `init`.
If `testcases/TEMPLATE.md` is missing, `hrzn template` uses the built-in example and writes `TEMPLATE.md`.

## Install runner dependencies

- `hrzn install --runner playwright --with-browsers`
- `hrzn install --runner cypress`

## CLI reference

- `hrzn init [--projectRoot <dir>] [--config <path>]`
- `hrzn run <testcase.md|TEST_ID> [--projectRoot <dir>] [--config <path>]`
- `hrzn install [--runner <playwright|cypress|both>] [--packageManager <npm|pnpm|yarn>] [--with-browsers]`
- `hrzn template [TEST_ID] [--out <path>] [--overwrite] [--auto]`
- `hrzn synth <TEST_ID|testcase.md> [--overwrite] [--dry-run] [--report <path>] [--patch <path>]`
- `hrzn test <TEST_ID|testcase.md> [--suite <name> | --all] [--headed] [--retries N] [--dry-run] [--report <path>]`
- `hrzn heal <TEST_ID|testcase.md> [--suite <name> | --all] [--dry-run] [--report <path>] [--patch <path>] [--approve <path>]`

Notes:

- `--ci` prints a JSON report and uses non-zero exit codes on failures.
- Healing can propose testcase updates. If policy requires approval, hrzn writes a JSON file and exits in CI. Apply with `--approve <path>`.

## Configure AI provider

Edit `agent.config.json` and set `llm.provider` and `llm.model`.

Allowed providers:

- `llama`, `gemini`, `claude`, `gpt`, `kimi`, `qwen`, `deepseek`, `none`

Provider behaviour:

- If `llm.baseUrl` is set, hrzn uses it as an OpenAI compatible endpoint.
- If `llm.provider` is omitted, hrzn auto-detects from env vars (defaults to `gpt`).
- Set `llm.provider: "none"` to disable LLM calls.

Native adapters:

- `llama` uses the Ollama `/api/chat` endpoint and requires a model name.
- `deepseek` uses `/v1/chat/completions` with the DeepSeek base URL.

Common API key envs:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `DEEPSEEK_API_KEY`
- `QWEN_API_KEY`
- `KIMI_API_KEY`
- `LLAMA_API_KEY`

OpenAI compatible base URL envs:

- `HRZN_LLM_BASE_URL`, `LLM_BASE_URL`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_BASE_URL`

Provider specific base URL envs:

- `ANTHROPIC_BASE_URL` or `CLAUDE_BASE_URL`
- `DEEPSEEK_BASE_URL`
- `QWEN_BASE_URL`
- `KIMI_BASE_URL`
- `GEMINI_BASE_URL`
- `LLAMA_BASE_URL` or `OLLAMA_HOST`

Provider model envs:

- `OPENAI_MODEL`
- `CLAUDE_MODEL` or `ANTHROPIC_MODEL`
- `GEMINI_MODEL` or `GOOGLE_MODEL`
- `DEEPSEEK_MODEL`
- `QWEN_MODEL`
- `KIMI_MODEL`
- `OLLAMA_MODEL` or `LLAMA_MODEL`

### IDE detection

If VS Code settings are available, hrzn adopts the configured model and provider when `llm.provider` is not set. It falls back to env vars if no settings are found.

### Workspace policy overrides

If `AGENTS.md` exists at the project root, hrzn reads policy overrides such as:

- `allow: [selector_update, timing_waits]`
- `deny: [assertion_update]`
- `max_heal_iterations: 3`
- `require_evidence_for_changes: true`
- `allow_production_code_edits: false`
- `spec_updates_require_approval_for: [assertions, steps, preconditions]`

## Testcase format

Template file: [testcases/TEMPLATE.md](testcases/TEMPLATE.md)

Required sections:

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

- Steps use numbered entries, for example `1. op: value`.
- Assertions use dash entries, for example `- op: value`.
- Values can be JSON objects or arrays. Templates like `{{user.email}}` are supported.

## Install as a CLI in other projects

From this folder:

- `npm i -g .`
- Then run `hrzn ...` or `hrzn2 ...`

Alternative:

- `npm link` (in this folder)
- `npm link hrzn` (in the target project)

If `npm link` fails with permissions on macOS, rerun with `sudo npm link`.

## Publish to npm

1. Set `private` to `false` in `package.json`.
2. Run:

```bash
npm login
npm publish --access public
```

If you plan to publish under a scope, update `name` in `package.json` to `@scope/hrzn` first.
