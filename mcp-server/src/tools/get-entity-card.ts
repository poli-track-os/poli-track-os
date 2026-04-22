import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  kind: z
    .enum(["person", "party", "country", "proposal", "committee", "lobby_org", "institution"])
    .describe("Entity kind in the canonical graph."),
  slug: z.string().describe("Slug as stored in `entities.slug` — e.g. `jane-example-12345678`."),
};

export const getEntityCard: ToolDef<typeof inputSchema> = {
  name: "get_entity_card",
  title: "Get canonical entity card",
  description:
    "Return a deterministic Markdown + JSON card for one canonical entity: aliases, claims, incoming and outgoing relationships, and a slice of recent events. The canonical-graph equivalent of the SPA's actor or proposal page.",
  inputSchema,
  async handler({ kind, slug }, { api }) {
    // Request markdown directly — this endpoint supports content negotiation.
    const env = await api.get<{ markdown: string }>("/entity", { kind, slug }, "text/markdown");
    return {
      text: (env.data as unknown as { markdown: string }).markdown ?? "_No card rendered._",
      structured: env.data as Record<string, unknown>,
    };
  },
};
