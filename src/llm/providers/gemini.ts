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
    const msg = json?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(`LLM request failed (${res.status}): ${msg}`);
  }
  return json;
}

function extractContent(resp: any): string {
  const parts = resp?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
  }
  return "";
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

export function createGeminiProvider(input: {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}): LLMProvider {
  const baseUrl = normalizeBaseUrl(
    input.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
  );
  const apiKeyEnv = input.apiKeyEnv || "GEMINI_API_KEY";
  const apiKey = envOrEmpty(apiKeyEnv) || envOrEmpty("GOOGLE_API_KEY");

  const model =
    input.model || process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || "";
  if (!model) {
    throw new Error(
      "Gemini model is required. Set llm.model or GEMINI_MODEL/GOOGLE_MODEL.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "Gemini API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY.",
    );
  }

  async function chat(
    system: string | undefined,
    user: string,
    temperature?: number,
  ): Promise<string> {
    const payload = {
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: temperature ?? 0.2 },
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    };

    const resp = await postJson(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {},
      payload,
    );
    const out = extractContent(resp);
    if (!out) throw new Error("LLM returned empty content.");
    return out;
  }

  return {
    name: `gemini${model ? `:${model}` : ""}`,
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
