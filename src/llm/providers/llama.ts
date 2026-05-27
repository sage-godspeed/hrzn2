import type {
  LLMGenerateRequest,
  LLMProvider,
  LLMStructuredRequest,
} from "../provider.ts";

function envOrEmpty(name: string) {
  return name && process.env[name] ? String(process.env[name]) : "";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error || text || `HTTP ${res.status}`;
    throw new Error(`LLM request failed (${res.status}): ${msg}`);
  }
  return json;
}

function asJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = Math.min(
      ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((x) => x >= 0),
    );
    if (!Number.isFinite(start)) throw new Error("Model did not return JSON.");
    const sub = trimmed.slice(start);
    const endObj = sub.lastIndexOf("}");
    const endArr = sub.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end < 0) throw new Error("Model did not return valid JSON.");
    return JSON.parse(sub.slice(0, end + 1)) as T;
  }
}

export function createLlamaProvider(input: {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}): LLMProvider {
  const baseUrl = normalizeBaseUrl(input.baseUrl || "http://localhost:11434");
  const apiKeyEnv = input.apiKeyEnv || "LLAMA_API_KEY";
  const apiKey = envOrEmpty(apiKeyEnv);

  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const model = input.model || "";
  if (!model) {
    throw new Error(
      "Ollama model is required. Set llm.model or OLLAMA_MODEL/LLAMA_MODEL.",
    );
  }

  async function chat(
    system: string | undefined,
    user: string,
    temperature?: number,
  ): Promise<string> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });

    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (typeof temperature === "number") {
      payload.options = { temperature };
    }

    const resp = await postJson(`${baseUrl}/api/chat`, headers, payload);
    const out = resp?.message?.content;
    if (typeof out !== "string" || !out) {
      throw new Error("LLM returned empty content.");
    }
    return out;
  }

  return {
    name: `llama${model ? `:${model}` : ""}`,
    async generate(req: LLMGenerateRequest): Promise<string> {
      return chat(req.system, req.input, req.temperature);
    },
    async structured<T>(req: LLMStructuredRequest<T>): Promise<T> {
      const system = [
        req.system ?? "",
        "Return ONLY valid JSON. No markdown. No backticks. No commentary.",
      ]
        .filter(Boolean)
        .join("\n");
      const text = await chat(system, req.input, req.temperature);
      const parsed = asJsonFromText<T>(text);
      if (req.validate && !req.validate(parsed))
        throw new Error("Structured output failed validation.");
      return parsed;
    },
  };
}
