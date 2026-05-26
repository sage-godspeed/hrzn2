import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RunnerKind = "playwright" | "cypress";
export type LLMProviderId = "llama" | "gemini" | "claude" | "gpt" | "kimi" | "qwen" | "deepseek";

export interface AgentConfig {
  agentName: string;
  defaultRunner: RunnerKind;
  projectRoot: string;
  configPath: string;
  llm: {
    provider: LLMProviderId;
    model?: string;
    apiKeyEnv?: string;
  };
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
  const providerRaw = String((parsed as any).llm?.provider ?? "gpt").toLowerCase();
  const providerNormalized = providerRaw === "illama" ? "llama" : providerRaw;
  const allowedProviders: LLMProviderId[] = ["llama", "gemini", "claude", "gpt", "kimi", "qwen", "deepseek"];
  if (!allowedProviders.includes(providerNormalized as LLMProviderId)) {
    throw new Error(`agent.config.json llm.provider must be one of: ${allowedProviders.join(", ")}`);
  }

  return {
    agentName: parsed.agentName,
    defaultRunner,
    projectRoot,
    configPath: p,
    llm: {
      provider: providerNormalized as LLMProviderId,
      model: (parsed as any).llm?.model ?? "",
      apiKeyEnv: (parsed as any).llm?.apiKeyEnv ?? ""
    },
    paths: {
      testcasesDir: resolve(projectRoot, parsed.paths.testcasesDir),
      e2eDir: resolve(projectRoot, parsed.paths.e2eDir),
      artifactsDir: resolve(projectRoot, parsed.paths.artifactsDir),
      graphChangelogPath: resolve(projectRoot, parsed.paths.graphChangelogPath)
    }
  };
}
