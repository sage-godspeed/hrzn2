import type {
  LLMProvider,
  LLMGenerateRequest,
  LLMStructuredRequest,
} from "../provider.ts";
import type { LLMProviderId } from "../../config.ts";

const PROVIDER_ENV_DEFAULTS: Record<LLMProviderId, string> = {
  gpt: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "QWEN_API_KEY",
  kimi: "KIMI_API_KEY",
  llama: "LLAMA_API_KEY",
  none: "",
};

export function createPlaceholderProvider(input: {
  provider: LLMProviderId;
  model: string;
  apiKeyEnv: string;
}): LLMProvider {
  const apiKeyEnv = input.apiKeyEnv || PROVIDER_ENV_DEFAULTS[input.provider];
  const suffix = [
    `Provider: ${input.provider}`,
    input.model ? `Model: ${input.model}` : "Model: (not set)",
    apiKeyEnv ? `API key env: ${apiKeyEnv}` : "API key env: (not set)",
  ].join("\n");

  const err = () =>
    new Error(
      [
        "LLM provider adapter not implemented yet.",
        "",
        "Set these in agent.config.json:",
        `  llm.provider: ${Object.keys(PROVIDER_ENV_DEFAULTS).join(" | ")}`,
        "  llm.model: <provider model id>",
        "  llm.apiKeyEnv: <optional override env var name>",
        "",
        "Then export the API key in your shell/CI.",
        "",
        suffix,
      ].join("\n"),
    );

  return {
    name: input.provider,
    async generate(_req: LLMGenerateRequest): Promise<string> {
      throw err();
    },
    async structured<T>(_req: LLMStructuredRequest<T>): Promise<T> {
      throw err();
    },
  };
}
