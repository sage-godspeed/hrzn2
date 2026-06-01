import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type RunnerKind = "playwright" | "cypress";
export type LLMProviderId =
  | "llama"
  | "gemini"
  | "claude"
  | "gpt"
  | "kimi"
  | "qwen"
  | "deepseek"
  | "none";

const allowedProviders: LLMProviderId[] = [
  "llama",
  "gemini",
  "claude",
  "gpt",
  "kimi",
  "qwen",
  "deepseek",
  "none",
];

function normalizeProviderId(raw: string): LLMProviderId {
  const v = raw.toLowerCase().trim();
  const normalized = v === "illama" ? "llama" : v;
  if (!allowedProviders.includes(normalized as LLMProviderId)) {
    throw new Error(
      `llm.provider must be one of: ${allowedProviders.join(", ")}`,
    );
  }
  return normalized as LLMProviderId;
}

function detectProviderFromEnvironment(): {
  provider: LLMProviderId;
  reason: string;
} {
  const explicit =
    process.env.HRZN_LLM_PROVIDER ||
    process.env.HRZN2_LLM_PROVIDER ||
    process.env.LLM_PROVIDER ||
    process.env.AI_PROVIDER;
  if (explicit)
    return {
      provider: normalizeProviderId(explicit),
      reason:
        "env:HRZN_LLM_PROVIDER|HRZN2_LLM_PROVIDER|LLM_PROVIDER|AI_PROVIDER",
    };

  if (process.env.OPENAI_API_KEY)
    return { provider: "gpt", reason: "env:OPENAI_API_KEY" };
  if (process.env.ANTHROPIC_API_KEY)
    return { provider: "claude", reason: "env:ANTHROPIC_API_KEY" };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    return { provider: "gemini", reason: "env:GEMINI_API_KEY|GOOGLE_API_KEY" };
  if (process.env.DEEPSEEK_API_KEY)
    return { provider: "deepseek", reason: "env:DEEPSEEK_API_KEY" };
  if (process.env.QWEN_API_KEY)
    return { provider: "qwen", reason: "env:QWEN_API_KEY" };
  if (process.env.KIMI_API_KEY)
    return { provider: "kimi", reason: "env:KIMI_API_KEY" };

  if (
    process.env.OLLAMA_HOST ||
    process.env.OLLAMA_MODEL ||
    process.env.LLAMA_BASE_URL
  ) {
    return {
      provider: "llama",
      reason: "env:OLLAMA_HOST|OLLAMA_MODEL|LLAMA_BASE_URL",
    };
  }

  return { provider: "none", reason: "default" };
}

function stripJsonComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function providerFromModelId(modelId: string): LLMProviderId | null {
  const m = modelId.toLowerCase();
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) return "gpt";
  if (m.includes("claude")) return "claude";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("llama") || m.includes("ollama")) return "llama";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("qwen")) return "qwen";
  if (m.includes("kimi")) return "kimi";
  return null;
}

function modelFromEnv(provider: LLMProviderId): string {
  switch (provider) {
    case "gpt":
      return process.env.OPENAI_MODEL || "";
    case "claude":
      return process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "";
    case "gemini":
      return (
        process.env.GEMINI_MODEL ||
        process.env.GOOGLE_MODEL ||
        "gemini-2.5-flash"
      );
    case "deepseek":
      return process.env.DEEPSEEK_MODEL || "";
    case "qwen":
      return process.env.QWEN_MODEL || "";
    case "kimi":
      return process.env.KIMI_MODEL || "";
    case "llama":
      return process.env.OLLAMA_MODEL || process.env.LLAMA_MODEL || "";
    case "none":
      return "";
  }
}

async function readJsonIfExists(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveVSCodeUserSettingsPath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (!home) return null;
  if (process.platform === "darwin") {
    return resolve(
      home,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json",
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || resolve(home, "AppData", "Roaming");
    return resolve(appData, "Code", "User", "settings.json");
  }
  return resolve(home, ".config", "Code", "User", "settings.json");
}

async function detectProviderFromVSCodeSettings(projectRoot: string): Promise<{
  provider?: string;
  model?: string;
  baseUrl?: string;
  reason?: string;
  path?: string;
}> {
  const workspaceSettingsPath = resolve(
    projectRoot,
    ".vscode",
    "settings.json",
  );
  const userSettingsPath = resolveVSCodeUserSettingsPath();

  const settingsSources = [
    { path: workspaceSettingsPath, reason: "vscode:workspace" },
    { path: userSettingsPath, reason: "vscode:user" },
  ].filter((x) => !!x.path) as Array<{ path: string; reason: string }>;

  for (const source of settingsSources) {
    const settings = await readJsonIfExists(source.path);
    if (!settings) continue;

    const hrznProvider = settings["hrzn.llm.provider"] as string | undefined;
    const hrznModel = settings["hrzn.llm.model"] as string | undefined;
    const hrznBaseUrl = settings["hrzn.llm.baseUrl"] as string | undefined;

    const copilotChatModel = settings["github.copilot.chat.model"] as
      | string
      | undefined;
    const copilotAdvanced = settings["github.copilot.advanced"] as
      | Record<string, unknown>
      | undefined;
    const copilotAdvancedModel =
      (copilotAdvanced?.model as string | undefined) ?? undefined;

    const model = hrznModel || copilotChatModel || copilotAdvancedModel || "";
    const provider =
      hrznProvider || (model ? providerFromModelId(model) : null) || undefined;

    if (provider || model || hrznBaseUrl) {
      return {
        provider: provider ?? undefined,
        model: model || undefined,
        baseUrl: hrznBaseUrl || undefined,
        reason: source.reason,
        path: source.path,
      };
    }
  }

  return {};
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
    detection?: {
      config?: { provider?: string; model?: string; baseUrl?: string };
      vscode?: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        reason?: string;
        path?: string;
      };
      env?: { provider: LLMProviderId; reason: string };
      selected?: {
        provider: LLMProviderId;
        model?: string;
        baseUrl?: string;
        reason?: string;
      };
    };
  };
  paths: {
    testcasesDir: string;
    e2eDir: string;
    artifactsDir: string;
    graphChangelogPath: string;
  };
}

