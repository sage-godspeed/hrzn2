# Provider-agnostic E2E agent (Cypress + Playwright)

This folder contains a TypeScript agent that:
- parses `testcases/*.md`
- generates/updates E2E tests (Playwright or Cypress)
- runs tests and collects evidence
- self-heals **tests** (selectors/timing/flow handlers) within policy
- appends an append-only graph changelog

## Configure agent name
Edit `agent.config.json` → `agentName`.

## Dev
1. Install deps: `npm i` (or `pnpm i` / `yarn`)
2. Run: `npm run dev -- run testcases/AUTH-LOGIN-001.md`
