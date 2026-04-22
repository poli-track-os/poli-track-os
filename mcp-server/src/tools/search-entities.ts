import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  query: z.string().min(2).describe("Substring to search across canonical-entity names and aliases."),
  kind: z.string().optional().describe("Restrict to one entity kind (person, party, country, proposal, committee, lobby_org, institution)."),
  limit: z.number().int().min(1).max(100).optional().default(20),
};

export const searchEntities: ToolDef<typeof inputSchema> = {
  name: "search_entities",
  title: "Search the canonical graph",
  description:
    "Global search over the canonical entities graph. Matches on entity names and on aliases (Wikidata QIDs, MEP IDs, ISO codes, ...). Returns ranked hits with their kind and slug — use `get_entity_card` to expand one.",
  inputSchema,
  async handler({ query, kind, limit }, { api }) {
    const env = await api.get<{
      results: Array<{
        id: string;
        kind: string;
        canonical_name: string;
        slug: string;
        score: number;
        matched_on: string;
        matched_value?: string;
      }>;
    }>("/search", { q: query, kind, limit });
    const lines = env.data.results.map(
      (r) =>
        `- **${r.canonical_name}** _(${r.kind})_ — slug \`${r.slug}\` · score ${r.score}${r.matched_value ? ` · matched alias: ${r.matched_value}` : ""}`,
    );
    return {
      text: `### Search results (${env.data.results.length})\n\n${lines.join("\n") || "_No matches._"}`,
      structured: env.data as Record<string, unknown>,
    };
  },
};
