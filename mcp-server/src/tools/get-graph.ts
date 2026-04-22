import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  seed: z.string().uuid().describe("Entity UUID to root the BFS at."),
  depth: z.number().int().min(1).max(3).optional().default(1),
  limit: z.number().int().min(1).max(500).optional().default(100),
  predicates: z.string().optional().describe("Comma-separated list of relationship predicates to restrict the traversal (e.g. 'member_of,represents')."),
};

export const getGraph: ToolDef<typeof inputSchema> = {
  name: "get_graph",
  title: "Get graph slice",
  description:
    "Return a bounded BFS graph slice rooted at a canonical entity. Traverses both outgoing and incoming relationships up to `depth`. Useful for 'who is connected to X' questions.",
  inputSchema,
  async handler({ seed, depth, limit, predicates }, { api }) {
    const env = await api.get<{
      seed: { canonical_name: string };
      nodes: Array<{ id: string; kind: string; canonical_name: string; depth: number }>;
      edges: Array<{ subject_id: string; predicate: string; object_id: string }>;
    }>("/graph", { seed, depth, limit, predicates });
    const md: string[] = [];
    md.push(`# Graph slice around ${env.data.seed.canonical_name}`);
    md.push(`**Nodes:** ${env.data.nodes.length} · **Edges:** ${env.data.edges.length} · **Depth:** ${depth}`);
    md.push("");
    md.push("## Nodes");
    for (const n of env.data.nodes.slice(0, 30)) {
      md.push(`- (${n.kind}, d${n.depth}) ${n.canonical_name}`);
    }
    return { text: md.join("\n"), structured: env.data as Record<string, unknown> };
  },
};
