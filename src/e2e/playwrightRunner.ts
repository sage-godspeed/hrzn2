import { mkdir, readdir, stat, copyFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Evidence, E2ERunner, RunRequest } from "./e2eRunner.ts";

function nowIsoCompact() {
  return new Date().toISOString().replace(/[:.]/g, "-");
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parsePlaywrightFailures(jsonText: string): Evidence["failingTests"] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const failures: Evidence["failingTests"] = [];

  function walkSuite(suite: any) {
    const specs = suite?.specs ?? [];
    for (const spec of specs) {
      const tests = spec?.tests ?? [];
      for (const t of tests) {
        const results = t?.results ?? [];
        for (const r of results) {
          const errors = r?.errors ?? [];
          if (errors.length) {
            failures.push({
              testId: t?.testId ?? "unknown",
              title: t?.title ?? spec?.title ?? "playwright test failed",
              errorMessage: errors
                .map((e: any) => e?.message || e?.value || "")
                .join("\n"),
            });
          }
        }
      }
    }
    for (const child of suite?.suites ?? []) walkSuite(child);
  }

  for (const suite of data?.suites ?? []) walkSuite(suite);
  return failures;
}

export function createPlaywrightRunner(input: {
  projectRoot: string;
  artifactsDir: string;
}): E2ERunner {
  return {
    kind: "playwright",
    async detect() {
      // Prefer local playwright binary if present
      const local = resolve(
        input.projectRoot,
        "node_modules",
        ".bin",
        "playwright",
      );
      return {
        kind: "playwright",
        version: (await exists(local)) ? local : undefined,
      };
    },
    async prepare(_req: RunRequest) {
      await mkdir(input.artifactsDir, { recursive: true });
    },
    async run(req: RunRequest): Promise<Evidence> {
      const startedAt = new Date().toISOString();
      const runId = `pw-${nowIsoCompact()}`;
      const runOutDir = resolve(input.artifactsDir, runId);
      await mkdir(runOutDir, { recursive: true });

      const localBin = resolve(
        input.projectRoot,
        "node_modules",
        ".bin",
        "playwright",
      );
      if (!(await exists(localBin))) {
        throw new Error(
          [
            "Playwright binary not found in target project.",
            `Expected: ${localBin}`,
            "Install Playwright in the target project (recommended):",
            "  npm i -D @playwright/test && npx playwright install",
            "Or point hrzn at a projectRoot that already has Playwright installed.",
          ].join("\n"),
        );
      }
      const cmd = localBin;

      const args: string[] = ["test", "--reporter=json", "--trace=on"];
      if (req.retries != null) args.push(`--retries=${req.retries}`);
      if (req.headed) args.push("--headed");
      if (req.testId) {
        // Convention: tests should include the testcase id in their title or file name.
        args.push("-g", req.testId);
      }

      const result = await runProcess(cmd, args, { cwd: input.projectRoot });
      const finishedAt = new Date().toISOString();

      const logPath = resolve(runOutDir, "runner.log");
      await writeFile(
        logPath,
        [
          `cmd: ${cmd} ${args.join(" ")}`,
          `exit: ${result.code}`,
          "--- stdout ---",
          result.stdout,
          "--- stderr ---",
          result.stderr,
        ].join("\n"),
        "utf8",
      );

      // Collect common playwright artifact dirs if they exist.
      const artifacts: Evidence["artifacts"] = {};
      const screenshotExt = [".png", ".jpg", ".jpeg"];
      const videoExt = [".webm", ".mp4"];

      const copied: string[] = [];
      for (const dirName of ["test-results", "playwright-report"]) {
        const dir = resolve(input.projectRoot, dirName);
        copied.push(...(await copyArtifacts(dir, resolve(runOutDir, dirName))));
      }

      artifacts.screenshots = copied.filter((p) =>
        screenshotExt.some((e) => p.toLowerCase().endsWith(e)),
      );
      artifacts.videos = copied.filter((p) =>
        videoExt.some((e) => p.toLowerCase().endsWith(e)),
      );
      artifacts.traces = copied.filter((p) => p.toLowerCase().endsWith(".zip"));
      artifacts.logs = [logPath];

      // Minimal failing test info (best-effort; we can improve by parsing JSON reporter later).
      const parsedFailures = parsePlaywrightFailures(result.stdout);
      const failingTests =
        result.code === 0
          ? []
          : parsedFailures.length
            ? parsedFailures
            : [
                {
                  testId: req.testId ?? "unknown",
                  title: req.testId ?? "playwright test run failed",
                  errorMessage: (result.stderr || result.stdout).slice(-4000),
                },
              ];

      return {
        startedAt,
        finishedAt,
        runner: "playwright",
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
