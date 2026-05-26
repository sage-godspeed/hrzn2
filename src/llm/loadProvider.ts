import type { AgentConfig } from "../config.ts";
import type { LLMProvider } from "./provider.ts";
import { createPlaceholderProvider } from "./providers/placeholder.ts";

export function loadProvider(config: AgentConfig): LLMProvider {
  return createPlaceholderProvider({
    provider: config.llm.provider,
    model: config.llm.model ?? "",
    apiKeyEnv: config.llm.apiKeyEnv ?? ""
  });
}

