import type {
  LLMGenerateRequest,
  LLMProvider,
  LLMStructuredRequest,
} from "../provider.ts";

function disabledError() {
  return new Error(
    [
      "LLM is disabled (llm.provider=none).",
      "",
      "This command requires an LLM to run.",
      "Set llm.provider and llm.model in agent.config.json,",
      "or export the provider env vars, then rerun.",
    ].join("\n"),
  );
}

export function createDisabledProvider(): LLMProvider {
  return {
    name: "none",
    async generate(_req: LLMGenerateRequest): Promise<string> {
      throw disabledError();
    },
    async structured<T>(_req: LLMStructuredRequest<T>): Promise<T> {
      throw disabledError();
    },
  };
}
