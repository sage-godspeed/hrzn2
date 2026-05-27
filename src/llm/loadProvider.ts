import type { AgentConfig } from "../config.ts";
import type { LLMProvider } from "./provider.ts";
import { createOpenAICompatProvider } from "./providers/openaiCompat.ts";
import { createPlaceholderProvider } from "./providers/placeholder.ts";

export function loadProvider(config: AgentConfig): LLMProvider {
  const baseUrl = (config.llm.baseUrl ?? "").trim();
  const model = (config.llm.model ?? "").trim();

  // Default behavior:
  // - If baseUrl is provided, assume OpenAI-compatible endpoint.
  // - If provider is gpt and baseUrl is not provided, use OpenAI's default base URL.
  if (baseUrl || config.llm.provider === "gpt") {
    return createOpenAICompatProvider({
      provider: config.llm.provider,
      baseUrl: baseUrl || "https://api.openai.com/v1",
      model,
      apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim()
    });
  }

  return createPlaceholderProvider({
    provider: config.llm.provider,
    model,
    apiKeyEnv: (config.llm.apiKeyEnv ?? "").trim()
  });
}
