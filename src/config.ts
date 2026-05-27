import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RunnerKind = "playwright" | "cypress";
export type LLMProviderId = "llama" | "gemini" | "claude" | "gpt" | "kimi" | "qwen" | "deepseek";

const allowedProviders: LLMProviderId[] = ["llama", "gemini", "claude", "gpt", "kimi", "qwen", "deepseek"];

function normalizeProviderId(raw: string): LLMProviderId {
  const v = raw.toLowerCase().trim();
  const normalized = v === "illama" ? "llama" : v;
  if (!allowedProviders.includes(normalized as LLMProviderId)) {
    throw new Error(`llm.provider must be one of: ${allowedProviders.join(", ")}`);
  }
  return normalized as LLMProviderId;
}

function detectProviderFromEnvironment(): { provider: LLMProviderId; reason: string } {
  const explicit = process.env.HRZN2_LLM_PROVIDER || process.env.LLM_PROVIDER || process.env.AI_PROVIDER;
  if (explicit) return { provider: normalizeProviderId(explicit), reason: "env:HRZN2_LLM_PROVIDER|LLM_PROVIDER|AI_PROVIDER" };

  if (process.env.OPENAI_API_KEY) return { provider: "gpt", reason: "env:OPENAI_API_KEY" };
  if (process.env.ANTHROPIC_API_KEY) return { provider: "claude", reason: "env:ANTHROPIC_API_KEY" };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return { provider: "gemini", reason: "env:GEMINI_API_KEY|GOOGLE_API_KEY" };
  if (process.env.DEEPSEEK_API_KEY) return { provider: "deepseek", reason: "env:DEEPSEEK_API_KEY" };
  if (process.env.QWEN_API_KEY) return { provider: "qwen", reason: "env:QWEN_API_KEY" };
  if (process.env.KIMI_API_KEY) return { provider: "kimi", reason: "env:KIMI_API_KEY" };

  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL || process.env.LLAMA_BASE_URL) {
    return { provider: "llama", reason: "env:OLLAMA_HOST|OLLAMA_MODEL|LLAMA_BASE_URL" };
  }

  return { provider: "gpt", reason: "default" };
}

export interface AgentConfig {
  agentName: string;
  defaultRunner: RunnerKind;
  projectRoot: string;
  configPath: string;
  llm: {
    provider: LLMProviderId;
    model?: string;
    apiKeyEnv?: string;
    baseUrl?: string;
    detectedFrom?: string;
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

  const llmBlock = (parsed as any).llm ?? {};
  const detected = detectProviderFromEnvironment();
  const provider = llmBlock.provider ? normalizeProviderId(String(llmBlock.provider)) : detected.provider;

  return {
    agentName: parsed.agentName,
    defaultRunner,
    projectRoot,
    configPath: p,
    llm: {
      provider,
      model: llmBlock.model ?? "",
      apiKeyEnv: llmBlock.apiKeyEnv ?? "",
      baseUrl: llmBlock.baseUrl ?? "",
      detectedFrom: llmBlock.provider ? "config" : detected.reason
    },
    paths: {
      testcasesDir: resolve(projectRoot, parsed.paths.testcasesDir),
      e2eDir: resolve(projectRoot, parsed.paths.e2eDir),
      artifactsDir: resolve(projectRoot, parsed.paths.artifactsDir),
      graphChangelogPath: resolve(projectRoot, parsed.paths.graphChangelogPath)
    }
  };
}
