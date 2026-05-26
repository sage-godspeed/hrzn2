import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RunnerKind } from "../config.js";
import type { TestcaseSpec } from "../spec/types.js";

export interface Graph {
  schemaVersion: string;
  nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>;
  edges: Array<{ from: string; to: string; type: string; props?: Record<string, unknown> }>;
  events: Array<{
    id: string;
    runNodeId: string;
    summary: string;
    artifacts: Record<string, unknown>;
    changes: Array<Record<string, unknown>>;
  }>;
}

function nowIso() {
  return new Date().toISOString();
}

export class GraphChangelog {
  private constructor(
    private readonly path: string,
    private graph: Graph
  ) {}

  static async openOrCreate(path: string): Promise<GraphChangelog> {
    const abs = resolve(path);
    await mkdir(resolve(dirname(abs)), { recursive: true });
    try {
      const raw = await readFile(abs, "utf8");
      const parsed = JSON.parse(raw) as Graph;
      return new GraphChangelog(abs, parsed);
    } catch {
      const initial: Graph = { schemaVersion: "1.0", nodes: [], edges: [], events: [] };
      await writeFile(abs, JSON.stringify(initial, null, 2) + "\n", "utf8");
      return new GraphChangelog(abs, initial);
    }
  }

  async upsertTestcaseNode(spec: TestcaseSpec) {
    const id = `tc:${spec.id}`;
    const existing = this.graph.nodes.find((n) => n.id === id);
    const props = { title: spec.title, tags: spec.tags, preferredRunner: spec.preferredRunner, suite: spec.suite ?? null };
    if (existing) existing.props = props;
    else this.graph.nodes.push({ id, type: "TestCase", props });
    await this.flush();
  }

  async appendRun(input: { runner: RunnerKind; summary: string; artifacts: Record<string, unknown>; testcases: string[] }) {
    const runId = `run:${nowIso()}`;
    this.graph.nodes.push({ id: runId, type: "Run", props: { runner: input.runner } });
    for (const tc of input.testcases) {
      this.graph.edges.push({ from: runId, to: `tc:${tc}`, type: "RAN" });
    }
    const eventId = `evt:${runId}`;
    this.graph.events.push({ id: eventId, runNodeId: runId, summary: input.summary, artifacts: input.artifacts, changes: [] });
    await this.flush();
  }

  private async flush() {
    await writeFile(this.path, JSON.stringify(this.graph, null, 2) + "\n", "utf8");
  }
}
