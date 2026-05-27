# CHECKPOINT

Use this file to keep shared context for work in this repo. Keep entries short and factual.

## Current focus

- Maintain shared context for ongoing hrzn CLI work.
- Keep README structured and accurate.

## Recent changes

- Added native DeepSeek and Ollama (llama) providers.
- Added auto-creation of agent.config.json when missing.
- Exposed hrzn2 CLI name alongside hrzn.
- Documented config auto-creation, CLI names, and native adapter notes.
- Allowed template without TEST_ID and added default template fallback.
- Template now resets to the built-in example if required sections are missing.
- Template uses the auto-numbered filename for TestCase and Title.
- Auto-numbered template suffixes are zero-padded to three digits starting at 001.
- Scaffold now creates TEMPLATE.md without adding an example testcase file.
- Generated testcase filenames default to lowercase.
- Added --browsers to Playwright install for specific engines.
- Added run --all/--suite parsing and avoided double -001 suffixes for templates.
- Added rerun command backed by e2e/artifacts/last-run.json.

## Pending work

- None noted.

## Decisions

- Use Node.js v22+ with experimental strip-types for TS execution.
- Require Playwright or Cypress installed in target projects.

## Commands run

- npm i --package-lock-only
- node bin/hrzn2.js init
- node bin/hrzn2.js run AUTH-LOGIN-001
- npm link
- sudo npm link

## Notes

- LLM provider can be disabled with llm.provider: "none".
- hrzn install supports Playwright and Cypress runners.
- hrzn2 now auto-creates agent.config.json if missing.
