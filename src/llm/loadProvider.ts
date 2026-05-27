import type { AgentConfig } from "../config.ts";
import type { LLMProvider } from "./provider.ts";
import { createOpenAICompatProvider } from "./providers/openaiCompat.ts";
import { createPlaceholderProvider } from "./providers/placeholder.ts";
import { createClaudeProvider } from "./providers/claude.ts";
import { createGeminiProvider } from "./providers/gemini.ts";
import { createDisabledProvider } from "./providers/disabled.ts";
import { createDeepSeekProvider } from "./providers/deepseek.ts";
import { createLlamaProvider } from "./providers/llama.ts";

export function loadProvider(config: AgentConfig): LLMProvider {
  const baseUrl = (config.llm.baseUrl ?? "").trim();
  const model = (config.llm.model ?? "").trim();

  if (config.llm.provider === "none") {
    return createDisabledProvider();
  }

  const envBaseUrl =
    process.env.HRZN_LLM_BASE_URL ||
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_COMPAT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "";

  const providerBaseUrl = (() => {
    switch (config.llm.provider) {
      case "claude":
        return (
          process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL || ""
        );
      case "deepseek":
        return process.env.DEEPSEEK_BASE_URL || "";
      case "qwen":
        return process.env.QWEN_BASE_URL || "";
      case "kimi":
        return process.env.KIMI_BASE_URL || "";
      case "gemini":
        return process.env.GEMINI_BASE_URL || "";
      case "llama":
        return process.env.LLAMA_BASE_URL || process.env.OLLAMA_HOST || "";
      case "gpt":
        return process.env.OPENAI_BASE_URL || "";
      default:
        return "";
    }
  })();

  // Default behavior:
  // - If baseUrl is provided, assume OpenAI-compatible endpoint.
  // - If provider is gpt and baseUrl is not provided, use OpenAI's default base URL.
  const resolvedBaseUrl = baseUrl || envBaseUrl || providerBaseUrl;
  const nativeBaseUrl = baseUrl || providerBaseUrl;

  if (config.llm.provider === "claude") {
    return createClaudeProvider({
      baseUrl: nativeBaseUrl || "https://api.anthropic.com/v1",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
    });
  }

  if (config.llm.provider === "gemini") {
    return createGeminiProvider({
      baseUrl:
        nativeBaseUrl || "https://generativelanguage.googleapis.com/v1beta",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
    });
  }

  if (config.llm.provider === "deepseek") {
    return createDeepSeekProvider({
      baseUrl: nativeBaseUrl || "https://api.deepseek.com/v1",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
    });
  }

  if (config.llm.provider === "llama") {
    return createLlamaProvider({
      baseUrl: nativeBaseUrl || "http://localhost:11434",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
    });
  }

  if (resolvedBaseUrl || config.llm.provider === "gpt") {
    return createOpenAICompatProvider({
      provider: config.llm.provider,
      baseUrl: resolvedBaseUrl || "https://api.openai.com/v1",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
    });
  }

  return createPlaceholderProvider({
    provider: config.llm.provider,
    model,
    apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim(),
  });
}
