import {
  readFile,
  writeFile,
  access,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { basename, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAgentConfig } from "./config.ts";
import { ensureProjectScaffold } from "./scaffold.ts";
import { parseTestcaseMarkdown } from "./spec/parser.ts";
import { GraphChangelog } from "./graph/changelog.ts";
import { loadProvider } from "./llm/loadProvider.ts";
import { resolvePolicy } from "./policy/policyEngine.ts";
import { runE2E } from "./e2e/index.ts";
import { synthesizeTest } from "./synthesizer/index.ts";
import { healLoop } from "./heal/healLoop.ts";
import { writeRunReport } from "./report/runReport.ts";
import { applySpecEditsToMarkdown, type SpecEdit } from "./spec/update.ts";
import { exampleTestcaseMarkdown } from "./spec/example.ts";

type Command =
  | "init"
  | "run"
  | "test"
  | "synth"
  | "heal"
  | "rerun"
  | "template"
  | "install";

function usage(agentName: string) {
  return [
    `${agentName}: provider-agnostic E2E self-healing agent`,
    "",
    "Usage:",
    `  ${agentName} init [--projectRoot <dir>] [--config <path>]`,
    `  ${agentName} run <testcase.md> [--projectRoot <dir>] [--config <path>] [--all] [--suite <name>]`,
    `  ${agentName} rerun`,
    `  ${agentName} install [--runner <playwright|cypress|both>] [--packageManager <npm|pnpm|yarn>] [--with-browsers] [--browsers <list>]`,
    `  ${agentName} template [TEST_ID] [--out <path>] [--overwrite]`,
    `  ${agentName} synth <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>] [--overwrite]`,
    `  ${agentName} test <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>] [--headed] [--retries N]`,
    `  ${agentName} heal <TEST_ID|testcase.md> [--projectRoot <dir>] [--config <path>]`,
    "",
    "Flags:",
    "  --projectRoot <dir>   Run against another repo/project root",
    "  --config <path>       Path to agent.config.json (defaults to <projectRoot>/agent.config.json)",
    "  --overwrite           Overwrite generated test file (synth)",
    "  --headed              Run browser headed (Playwright)",
    "  --retries N            Retries for failing tests (Playwright)",
    "  --ci                  CI mode (non-interactive exit codes)",
    "  --dry-run             Do not write files or run tests",
    "  --report <path>       Write run report JSON",
    "  --patch <path>        Write git diff patch to a file",
    "  --out <path>          Output path for template command",
    "  --auto               Auto-increment template file name",
    "  --suite <name>         Run or heal a suite",
    "  --all                 Run or heal all testcases",
    "  --exclude <id>         Exclude testcase ID (repeatable or comma-separated)",
    "  --exclude-tag <tag>    Exclude tag key or key:value (repeatable or comma-separated)",
    "  --exclude-suite <name> Exclude suite name (repeatable or comma-separated)",
    "  --approve <path>      Apply approved spec update JSON",
    "  --runner <name>       Runner for install (playwright|cypress|both)",
    "  --packageManager <n>  Package manager for install (npm|pnpm|yarn)",
    "  --with-browsers       Install Playwright browsers (install command)",
    "  --browsers <list>     Comma-separated Playwright browsers (chromium,firefox,webkit)",
  ].join("\n");
}

function emitPolicyHint(input: {
  agentsMdPath?: string;
  agentsMdContent?: string;
}) {
  const snippet = [
    "# Healing policy (hrzn)",
    "allow:",
    "  - selector_update",
    "  - timing_waits",
    "  - flow_popups",
    "deny:",
    "  - assertion_update",
    "max_heal_iterations: 3",
    "require_evidence_for_changes: true",
    "allow_production_code_edits: false",
    'spec_updates_require_approval_for: ["assertions", "steps", "preconditions"]',
  ].join("\n");

  if (!input.agentsMdPath) {
    process.stdout.write(
      "No AGENTS.md found. Create one to customize healing policy. Suggested contents:\n" +
        "```\n" +
        snippet +
        "\n```\n",
    );
    return;
  }

  if (!input.agentsMdContent) return;
  process.stdout.write(
    `AGENTS.md detected at ${input.agentsMdPath}. Add or edit this policy block if needed:\n` +
      "```\n" +
      snippet +
      "\n```\n",
  );
}

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  const appendFlag = (key: string, value: string) => {
    if (!value) return;
    flags[key] = flags[key] ? `${flags[key]},${value}` : value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--projectRoot") {
      flags.projectRoot = argv[++i] ?? "";
      continue;
    }
    if (a === "--config") {
      flags.config = argv[++i] ?? "";
      continue;
    }
    if (a === "--headed") {
      flags.headed = "true";
      continue;
    }
    if (a === "--retries") {
      flags.retries = argv[++i] ?? "";
      continue;
    }
    if (a === "--overwrite") {
      flags.overwrite = "true";
      continue;
    }
    if (a === "--ci") {
      flags.ci = "true";
      continue;
    }
    if (a === "--report") {
      flags.report = argv[++i] ?? "";
      continue;
    }
    if (a === "--patch") {
      flags.patch = argv[++i] ?? "";
      continue;
    }
    if (a === "--out") {
      flags.out = argv[++i] ?? "";
      continue;
    }
    if (a === "--auto") {
      flags.auto = "true";
      continue;
    }
    if (a === "--dry-run") {
      flags.dryRun = "true";
      continue;
    }
    if (a === "--suite") {
      flags.suite = argv[++i] ?? "";
      continue;
    }
    if (a === "--all") {
      flags.all = "true";
      continue;
    }
    if (a === "--exclude") {
      appendFlag("exclude", argv[++i] ?? "");
      continue;
    }
    if (a === "--exclude-tag") {
      appendFlag("excludeTag", argv[++i] ?? "");
      continue;
    }
    if (a === "--exclude-suite") {
      appendFlag("excludeSuite", argv[++i] ?? "");
      continue;
    }
    if (a === "--approve") {
      flags.approve = argv[++i] ?? "";
      continue;
    }
    if (a === "--runner") {
      flags.runner = argv[++i] ?? "";
      continue;
    }
    if (a === "--packageManager") {
      flags.packageManager = argv[++i] ?? "";
      continue;
    }
    if (a === "--with-browsers") {
      flags.withBrowsers = "true";
      continue;
    }
    if (a === "--browsers") {
      flags.browsers = argv[++i] ?? "";
      continue;
    }
    positional.push(a);
  }
  return { flags, positional };
}

