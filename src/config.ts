import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RunnerKind = "playwright" | "cypress";

export interface AgentConfig {
  agentName: string;
  defaultRunner: RunnerKind;
  projectRoot: string;
  configPath: string;
  paths: {
    testcasesDir: string;
    e2eDir: string;
    artifactsDir: string;
    graphChangelogPath: string;
  };
}

export async function loadAgentConfig(input: { projectRoot: string; configPath: string }): Promise<AgentConfig> {
  const p = resolve(input.configPath);
  const raw = await readFile(p, "utf8");
  const parsed = JSON.parse(raw) as Partial<AgentConfig>;
  if (!parsed.agentName) throw new Error("agent.config.json missing agentName");
  const defaultRunner = (parsed.defaultRunner ?? "playwright") as RunnerKind;
  if (defaultRunner !== "playwright" && defaultRunner !== "cypress") {
    throw new Error("agent.config.json defaultRunner must be playwright|cypress");
  }
  if (!parsed.paths?.graphChangelogPath) throw new Error("agent.config.json missing paths.graphChangelogPath");
  if (!parsed.paths?.testcasesDir) throw new Error("agent.config.json missing paths.testcasesDir");
  if (!parsed.paths?.e2eDir) throw new Error("agent.config.json missing paths.e2eDir");
  if (!parsed.paths?.artifactsDir) throw new Error("agent.config.json missing paths.artifactsDir");

  const projectRoot = resolve(input.projectRoot);
  return {
    agentName: parsed.agentName,
    defaultRunner,
    projectRoot,
    configPath: p,
    paths: {
      testcasesDir: resolve(projectRoot, parsed.paths.testcasesDir),
      e2eDir: resolve(projectRoot, parsed.paths.e2eDir),
      artifactsDir: resolve(projectRoot, parsed.paths.artifactsDir),
      graphChangelogPath: resolve(projectRoot, parsed.paths.graphChangelogPath)
    }
  };
}
