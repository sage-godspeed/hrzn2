import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentConfig } from "../src/config.ts";

const ENV_KEYS = [
  "HRZN_LLM_PROVIDER",
  "HRZN2_LLM_PROVIDER",
  "LLM_PROVIDER",
  "AI_PROVIDER",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "DEEPSEEK_API_KEY",
  "QWEN_API_KEY",
  "KIMI_API_KEY",
  "LLAMA_API_KEY",
  "OLLAMA_HOST",
  "OLLAMA_MODEL",
  "LLAMA_BASE_URL",
  "OPENAI_MODEL",
  "CLAUDE_MODEL",
  "ANTHROPIC_MODEL",
  "GEMINI_MODEL",
  "GOOGLE_MODEL",
  "DEEPSEEK_MODEL",
  "QWEN_MODEL",
  "KIMI_MODEL",
  "LLAMA_MODEL",
  "HOME",
  "USERPROFILE",
  "APPDATA",
];

function restoreEnv(original: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("loadAgentConfig defaults to none when no hints exist", async () => {
  const originalEnv = { ...process.env };
  for (const key of ENV_KEYS) delete process.env[key];

  const dir = await mkdtemp(join(tmpdir(), "hrzn-config-"));
  try {
    process.env.HOME = dir;
    const config = await loadAgentConfig({
      projectRoot: dir,
      configPath: join(dir, "agent.config.json"),
    });
    assert.equal(config.llm.provider, "none");
    assert.equal(config.llm.detectedFrom, "default");
  } finally {
    await rm(dir, { recursive: true, force: true });
    restoreEnv(originalEnv);
  }
});

test("workspace VS Code settings override env detection", async () => {
  const originalEnv = { ...process.env };
  for (const key of ENV_KEYS) delete process.env[key];

  const dir = await mkdtemp(join(tmpdir(), "hrzn-config-"));
  try {
    process.env.HOME = dir;
    process.env.OPENAI_API_KEY = "x";

    const vscodeDir = join(dir, ".vscode");
    await mkdir(vscodeDir, { recursive: true });
    const settingsPath = join(vscodeDir, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify({
        "hrzn.llm.provider": "gemini",
        "hrzn.llm.model": "gemini-2.5-flash",
      }),
      "utf8",
    );

    const config = await loadAgentConfig({
      projectRoot: dir,
      configPath: join(dir, "agent.config.json"),
    });

    assert.equal(config.llm.provider, "gemini");
    assert.equal(config.llm.model, "gemini-2.5-flash");
    assert.equal(config.llm.detectedFrom, "vscode:workspace");
    assert.equal(config.llm.detection?.vscode?.path, settingsPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
    restoreEnv(originalEnv);
  }
});
