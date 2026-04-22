import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  query: z.string().optional(),
  country: z.string().length(2).optional(),
  status: z.string().optional().describe("Proposal status: consultation|committee|plenary|adopted|rejected|withdrawn|pending_vote"),
  area: z.string().optional().describe("Policy area tag (varies by source)"),
  limit: z.number().int().min(1).max(200).optional().default(30),
  offset: z.number().int().min(0).optional().default(0),
};

export const searchProposals: ToolDef<typeof inputSchema> = {
  name: "search_proposals",
  title: "Search parliamentary proposals",
  description:
    "Search the unified proposals table — EP legislation, national bills, motions — filtered by country, status, policy area, and text. Returns a list of proposal summaries.",
  inputSchema,
  async handler(input, { api }) {
    const env = await api.get<{
      proposals: Array<{
        id: string;
        title: string;
        status: string;
        country_code: string;
        country_name: string;
        submitted_date: string | null;
        policy_area: string | null;
        source_url: string | null;
      }>;
      stats?: Record<string, unknown>;
    }>("/page/proposals", {
      query: input.query,
      country: input.country?.toUpperCase(),
      status: input.status,
      area: input.area,
      limit: input.limit,
      offset: input.offset,
    });
    const lines = env.data.proposals.map(
      (p) =>
        `- [${p.submitted_date?.slice(0, 10) || "?"}] **[${p.status}]** ${p.title}  \n  ${p.country_name}${p.policy_area ? ` · ${p.policy_area}` : ""} · id: \`${p.id}\``,
    );
    return {
      text:
        `### Proposals (${env.data.proposals.length})\n\n` +
        (lines.join("\n") || "_No matches._"),
      structured: env.data as Record<string, unknown>,
    };
  },
};
