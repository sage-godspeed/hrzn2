import type {
  LLMGenerateRequest,
  LLMProvider,
  LLMStructuredRequest,
} from "../provider.ts";
import type { LLMProviderId } from "../../config.ts";

function envOrEmpty(name: string) {
  return name && process.env[name] ? String(process.env[name]) : "";
}

function defaultApiKeyEnv(provider: LLMProviderId): string {
  switch (provider) {
    case "gpt":
      return "OPENAI_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "qwen":
      return "QWEN_API_KEY";
    case "kimi":
      return "KIMI_API_KEY";
    case "llama":
      return "LLAMA_API_KEY";
    case "claude":
      return "ANTHROPIC_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "none":
      return "";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, "");
  return b.endsWith("/v1") ? b : `${b}/v1`;
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
    const msg = json?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(`LLM request failed (${res.status}): ${msg}`);
  }
  return json;
}

function extractChatContent(resp: any): string {
  const content = resp?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // Some servers return content parts:
  const parts = resp?.choices?.[0]?.message?.content;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
  }
  return "";
}

function asJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  // Try direct JSON parse first
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Attempt to extract the first JSON object/array substring.
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

export function createOpenAICompatProvider(input: {
  provider: LLMProviderId;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}): LLMProvider {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKeyEnv = input.apiKeyEnv || defaultApiKeyEnv(input.provider);
  const apiKey = envOrEmpty(apiKeyEnv);

  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const model = input.model || "";

  async function chat(
    system: string | undefined,
    user: string,
    temperature?: number,
  ): Promise<string> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });
    const payload = {
      model: model || undefined,
      messages,
      temperature: temperature ?? 0.2,
    };
    const resp = await postJson(
      `${baseUrl}/chat/completions`,
      headers,
      payload,
    );
    const out = extractChatContent(resp);
    if (!out) throw new Error("LLM returned empty content.");
    return out;
  }

  return {
    name: `${input.provider}${model ? `:${model}` : ""}`,
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
