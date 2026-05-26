import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAgentConfig } from "./config.ts";
import { ensureProjectScaffold } from "./scaffold.ts";
import { parseTestcaseMarkdown } from "./spec/parser.ts";
import { GraphChangelog } from "./graph/changelog.ts";
import { loadProvider } from "./llm/loadProvider.ts";
import { resolvePolicy } from "./policy/policyEngine.ts";

type Command = "init" | "run";

function usage(agentName: string) {
  return [
    `${agentName}: provider-agnostic E2E self-healing agent`,
    "",
    "Usage:",
    `  ${agentName} init [--projectRoot <dir>] [--config <path>]`,
    `  ${agentName} run <testcase.md> [--projectRoot <dir>] [--config <path>]`,
    "",
    "Flags:",
    "  --projectRoot <dir>   Run against another repo/project root",
    "  --config <path>       Path to agent.config.json (defaults to <projectRoot>/agent.config.json)"
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

  if (!cmd || (cmd !== "init" && cmd !== "run")) {
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
  process.stdout.write(`Policy: ${resolved.policy.source} (allow: ${resolved.policy.allow.join(", ")})\n`);
  process.stdout.write(`Next: implement runners + synthesizer; this scaffold currently parses + logs.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + "\n");
    process.exit(1);
  });
}