export async function loadAgentConfig(input: {
  projectRoot: string;
  configPath: string;
}): Promise<AgentConfig> {
  const p = resolve(input.configPath);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
    const defaultConfig = {
      agentName: "hrzn",
      defaultRunner: "playwright",
      llm: {},
      paths: {
        testcasesDir: "testcases",
        e2eDir: "e2e",
        artifactsDir: "e2e/artifacts",
        graphChangelogPath: "e2e/changelog/e2e-graph.json",
      },
    };
    await mkdir(dirname(p), { recursive: true });
    const written = `${JSON.stringify(defaultConfig, null, 2)}\n`;
    await writeFile(p, written, "utf8");
    raw = written;
  }
  const parsed = JSON.parse(raw) as Partial<AgentConfig>;
  const defaultRunner = (parsed.defaultRunner ?? "playwright") as RunnerKind;
  if (defaultRunner !== "playwright" && defaultRunner !== "cypress") {
    throw new Error(
      "agent.config.json defaultRunner must be playwright|cypress",
    );
  }
  if (!parsed.paths?.graphChangelogPath)
    throw new Error("agent.config.json missing paths.graphChangelogPath");
  if (!parsed.paths?.testcasesDir)
    throw new Error("agent.config.json missing paths.testcasesDir");
  if (!parsed.paths?.e2eDir)
    throw new Error("agent.config.json missing paths.e2eDir");
  if (!parsed.paths?.artifactsDir)
    throw new Error("agent.config.json missing paths.artifactsDir");

  const projectRoot = resolve(input.projectRoot);

  const vscode = await detectProviderFromVSCodeSettings(projectRoot);

  const llmBlock = (parsed as any).llm ?? {};
  const detected = detectProviderFromEnvironment();

  const configProviderRaw =
    typeof llmBlock.provider === "string" ? llmBlock.provider.trim() : "";
  const configProvider =
    configProviderRaw && configProviderRaw !== "auto"
      ? normalizeProviderId(configProviderRaw)
      : undefined;
  const configModelRaw =
    typeof llmBlock.model === "string" ? llmBlock.model.trim() : "";
  const configModel = configModelRaw || undefined;
  const configBaseUrlRaw =
    typeof llmBlock.baseUrl === "string" ? llmBlock.baseUrl.trim() : "";
  const configBaseUrl = configBaseUrlRaw || undefined;

  const provider = configProvider
    ? configProvider
    : vscode.provider
      ? normalizeProviderId(String(vscode.provider))
      : detected.provider;

  const baseUrlFromEnv =
    provider === "llama"
      ? process.env.LLAMA_BASE_URL || process.env.OLLAMA_HOST || ""
      : "";

  const selectedModel = configModel ?? vscode.model ?? modelFromEnv(provider);
  const selectedBaseUrl = configBaseUrl ?? vscode.baseUrl ?? baseUrlFromEnv;
  const detectedFrom = configProvider
    ? "config"
    : (vscode.reason ?? detected.reason);
  const configProviderHint =
    configProviderRaw && configProviderRaw !== "auto"
      ? configProviderRaw
      : undefined;

  return {
    agentName: "hrzn",
    defaultRunner,
    projectRoot,
    configPath: p,
    llm: {
      provider,
      model: selectedModel ?? "",
      apiKeyEnv: llmBlock.apiKeyEnv ?? "",
      baseUrl: selectedBaseUrl ?? "",
      detectedFrom,
      detection: {
        config: {
          provider: configProviderHint,
          model: configModel,
          baseUrl: configBaseUrl,
        },
        vscode: {
          provider: vscode.provider,
          model: vscode.model,
          baseUrl: vscode.baseUrl,
          reason: vscode.reason,
          path: vscode.path,
        },
        env: { provider: detected.provider, reason: detected.reason },
        selected: {
          provider,
          model: selectedModel ?? "",
          baseUrl: selectedBaseUrl ?? "",
          reason: detectedFrom,
        },
      },
    },
    paths: {
      testcasesDir: resolve(projectRoot, parsed.paths.testcasesDir),
      e2eDir: resolve(projectRoot, parsed.paths.e2eDir),
      artifactsDir: resolve(projectRoot, parsed.paths.artifactsDir),
      graphChangelogPath: resolve(projectRoot, parsed.paths.graphChangelogPath),
    },
  };
}
