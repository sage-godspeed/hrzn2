import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAgentConfig } from "./config.ts";
import { ensureProjectScaffold } from "./scaffold.ts";
import { parseTestcaseMarkdown } from "./spec/parser.ts";
import { GraphChangelog } from "./graph/changelog.ts";
import { loadProvider } from "./llm/loadProvider.ts";
import { resolvePolicy } from "./policy/policyEngine.ts";
import { runE2E } from "./e2e/index.ts";
import { synthesizeTest } from "./synthesizer/index.ts";
import { healLoop } from "./heal/healLoop.ts";

type Command = "init" | "run" | "test" | "synth" | "heal";

function usage(agentName: string) {
  return [
    `${agentName}: provider-agnostic E2E self-healing agent`,
    "",
    "Usage:",
    `  ${agentName} init [--projectRoot <dir>] [--config <path>]`,
    `  ${agentName} run <testcase.md> [--projectRoot <dir>] [--config <path>]`,
    `  ${agentName} synth <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>] [--overwrite]`,
    `  ${agentName} test <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>] [--headed] [--retries N]`,
    `  ${agentName} heal <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>]`,
    "",
    "Flags:",
    "  --projectRoot <dir>   Run against another repo/project root",
    "  --config <path>       Path to agent.config.json (defaults to <projectRoot>/agent.config.json)",
    "  --overwrite           Overwrite generated test file (synth)",
    "  --headed              Run browser headed (Playwright)",
    "  --retries N            Retries for failing tests (Playwright)"
  ].join("\n");
}

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--projectRoot") {
      flags.projectRoot = argv[++i] ?? "";
      continue;
    }
    if (a === "--config") {
      flags.config = argv[++i] ?? "";
      continue;
    }
    if (a === "--headed") {
      flags.headed = "true";
      continue;
    }
    if (a === "--retries") {
      flags.retries = argv[++i] ?? "";
      continue;
    }
    if (a === "--overwrite") {
      flags.overwrite = "true";
      continue;
    }
    positional.push(a);
  }
  return { flags, positional };
}

export async function main() {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const projectRoot = flags.projectRoot ? resolve(flags.projectRoot) : process.cwd();
  const configPath = flags.config ? resolve(flags.config) : resolve(projectRoot, "agent.config.json");

  const config = await loadAgentConfig({ projectRoot, configPath });
  const agentName = config.agentName;

  const cmd = (positional[0] ?? "") as Command;

  if (!cmd || (cmd !== "init" && cmd !== "run" && cmd !== "test" && cmd !== "synth" && cmd !== "heal")) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  await ensureProjectScaffold(config);
  const llm = loadProvider(config);
  const basePolicy = await resolvePolicy({ projectRoot: config.projectRoot });

  if (cmd === "init") {
    const graph = await GraphChangelog.openOrCreate(config.paths.graphChangelogPath);
    await graph.appendRun({
      runner: config.defaultRunner,
      summary: "Initialized graph changelog",
      artifacts: { policySource: basePolicy.policy.source, agentsMd: basePolicy.workspaceRules.agentsMdPath ?? null },
      testcases: []
    });
    process.stdout.write(`Initialized. Config agentName=${agentName}\n`);
    process.stdout.write(`LLM provider: ${llm.name}\n`);
    process.stdout.write(`LLM detectedFrom: ${config.llm.detectedFrom ?? "config"}\n`);
    process.stdout.write(`Policy: ${basePolicy.policy.source} (allow: ${basePolicy.policy.allow.join(", ")})\n`);
    return;
  }

  const testcasePath = positional[1];
  if (!testcasePath) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  const normalized =
    testcasePath.endsWith(".md") || testcasePath.includes("/") || testcasePath.includes("\\")
      ? testcasePath
      : resolve(config.paths.testcasesDir, `${testcasePath}.md`);

  const abs = resolve(projectRoot, normalized);
  const md = await readFile(abs, "utf8");
  const spec = parseTestcaseMarkdown(md);
  const resolved = await resolvePolicy({ projectRoot: config.projectRoot, spec });

  const graph = await GraphChangelog.openOrCreate(config.paths.graphChangelogPath);
  await graph.upsertTestcaseNode(spec);
  await graph.appendRun({
    runner: config.defaultRunner,
    summary: `Parsed testcase ${spec.id}`,
    artifacts: { policySource: resolved.policy.source, agentsMd: resolved.workspaceRules.agentsMdPath ?? null },
    testcases: [spec.id]
  });

  process.stdout.write(`Parsed testcase: ${spec.id} (${spec.title})\n`);
  process.stdout.write(`LLM provider: ${llm.name}\n`);
  process.stdout.write(`LLM detectedFrom: ${config.llm.detectedFrom ?? "config"}\n`);
  process.stdout.write(`Policy: ${resolved.policy.source} (allow: ${resolved.policy.allow.join(", ")})\n`);

  if (cmd === "run") {
    process.stdout.write(`Next: implement runners + synthesizer; this scaffold currently parses + logs.\n`);
    return;
  }

  if (cmd === "synth") {
    const overwrite = flags.overwrite === "true";
    const result = await synthesizeTest(config, spec, { overwrite });
    process.stdout.write(result.wrote ? `Synthesized: ${result.outPath}\n` : `Skipped (exists): ${result.outPath}\n`);
    return;
  }

  if (cmd === "heal") {
    const { finalEvidence, iterations, plans } = await healLoop({ config, spec, policy: resolved.policy, llm });
    const runNodeId = await graph.appendRun({
      runner: config.defaultRunner,
      summary: finalEvidence.failingTests.length ? `Heal failed for ${spec.id}` : `Heal passed for ${spec.id}`,
      artifacts: { runId: finalEvidence.runId, policySource: resolved.policy.source },
      testcases: [spec.id]
    });
    // Record changes (best-effort). We don't track file diffs yet; we at least store change kinds.
    for (const p of plans) {
      await graph.appendChange({
        runNodeId,
        kind: "heal_plan",
        confidence: p.confidence,
        summary: `${p.classification}`,
        modifiedFiles: [`e2e/tests/${spec.id}.spec.ts`],
        detail: { changes: p.changes }
      });
    }

    process.stdout.write(finalEvidence.failingTests.length ? `Heal: FAIL after ${iterations}\n` : `Heal: PASS after ${iterations}\n`);
    return;
  }

  const retries = flags.retries ? Number(flags.retries) : undefined;
  const headed = flags.headed === "true";
  const evidence = await runE2E(config, { testId: spec.id, headed, retries });

  await graph.appendRun({
    runner: config.defaultRunner,
    summary: evidence.failingTests.length ? `E2E failed for ${spec.id}` : `E2E passed for ${spec.id}`,
    artifacts: { policySource: resolved.policy.source, agentsMd: resolved.workspaceRules.agentsMdPath ?? null, runId: evidence.runId },
    testcases: [spec.id]
  });

  process.stdout.write(evidence.failingTests.length ? "E2E: FAIL\n" : "E2E: PASS\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + "\n");
    process.exit(1);
  });
}
