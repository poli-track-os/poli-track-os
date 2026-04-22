import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  subject_id: z.string().uuid().optional().describe("Filter by politician UUID."),
  country: z.string().length(2).optional().describe("ISO-3166 alpha-2 country filter."),
  event_type: z.string().optional(),
  from: z.string().optional().describe("ISO date lower bound, inclusive."),
  to: z.string().optional().describe("ISO date upper bound, inclusive."),
  limit: z.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional().describe("Opaque keyset cursor from a previous response."),
};

export const getTimeline: ToolDef<typeof inputSchema> = {
  name: "get_timeline",
  title: "Get political event timeline",
  description:
    "Return a paginated, keyset-sorted stream of political events (speeches, votes, committee reports, press, social media) filtered by any combination of subject, country, type, and date range.",
  inputSchema,
  async handler(input, { api }) {
    const env = await api.get<{
      events: Array<{
        event_timestamp: string;
        event_type: string;
        title: string;
        source: string | null;
        source_url: string | null;
      }>;
      next_cursor: string | null;
    }>("/timeline", input as Record<string, string | number | undefined>);
    const lines = env.data.events.map(
      (e) =>
        `- [${e.event_timestamp.slice(0, 10)}] **${e.event_type}** — ${e.title}${e.source_url ? ` ([source](${e.source_url}))` : ""}`,
    );
    return {
      text:
        `### Timeline (${env.data.events.length} events)\n\n` +
        (lines.join("\n") || "_No events._") +
        (env.data.next_cursor ? `\n\n_Next page cursor: \`${env.data.next_cursor}\`_` : ""),
      structured: env.data as Record<string, unknown>,
    };
  },
};
