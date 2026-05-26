import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAgentConfig } from "./config.js";
import { ensureProjectScaffold } from "./scaffold.js";
import { parseTestcaseMarkdown } from "./spec/parser.js";
import { GraphChangelog } from "./graph/changelog.js";

type Command = "init" | "run";

function usage(agentName: string) {
  return [
    `${agentName}: provider-agnostic E2E self-healing agent`,
    "",
    "Usage:",
    `  ${agentName} init`,
    `  ${agentName} run <testcase.md>`
  ].join("\n");
}

async function main() {
  const config = await loadAgentConfig();
  const agentName = config.agentName;

  const args = process.argv.slice(2);
  const cmd = (args[0] ?? "") as Command;

  if (!cmd || (cmd !== "init" && cmd !== "run")) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  await ensureProjectScaffold(config);

  if (cmd === "init") {
    const graph = await GraphChangelog.openOrCreate(config.paths.graphChangelogPath);
    await graph.appendRun({
      runner: config.defaultRunner,
      summary: "Initialized graph changelog",
      artifacts: {},
      testcases: []
    });
    process.stdout.write(`Initialized. Config agentName=${agentName}\n`);
    return;
  }

  const testcasePath = args[1];
  if (!testcasePath) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  const abs = resolve(testcasePath);
  const md = await readFile(abs, "utf8");
  const spec = parseTestcaseMarkdown(md);

  const graph = await GraphChangelog.openOrCreate(config.paths.graphChangelogPath);
  await graph.upsertTestcaseNode(spec);
  await graph.appendRun({
    runner: config.defaultRunner,
    summary: `Parsed testcase ${spec.id}`,
    artifacts: {},
    testcases: [spec.id]
  });

  process.stdout.write(`Parsed testcase: ${spec.id} (${spec.title})\n`);
  process.stdout.write(`Next: implement runners + synthesizer; this scaffold currently parses + logs.\n`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