function splitFlagList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseTagSpec(raw: string): { key: string; value?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(":");
  if (idx === -1) return { key: trimmed };
  const key = trimmed.slice(0, idx).trim();
  const value = trimmed.slice(idx + 1).trim();
  if (!key) return null;
  return { key, value: value || undefined };
}

function runGit(
  args: string[],
  cwd: string,
): { code: number; stdout: string; stderr: string } {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    code: res.status ?? 1,
    stdout: String(res.stdout ?? ""),
    stderr: String(res.stderr ?? ""),
  };
}

function collectGitMeta(cwd: string): {
  branch?: string;
  commit?: string;
  remote?: string;
} {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const commit = runGit(["rev-parse", "HEAD"], cwd);
  const remote = runGit(["config", "--get", "remote.origin.url"], cwd);
  return {
    branch: branch.code === 0 ? branch.stdout.trim() : undefined,
    commit: commit.code === 0 ? commit.stdout.trim() : undefined,
    remote: remote.code === 0 ? remote.stdout.trim() : undefined,
  };
}

async function writePatchFile(path: string, cwd: string) {
  const diff = runGit(["diff", "--no-color"], cwd);
  const contents = diff.code === 0 ? diff.stdout : "";
  await writeFile(path, contents, "utf8");
  return path;
}

async function pruneArtifacts(artifactsDir: string, keep: number) {
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const runDirs = entries.filter(
    (entry) => entry.isDirectory() && /^(pw|cy)-/.test(entry.name),
  );
  if (runDirs.length <= keep) return;

  const infos = await Promise.all(
    runDirs.map(async (entry) => {
      const path = resolve(artifactsDir, entry.name);
      const stats = await stat(path);
      return { path, mtimeMs: stats.mtimeMs };
    }),
  );

  infos.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const stale = infos.slice(keep);
  for (const entry of stale) {
    await rm(entry.path, { recursive: true, force: true });
  }
}

