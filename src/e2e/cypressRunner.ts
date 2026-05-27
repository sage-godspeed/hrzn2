import {
  mkdir,
  readdir,
  stat,
  copyFile,
  access,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Evidence, E2ERunner, RunRequest } from "./e2eRunner.ts";

function nowIsoCompact() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries: string[] = [];
    try {
      entries = await readdir(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(d, name);
      let s;
      try {
        s = await stat(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) await walk(p);
      else out.push(p);
    }
  }
  await walk(dir);
  return out;
}

async function copyArtifacts(
  fromDir: string,
  toDir: string,
): Promise<string[]> {
  const files = await listFilesRecursive(fromDir);
  const copied: string[] = [];
  for (const f of files) {
    const rel = f.replace(fromDir.replace(/\/+$/, "") + "/", "");
    const dest = resolve(toDir, rel);
    await mkdir(resolve(dest, ".."), { recursive: true });
    await copyFile(f, dest);
    copied.push(dest);
  }
  return copied;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolvePromise) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += String(d)));
      child.stderr?.on("data", (d) => (stderr += String(d)));
      child.on("error", (err) => {
        stderr += `\n${String((err as any)?.message ?? err)}`;
        resolvePromise({ code: 127, stdout, stderr });
      });
      child.on("close", (code) =>
        resolvePromise({ code: code ?? 1, stdout, stderr }),
      );
    },
  );
}

function parseCypressFailures(jsonText: string): Evidence["failingTests"] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const failures: Evidence["failingTests"] = [];
  const tests = data?.tests ?? data?.runs?.[0]?.tests ?? [];
  for (const t of tests) {
    if (t?.state === "failed") {
      failures.push({
        testId: t?.testId ?? t?.title?.join(" ") ?? "unknown",
        title: Array.isArray(t?.title)
          ? t.title.join(" ")
          : (t?.title ?? "cypress test failed"),
        errorMessage: t?.err?.message || t?.err?.stack || "",
      });
    }
  }
  return failures;
}

async function resolveCypressSpec(
  projectRoot: string,
  testId: string,
): Promise<string | null> {
  // Convention: cypress spec filename contains the testId.
  const candidates = [
    resolve(projectRoot, "cypress", "e2e", `${testId}.cy.ts`),
    resolve(projectRoot, "cypress", "e2e", `${testId}.cy.js`),
    resolve(projectRoot, "cypress", "integration", `${testId}.spec.ts`),
    resolve(projectRoot, "cypress", "integration", `${testId}.spec.js`),
  ];
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

export function createCypressRunner(input: {
  projectRoot: string;
  artifactsDir: string;
}): E2ERunner {
  return {
    kind: "cypress",
    async detect() {
      const local = resolve(
        input.projectRoot,
        "node_modules",
        ".bin",
        "cypress",
      );
      return {
        kind: "cypress",
        version: (await exists(local)) ? local : undefined,
      };
    },
    async prepare(_req: RunRequest) {
      await mkdir(input.artifactsDir, { recursive: true });
    },
    async run(req: RunRequest): Promise<Evidence> {
      const startedAt = new Date().toISOString();
      const runId = `cy-${nowIsoCompact()}`;
      const runOutDir = resolve(input.artifactsDir, runId);
      await mkdir(runOutDir, { recursive: true });

      const localBin = resolve(
        input.projectRoot,
        "node_modules",
        ".bin",
        "cypress",
      );
      if (!(await exists(localBin))) {
        throw new Error(
          [
            "Cypress binary not found in target project.",
            `Expected: ${localBin}`,
            "Install Cypress in the target project:",
            "  npm i -D cypress",
          ].join("\n"),
        );
      }

      const args: string[] = ["run", "--reporter", "json"];
      if (req.headed) args.push("--headed");
      if (req.testId) {
        const spec = await resolveCypressSpec(input.projectRoot, req.testId);
        if (spec) args.push("--spec", spec);
      }

      const result = await runProcess(localBin, args, {
        cwd: input.projectRoot,
      });
      const finishedAt = new Date().toISOString();

      const logPath = resolve(runOutDir, "runner.log");
      await writeFile(
        logPath,
        [
          `cmd: ${localBin} ${args.join(" ")}`,
          `exit: ${result.code}`,
          "--- stdout ---",
          result.stdout,
          "--- stderr ---",
          result.stderr,
        ].join("\n"),
        "utf8",
      );

      const copied: string[] = [];
      for (const dirName of [
        "cypress/videos",
        "cypress/screenshots",
        "cypress/results",
      ]) {
        copied.push(
          ...(await copyArtifacts(
            resolve(input.projectRoot, dirName),
            resolve(runOutDir, dirName),
          )),
        );
      }

      const artifacts: Evidence["artifacts"] = {
        screenshots: copied.filter((p) => p.toLowerCase().endsWith(".png")),
        videos: copied.filter((p) => p.toLowerCase().endsWith(".mp4")),
        traces: [],
        logs: [logPath],
      };

      const parsedFailures = parseCypressFailures(result.stdout);
      const failingTests =
        result.code === 0
          ? []
          : parsedFailures.length
            ? parsedFailures
            : [
                {
                  testId: req.testId ?? "unknown",
                  title: req.testId ?? "cypress test run failed",
                  errorMessage: (result.stderr || result.stdout).slice(-4000),
                },
              ];

      return {
        startedAt,
        finishedAt,
        runner: "cypress",
        runId,
        artifacts,
        failingTests,
      };
    },
    async cleanup(_req: RunRequest) {
      // no-op
    },
  };
}