function emitCiReport(report: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function runCommand(cmd: string, args: string[], cwd: string): number {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  return res.status ?? 1;
}

async function resolvePackageManager(
  projectRoot: string,
  raw: string | undefined,
): Promise<"npm" | "pnpm" | "yarn"> {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "npm" || normalized === "pnpm" || normalized === "yarn") {
    return normalized;
  }
  if (await exists(resolve(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(resolve(projectRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

function installCommand(pkg: "npm" | "pnpm" | "yarn", deps: string[]) {
  if (pkg === "pnpm") return { cmd: "pnpm", args: ["add", "-D", ...deps] };
  if (pkg === "yarn") return { cmd: "yarn", args: ["add", "-D", ...deps] };
  return { cmd: "npm", args: ["install", "-D", ...deps] };
}

function playwrightBrowserInstallCommand(
  pkg: "npm" | "pnpm" | "yarn",
  browsers: string[],
) {
  const suffix = browsers.length ? browsers : [];
  if (pkg === "pnpm")
    return { cmd: "pnpm", args: ["exec", "playwright", "install", ...suffix] };
  if (pkg === "yarn")
    return { cmd: "yarn", args: ["playwright", "install", ...suffix] };
  return { cmd: "npx", args: ["playwright", "install", ...suffix] };
}

async function loadSpecs(projectRoot: string, testcasesDir: string) {
  const dir = resolve(projectRoot, testcasesDir);
  const entries = await readdir(dir);
  const specs: Array<{ id: string; path: string; md: string }> = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const abs = resolve(dir, name);
    const md = await readFile(abs, "utf8");
    const spec = parseTestcaseMarkdown(md);
    specs.push({ id: spec.id, path: abs, md });
  }
  return specs;
}

function normalizeEdits(edits: Array<Record<string, unknown>>): SpecEdit[] {
  return edits
    .map((e) => ({
      section: String((e as any).section ?? ""),
      op: String((e as any).op ?? ""),
      path: (e as any).path != null ? String((e as any).path) : undefined,
      value: (e as any).value,
      index:
        typeof (e as any).index === "number" ? (e as any).index : undefined,
    }))
    .filter(
      (e) =>
        e.section &&
        (e.section === "preconditions" ||
          e.section === "data" ||
          e.section === "steps" ||
          e.section === "assertions" ||
          e.section === "locators") &&
        (e.op === "set" || e.op === "add" || e.op === "remove"),
    ) as SpecEdit[];
}

async function applySpecUpdatesForPlans(input: {
  entry: { spec: any; path: string; md: string };
  plans: Array<{
    specUpdate?: { proposedEdits?: Array<Record<string, unknown>> };
  }>;
  policy: { specUpdatesRequireApprovalFor: string[] };
  dryRun: boolean;
  projectRoot: string;
  artifactsDir: string;
  graph: GraphChangelog | null;
  runNodeId: string;
}) {
  const edits = input.plans
    .map((p) => p.specUpdate?.proposedEdits ?? [])
    .flat();
  const normalized = normalizeEdits(edits);
  if (!normalized.length) return { applied: false };

  const { updatedMarkdown, touchedSections } = applySpecEditsToMarkdown(
    input.entry.md,
    normalized,
  );
  const approvalNeeded = touchedSections.some((s) =>
    input.policy.specUpdatesRequireApprovalFor.includes(s),
  );

  if (approvalNeeded && !input.dryRun) {
    const approvalPath = resolve(
      input.artifactsDir,
      `spec-update-${input.entry.spec.id}.json`,
    );
    await writeFile(
      approvalPath,
      JSON.stringify(
        {
          testcasePath: input.entry.path,
          edits: normalized,
          touchedSections,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    if (input.graph) {
      await input.graph.appendChange({
        runNodeId: input.runNodeId,
        kind: "spec_update_pending",
        summary: `Spec update pending for ${input.entry.spec.id}`,
        modifiedFiles: [relative(input.projectRoot, input.entry.path)],
        artifacts: { approvalPath, sections: touchedSections },
      });
    }
    return { applied: false, approvalPath };
  }

  if (!input.dryRun) {
    await writeFile(input.entry.path, updatedMarkdown, "utf8");
    if (input.graph) {
      const changeId = await input.graph.appendChange({
        runNodeId: input.runNodeId,
        kind: "spec_update",
        summary: `Updated testcase ${input.entry.spec.id}`,
        modifiedFiles: [relative(input.projectRoot, input.entry.path)],
        artifacts: { sections: touchedSections },
      });
      await input.graph.markActiveTest(input.entry.spec.id, changeId);
    }
  }

  return { applied: !input.dryRun, touchedSections };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveTestFilePath(
  projectRoot: string,
  testId: string,
  runner: string,
): Promise<string> {
  if (runner === "cypress") {
    const candidates = [
      resolve(projectRoot, "cypress", "e2e", `${testId}.cy.ts`),
      resolve(projectRoot, "cypress", "e2e", `${testId}.cy.js`),
      resolve(projectRoot, "cypress", "integration", `${testId}.spec.ts`),
      resolve(projectRoot, "cypress", "integration", `${testId}.spec.js`),
    ];
    for (const c of candidates) if (await exists(c)) return c;
  }
  return resolve(projectRoot, "e2e", "tests", `${testId}.spec.ts`);
}

export async function main() {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const projectRoot = flags.projectRoot
    ? resolve(flags.projectRoot)
    : process.cwd();
  const configPath = flags.config
    ? resolve(flags.config)
    : resolve(projectRoot, "agent.config.json");
  const dryRun = flags.dryRun === "true";

  const config = await loadAgentConfig({ projectRoot, configPath });
  const agentName = config.agentName;

  const cmd = (positional[0] ?? "") as Command;

  if (
    !cmd ||
    (cmd !== "init" &&
      cmd !== "run" &&
      cmd !== "install" &&
      cmd !== "test" &&
      cmd !== "synth" &&
      cmd !== "heal" &&
      cmd !== "rerun" &&
      cmd !== "template")
  ) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  if (cmd === "install") {
    const runnerRaw = (flags.runner || "").trim().toLowerCase();
    const runner = runnerRaw || config.defaultRunner;
    if (runner !== "playwright" && runner !== "cypress" && runner !== "both") {
      process.stderr.write(
        "install --runner must be playwright, cypress, or both.\n",
      );
      process.exit(2);
    }

    const pkg = await resolvePackageManager(projectRoot, flags.packageManager);
    const browsers = (flags.browsers || "")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    const withBrowsers = flags.withBrowsers === "true" || browsers.length > 0;
    const targets = runner === "both" ? ["playwright", "cypress"] : [runner];

    const commands: Array<{ cmd: string; args: string[] }> = [];
    if (targets.includes("playwright")) {
      commands.push(installCommand(pkg, ["@playwright/test"]));
      if (withBrowsers)
        commands.push(playwrightBrowserInstallCommand(pkg, browsers));
    }
    if (targets.includes("cypress")) {
      commands.push(installCommand(pkg, ["cypress"]));
    }

    if (dryRun) {
      for (const c of commands) {
        process.stdout.write(`Dry-run: ${c.cmd} ${c.args.join(" ")}\n`);
      }
      return;
    }

    for (const c of commands) {
      const code = runCommand(c.cmd, c.args, projectRoot);
      if (code !== 0) process.exit(code);
    }
    process.stdout.write("Install complete.\n");
    return;
  }

  async function writeLastRunReport(report: Record<string, unknown>) {
    const path = resolve(config.paths.artifactsDir, "last-run.json");
    await writeRunReport(path, report as any);
    if (!dryRun) {
      await pruneArtifacts(config.paths.artifactsDir, 3);
    }
  }

  async function loadLastRunReport() {
    const path = resolve(config.paths.artifactsDir, "last-run.json");
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  if (cmd === "rerun") {
    try {
      const last = await loadLastRunReport();
      const command = String(last.command ?? "");
      if (
        !command ||
        (command !== "test" && command !== "heal" && command !== "synth")
      ) {
        throw new Error("last-run.json does not contain a rerunnable command.");
      }

      const args: string[] = [command];
      const suite = String(last.suite ?? "");
      const all = Boolean(last.all);
      const testcaseId = String(last.testcaseId ?? "");
      const retries =
        typeof last.retries === "number" ? String(last.retries) : "";
      const headed = last.headed === true;
      const dryRunFlag = last.dryRun === true;
      const projectRoot = String(last.projectRoot ?? "");

      if (suite) {
        args.push("--suite", suite);
      } else if (all) {
        args.push("--all");
      } else if (testcaseId) {
        args.push(testcaseId);
      } else {
        throw new Error("last-run.json does not include a testcase to rerun.");
      }

      if (retries) args.push("--retries", retries);
      if (headed) args.push("--headed");
      if (dryRunFlag) args.push("--dry-run");
      if (projectRoot) args.push("--projectRoot", projectRoot);

      const self = process.argv[1];
      const selfArgs = self.endsWith(".ts")
        ? ["--experimental-strip-types", self]
        : [self];
      const result = spawnSync(process.execPath, [...selfArgs, ...args], {
        stdio: "inherit",
      });
      process.exit(result.status ?? 1);
    } catch (err: any) {
      process.stderr.write(`rerun failed: ${String(err?.message ?? err)}\n`);
      process.exit(2);
    }
  }

  if (!dryRun) await ensureProjectScaffold(config);
  const llm = loadProvider(config);
  const basePolicy = await resolvePolicy({ projectRoot: config.projectRoot });

  if (cmd === "init") {
    if (!dryRun) {
      const graph = await GraphChangelog.openOrCreate(
        config.paths.graphChangelogPath,
      );
      await graph.appendRun({
        runner: config.defaultRunner,
        summary: "Initialized graph changelog",
        artifacts: {
          policySource: basePolicy.policy.source,
          agentsMd: basePolicy.workspaceRules.agentsMdPath ?? null,
        },
        testcases: [],
      });
    }
    process.stdout.write(`Initialized. Config agentName=${agentName}\n`);
    process.stdout.write(`LLM provider: ${llm.name}\n`);
    process.stdout.write(
      `LLM detectedFrom: ${config.llm.detectedFrom ?? "config"}\n`,
    );
    process.stdout.write(
      `Policy: ${basePolicy.policy.source} (allow: ${basePolicy.policy.allow.join(", ")})\n`,
    );
    return;
  }

  if (cmd === "template") {
    const hasTestId = Boolean(positional[1]);
    let testId = positional[1] || "";
    if (!testId) {
      const now = new Date();
      const y = String(now.getFullYear());
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      testId = `TEST-${y}${m}${d}`;
    }
    const templatePath = resolve(
      projectRoot,
      config.paths.testcasesDir,
      "TEMPLATE.md",
    );
    const fileStem = testId.toLowerCase();
    const defaultPath = resolve(
      projectRoot,
      config.paths.testcasesDir,
      `${fileStem}.md`,
    );
    let outputPath = flags.out ? resolve(projectRoot, flags.out) : defaultPath;

    let template: string;
    try {
      template = await readFile(templatePath, "utf8");
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
      template = exampleTestcaseMarkdown();
      if (!dryRun) {
        await writeFile(templatePath, template, "utf8");
      }
    }

    const requiredSections = [
      /^##\s*Title\b/m,
      /^##\s*Tags\b/m,
      /^##\s*Runner\b/m,
      /^##\s*Preconditions\b/m,
      /^##\s*Data\b/m,
      /^##\s*Steps\b/m,
      /^##\s*Assertions\b/m,
    ];

    if (!requiredSections.every((re) => re.test(template))) {
      template = exampleTestcaseMarkdown();
      if (!dryRun) {
        await writeFile(templatePath, template, "utf8");
      }
    }

    if (flags.auto === "true") {
      const dir = resolve(outputPath, "..");
      const base = outputPath.replace(/\.md$/i, "");
      const baseRoot = base.replace(/-\d{3}$/i, "");
      const pad3 = (value: number) => String(value).padStart(3, "0");
      let index = 1;
      let candidate = `${baseRoot}-${pad3(index)}.md`;
      while (true) {
        try {
          await access(candidate);
          index += 1;
          candidate = `${baseRoot}-${pad3(index)}.md`;
        } catch {
          outputPath = candidate;
          break;
        }
      }
    } else if (!flags.overwrite) {
      try {
        await access(outputPath);
        process.stderr.write(`Template exists: ${outputPath}\n`);
        process.stderr.write("Use --overwrite to replace it.\n");
        process.exit(2);
      } catch {
        // continue
      }
    }

    const testIdFromPath = basename(outputPath).replace(/\.md$/i, "");
    if (flags.auto === "true") {
      testId = testIdFromPath;
    } else if (!hasTestId) {
      testId = testIdFromPath;
    }

    let replaced = template.replace(/^#\s*.+$/m, `# TestCase: ${testId}`);

    replaced = replaced.replace(/##\s*Title\s*\n([^\n]*)/m, (match, line) => {
      const trimmed = String(line ?? "").trim();
      if (
        !trimmed ||
        /short human-readable title/i.test(trimmed) ||
        /describe the goal/i.test(trimmed)
      ) {
        return `## Title\n${testId}`;
      }
      return match;
    });

    if (!dryRun) {
      await writeFile(outputPath, replaced, "utf8");
    }
    process.stdout.write(
      dryRun
        ? `Dry-run: would write ${outputPath}\n`
        : `Wrote template: ${outputPath}\n`,
    );
    return;
  }

  const suite = flags.suite || "";
  const isAll = flags.all === "true";
  const testcasePath = positional[1];

  const specs =
    isAll || suite
      ? await loadSpecs(projectRoot, config.paths.testcasesDir)
      : (() => {
          if (!testcasePath) return [];
          const normalized =
            testcasePath.endsWith(".md") ||
            testcasePath.includes("/") ||
            testcasePath.includes("\\")
              ? testcasePath
              : resolve(
                  config.paths.testcasesDir,
                  `${testcasePath.toLowerCase()}.md`,
                );
          const abs = resolve(projectRoot, normalized);
          return [{ id: "", path: abs, md: "" }];
        })();

  if (!specs.length) {
    process.stderr.write(usage(agentName) + "\n");
    process.exit(2);
  }

  const specEntries: Array<{ spec: any; path: string; md: string }> = [];
  for (const entry of specs) {
    if (!entry.md) {
      const md = await readFile(entry.path, "utf8");
      const spec = parseTestcaseMarkdown(md);
      specEntries.push({ spec, path: entry.path, md });
    } else {
      const spec = parseTestcaseMarkdown(entry.md);
      specEntries.push({ spec, path: entry.path, md: entry.md });
    }
  }

  const filtered = suite
    ? specEntries.filter((e) => e.spec.suite === suite)
    : specEntries;

  const excludedIds = new Set(splitFlagList(flags.exclude));
  const excludedSuites = new Set(splitFlagList(flags.excludeSuite));
  const excludedTags = splitFlagList(flags.excludeTag)
    .map(parseTagSpec)
    .filter(Boolean) as Array<{ key: string; value?: string }>;

  const excludedFiltered = filtered.filter((entry) => {
    if (excludedIds.has(entry.spec.id)) return false;
    if (entry.spec.suite && excludedSuites.has(entry.spec.suite)) return false;
    if (excludedTags.length) {
      for (const tag of excludedTags) {
        const tagValue = entry.spec.tags?.[tag.key];
        if (tag.value == null) {
          if (tagValue != null) return false;
        } else if (String(tagValue) === tag.value) {
          return false;
        }
      }
    }
    return true;
  });

  const modeFiltered = excludedFiltered;

  if (!modeFiltered.length) {
    process.stderr.write(`No testcases match suite '${suite}'.\n`);
    process.exit(2);
  }

  const graph = dryRun
    ? null
    : await GraphChangelog.openOrCreate(config.paths.graphChangelogPath);

  if (graph) {
    for (const entry of modeFiltered) {
      const localResolved = await resolvePolicy({
        projectRoot: config.projectRoot,
        spec: entry.spec,
      });
      await graph.upsertTestcaseNode(entry.spec);
      await graph.appendRun({
        runner: config.defaultRunner,
        summary: `Parsed testcase ${entry.spec.id}`,
        artifacts: {
          policySource: localResolved.policy.source,
          agentsMd: localResolved.workspaceRules.agentsMdPath ?? null,
        },
        testcases: [entry.spec.id],
      });
    }
  }

  const primary = modeFiltered[0]!;
  const resolved = await resolvePolicy({
    projectRoot: config.projectRoot,
    spec: primary.spec,
  });
  process.stdout.write(
    `Parsed testcase: ${primary.spec.id} (${primary.spec.title})\n`,
  );
  process.stdout.write(`LLM provider: ${llm.name}\n`);
  process.stdout.write(
    `LLM detectedFrom: ${config.llm.detectedFrom ?? "config"}\n`,
  );
  process.stdout.write(
    `Policy: ${resolved.policy.source} (allow: ${resolved.policy.allow.join(", ")})\n`,
  );
  emitPolicyHint(resolved.workspaceRules);

  if (cmd === "run") {
    if (suite || isAll) {
      process.stdout.write(`Parsed ${modeFiltered.length} testcases.\n`);
    }
    process.stdout.write(
      `Use 'synth', 'test', or 'heal' to generate tests, run E2E, or self-heal.\n`,
    );
    return;
  }

  if (cmd === "synth") {
    if (suite || isAll) {
      process.stderr.write("'synth' does not support --suite/--all.\n");
      process.exit(2);
    }
    const overwrite = flags.overwrite === "true";
    const result = await synthesizeTest(config, primary.spec, {
      overwrite,
      dryRun,
    });
    if (result.wrote) {
      process.stdout.write(`Synthesized: ${result.outPath}\n`);
    } else if (result.reason === "dry_run") {
      process.stdout.write(`Dry-run: would write ${result.outPath}\n`);
    } else {
      process.stdout.write(`Skipped (exists): ${result.outPath}\n`);
    }
    if (graph) {
      const runNodeId = await graph.appendRun({
        runner: config.defaultRunner,
        summary: result.wrote
          ? `Synthesized ${primary.spec.id}`
          : `Synth skipped for ${primary.spec.id}`,
        artifacts: {
          outPath: result.outPath,
          policySource: resolved.policy.source,
        },
        testcases: [primary.spec.id],
      });
      if (result.wrote) {
        const changeId = await graph.appendChange({
          runNodeId,
          kind: "synth",
          summary: `Generated ${result.outPath}`,
          modifiedFiles: [relative(projectRoot, result.outPath)],
          artifacts: { outPath: result.outPath },
        });
        await graph.markActiveTest(primary.spec.id, changeId);
      }
    }
    const report = {
      timestamp: new Date().toISOString(),
      command: "synth",
      testcaseId: primary.spec.id,
      status: "pass" as const,
      projectRoot: config.projectRoot,
      policySource: resolved.policy.source,
      llmProvider: llm.name,
      notes: result.wrote
        ? undefined
        : [
            result.reason === "dry_run"
              ? "Dry-run: no file written"
              : "Skipped: file exists",
          ],
      ci: flags.ci === "true",
      dryRun,
      git: collectGitMeta(projectRoot),
    };
    if (flags.report) {
      await writeRunReport(flags.report, report);
    }
    await writeLastRunReport(report);
    if (flags.ci === "true") emitCiReport(report);
    if (flags.patch && !dryRun) {
      const patchFile = await writePatchFile(flags.patch, projectRoot);
      if (flags.report) {
        await writeRunReport(flags.report, { ...report, patchFile });
      }
      await writeLastRunReport({ ...report, patchFile });
      if (flags.ci === "true") emitCiReport({ ...report, patchFile });
    }
    return;
  }

  if (cmd === "heal") {
    if (flags.approve) {
      const raw = await readFile(flags.approve, "utf8");
      const approval = JSON.parse(raw) as {
        testcasePath: string;
        edits: SpecEdit[];
      };
      const md = await readFile(approval.testcasePath, "utf8");
      const applied = applySpecEditsToMarkdown(md, approval.edits);
      if (!dryRun)
        await writeFile(approval.testcasePath, applied.updatedMarkdown, "utf8");
      process.stdout.write(
        `Applied approved spec updates: ${approval.testcasePath}\n`,
      );
      return;
    }

    if (modeFiltered.length > 1) {
      const results: Array<Record<string, unknown>> = [];
      let approvalPending = false;
      for (const entry of modeFiltered) {
        const localResolved = await resolvePolicy({
          projectRoot: config.projectRoot,
          spec: entry.spec,
        });
        const { finalEvidence, iterations, plans } = await healLoop({
          config,
          spec: entry.spec,
          policy: localResolved.policy,
          llm,
          dryRun,
        });

        const runNodeId = graph
          ? await graph.appendRun({
              runner: config.defaultRunner,
              summary: finalEvidence.failingTests.length
                ? `Heal failed for ${entry.spec.id}`
                : `Heal passed for ${entry.spec.id}`,
              artifacts: {
                runId: finalEvidence.runId,
                policySource: localResolved.policy.source,
              },
              testcases: [entry.spec.id],
            })
          : "";

        if (graph) {
          let lastChangeId = "";
          for (const p of plans) {
            const changedPath = await resolveTestFilePath(
              projectRoot,
              entry.spec.id,
              p.runner,
            );
            lastChangeId = await graph.appendChange({
              runNodeId,
              kind: "heal_plan",
              confidence: p.confidence,
              summary: `${p.classification}`,
              modifiedFiles: [relative(projectRoot, changedPath)],
              detail: { changes: p.changes },
              artifacts: finalEvidence.artifacts,
            });
          }
          if (lastChangeId) {
            await graph.markActiveTest(entry.spec.id, lastChangeId);
          }
        }

        const specUpdateResult = await applySpecUpdatesForPlans({
          entry,
          plans,
          policy: localResolved.policy,
          dryRun,
          projectRoot,
          artifactsDir: config.paths.artifactsDir,
          graph,
          runNodeId,
        });
        if (specUpdateResult.approvalPath) approvalPending = true;

        results.push({
          testcaseId: entry.spec.id,
          status: finalEvidence.failingTests.length ? "fail" : "pass",
          iterations,
          runner: config.defaultRunner,
          artifacts: finalEvidence.artifacts,
        });
      }

      const report = {
        timestamp: new Date().toISOString(),
        command: "heal",
        status:
          results.some((r) => r.status === "fail") || approvalPending
            ? "fail"
            : "pass",
        projectRoot: config.projectRoot,
        policySource: resolved.policy.source,
        llmProvider: llm.name,
        ci: flags.ci === "true",
        dryRun,
        git: collectGitMeta(projectRoot),
        testcases: results.map((r) => r.testcaseId),
        results,
        suite: suite || undefined,
        all: isAll || undefined,
        notes: approvalPending
          ? ["Spec update approval required for one or more tests"]
          : undefined,
      };
      if (flags.report) await writeRunReport(flags.report, report as any);
      await writeLastRunReport(report as any);
      if (flags.ci === "true") emitCiReport(report);
      if (flags.ci === "true" && report.status === "fail") process.exit(1);
      return;
    }

    if (dryRun) {
      const report = {
        timestamp: new Date().toISOString(),
        command: "heal",
        testcaseId: primary.spec.id,
        runner: config.defaultRunner,
        status: "pass" as const,
        iterations: 0,
        projectRoot: config.projectRoot,
        policySource: resolved.policy.source,
        llmProvider: llm.name,
        notes: ["Dry-run: no tests executed or files written"],
        ci: flags.ci === "true",
        dryRun,
        git: collectGitMeta(projectRoot),
      };
      if (flags.report) await writeRunReport(flags.report, report);
      await writeLastRunReport(report);
      if (flags.ci === "true") emitCiReport(report);
      return;
    }
    const { finalEvidence, iterations, plans } = await healLoop({
      config,
      spec: primary.spec,
      policy: resolved.policy,
      llm,
      dryRun,
    });
    const runNodeId = graph
      ? await graph.appendRun({
          runner: config.defaultRunner,
          summary: finalEvidence.failingTests.length
            ? `Heal failed for ${primary.spec.id}`
            : `Heal passed for ${primary.spec.id}`,
          artifacts: {
            runId: finalEvidence.runId,
            policySource: resolved.policy.source,
          },
          testcases: [primary.spec.id],
        })
      : "";
    // Record changes (best-effort). We don't track file diffs yet; we at least store change kinds.
    if (graph) {
      let lastChangeId = "";
      for (const p of plans) {
        const changedPath = await resolveTestFilePath(
          projectRoot,
          primary.spec.id,
          p.runner,
        );
        lastChangeId = await graph.appendChange({
          runNodeId,
          kind: "heal_plan",
          confidence: p.confidence,
          summary: `${p.classification}`,
          modifiedFiles: [relative(projectRoot, changedPath)],
          detail: { changes: p.changes },
          artifacts: finalEvidence.artifacts,
        });
      }
      if (lastChangeId)
        await graph.markActiveTest(primary.spec.id, lastChangeId);
    }

    const specUpdateResult = await applySpecUpdatesForPlans({
      entry: primary,
      plans,
      policy: resolved.policy,
      dryRun,
      projectRoot,
      artifactsDir: config.paths.artifactsDir,
      graph,
      runNodeId,
    });

    process.stdout.write(
      finalEvidence.failingTests.length
        ? `Heal: FAIL after ${iterations}\n`
        : `Heal: PASS after ${iterations}\n`,
    );
    const report = {
      timestamp: new Date().toISOString(),
      command: "heal",
      testcaseId: primary.spec.id,
      runner: config.defaultRunner,
      status:
        finalEvidence.failingTests.length || specUpdateResult.approvalPath
          ? "fail"
          : "pass",
      iterations,
      projectRoot: config.projectRoot,
      policySource: resolved.policy.source,
      llmProvider: llm.name,
      artifacts: finalEvidence.artifacts,
      ci: flags.ci === "true",
      dryRun,
      git: collectGitMeta(projectRoot),
      notes: specUpdateResult.approvalPath
        ? ["Spec update approval required"]
        : undefined,
    };
    if (flags.report) await writeRunReport(flags.report, report);
    await writeLastRunReport(report);
    if (flags.ci === "true") emitCiReport(report);
    if (flags.patch) {
      const patchFile = await writePatchFile(flags.patch, projectRoot);
      if (flags.report)
        await writeRunReport(flags.report, { ...report, patchFile });
      await writeLastRunReport({ ...report, patchFile });
      if (flags.ci === "true") emitCiReport({ ...report, patchFile });
    }
    if (flags.ci === "true")
      process.exit(finalEvidence.failingTests.length ? 1 : 0);
    return;
  }

  const retries = flags.retries ? Number(flags.retries) : undefined;
  const headed = flags.headed === "true";
  if (dryRun) {
    if (modeFiltered.length > 1) {
      const report = {
        timestamp: new Date().toISOString(),
        command: "test",
        status: "pass" as const,
        projectRoot: config.projectRoot,
        policySource: resolved.policy.source,
        llmProvider: llm.name,
        ci: flags.ci === "true",
        dryRun,
        git: collectGitMeta(projectRoot),
        testcases: modeFiltered.map((e) => e.spec.id),
        results: modeFiltered.map((e) => ({
          testcaseId: e.spec.id,
          status: "pass",
          runner: config.defaultRunner,
          notes: ["Dry-run: no tests executed"],
        })),
        suite: suite || undefined,
        all: isAll || undefined,
        retries,
        headed,
      };
      if (flags.report) await writeRunReport(flags.report, report as any);
      await writeLastRunReport(report as any);
      if (flags.ci === "true") emitCiReport(report);
      return;
    }
    const report = {
      timestamp: new Date().toISOString(),
      command: "test",
      testcaseId: primary.spec.id,
      runner: config.defaultRunner,
      status: "pass" as const,
      projectRoot: config.projectRoot,
      policySource: resolved.policy.source,
      llmProvider: llm.name,
      notes: ["Dry-run: no tests executed"],
      ci: flags.ci === "true",
      dryRun,
      git: collectGitMeta(projectRoot),
      retries,
      headed,
    };
    if (flags.report) await writeRunReport(flags.report, report);
    await writeLastRunReport(report);
    if (flags.ci === "true") emitCiReport(report);
    return;
  }

  if (modeFiltered.length > 1) {
    const results: Array<Record<string, unknown>> = [];
    for (const entry of modeFiltered) {
      const evidence = await runE2E(config, {
        testId: entry.spec.id,
        headed,
        retries,
      });
      results.push({
        testcaseId: entry.spec.id,
        status: evidence.failingTests.length ? "fail" : "pass",
        runner: config.defaultRunner,
        artifacts: evidence.artifacts,
      });
      if (graph) {
        await graph.appendRun({
          runner: config.defaultRunner,
          summary: evidence.failingTests.length
            ? `E2E failed for ${entry.spec.id}`
            : `E2E passed for ${entry.spec.id}`,
          artifacts: {
            policySource: resolved.policy.source,
            agentsMd: resolved.workspaceRules.agentsMdPath ?? null,
            runId: evidence.runId,
          },
          testcases: [entry.spec.id],
        });
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      command: "test",
      status: results.some((r) => r.status === "fail") ? "fail" : "pass",
      projectRoot: config.projectRoot,
      policySource: resolved.policy.source,
      llmProvider: llm.name,
      ci: flags.ci === "true",
      dryRun,
      git: collectGitMeta(projectRoot),
      testcases: results.map((r) => r.testcaseId),
      results,
      suite: suite || undefined,
      all: isAll || undefined,
      retries,
      headed,
    };
    if (flags.report) await writeRunReport(flags.report, report as any);
    await writeLastRunReport(report as any);
    if (flags.ci === "true") emitCiReport(report);
    if (flags.ci === "true" && report.status === "fail") process.exit(1);
    return;
  }

  const evidence = await runE2E(config, {
    testId: primary.spec.id,
    headed,
    retries,
  });

  if (graph)
    await graph.appendRun({
      runner: config.defaultRunner,
      summary: evidence.failingTests.length
        ? `E2E failed for ${primary.spec.id}`
        : `E2E passed for ${primary.spec.id}`,
      artifacts: {
        policySource: resolved.policy.source,
        agentsMd: resolved.workspaceRules.agentsMdPath ?? null,
        runId: evidence.runId,
      },
      testcases: [primary.spec.id],
    });

  process.stdout.write(
    evidence.failingTests.length ? "E2E: FAIL\n" : "E2E: PASS\n",
  );
  const report = {
    timestamp: new Date().toISOString(),
    command: "test",
    testcaseId: primary.spec.id,
    runner: config.defaultRunner,
    status: evidence.failingTests.length ? "fail" : "pass",
    projectRoot: config.projectRoot,
    policySource: resolved.policy.source,
    llmProvider: llm.name,
    artifacts: evidence.artifacts,
    ci: flags.ci === "true",
    dryRun,
    git: collectGitMeta(projectRoot),
    retries,
    headed,
  };
  if (flags.report) await writeRunReport(flags.report, report);
  await writeLastRunReport(report);
  if (flags.ci === "true") emitCiReport(report);
  if (flags.patch) {
    const patchFile = await writePatchFile(flags.patch, projectRoot);
    if (flags.report)
      await writeRunReport(flags.report, { ...report, patchFile });
    await writeLastRunReport({ ...report, patchFile });
    if (flags.ci === "true") emitCiReport({ ...report, patchFile });
  }
  if (flags.ci === "true") process.exit(evidence.failingTests.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + "\n");
    process.exit(1);
  });
}
