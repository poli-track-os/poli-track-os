import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  id: z.string().uuid().describe("Politician UUID — the primary key from `politicians.id`."),
};

export const getPolitician: ToolDef<typeof inputSchema> = {
  name: "get_politician",
  title: "Get politician dossier",
  description:
    "Return the full dossier for one politician: biographical fields, recent events (speeches, votes, roles), finances, investments, political position estimate, associates, lobby meetings, committees, country and party context. One call replaces ~10 round trips.",
  inputSchema,
  async handler({ id }, { api }) {
    const env = await api.get<{
      politician: Record<string, unknown>;
      events: unknown[];
      finances: unknown;
      investments: unknown[];
      associates: unknown[];
      lobby_meetings: unknown[];
      committees: string[];
      country: Record<string, unknown> | null;
      party: Record<string, unknown> | null;
      position: Record<string, unknown> | null;
    }>(`/page/actor/${encodeURIComponent(id)}`);

    const p = env.data.politician as {
      name: string;
      party_name: string | null;
      party_abbreviation: string | null;
      country_name: string;
      country_code: string;
      role: string | null;
      birth_year: number | null;
      wikipedia_url: string | null;
      twitter_handle: string | null;
      biography: string | null;
    };

    const md: string[] = [];
    md.push(`# ${p.name}`);
    md.push("");
    md.push(`**Role:** ${p.role || "Politician"}`);
    md.push(`**Party:** ${p.party_name || p.party_abbreviation || "Independent"}`);
    md.push(`**Country:** ${p.country_name} (${p.country_code})`);
    if (p.birth_year) md.push(`**Birth year:** ${p.birth_year}`);
    if (p.wikipedia_url) md.push(`**Wikipedia:** ${p.wikipedia_url}`);
    if (p.twitter_handle) md.push(`**Twitter:** @${p.twitter_handle}`);
    if (env.data.committees && env.data.committees.length > 0) {
      md.push(`**Committees:** ${env.data.committees.join(", ")}`);
    }
    md.push("");
    if (p.biography) {
      md.push("## Biography");
      md.push(p.biography);
      md.push("");
    }
    md.push(`## Recent activity (${(env.data.events as unknown[]).length} events)`);
    for (const e of (env.data.events as unknown[]).slice(0, 10) as Array<{
      event_type: string;
      title: string;
      event_timestamp: string;
      source_url: string | null;
    }>) {
      md.push(`- [${e.event_timestamp.slice(0, 10)}] **${e.event_type}** — ${e.title}${e.source_url ? ` ([source](${e.source_url}))` : ""}`);
    }
    if ((env.data.lobby_meetings as unknown[]).length > 0) {
      md.push("");
      md.push(`## Lobby meetings (${(env.data.lobby_meetings as unknown[]).length})`);
      for (const m of (env.data.lobby_meetings as unknown[]).slice(0, 10) as Array<{
        meeting_date: string;
        subject: string | null;
        lobby_organisations: { name: string } | null;
      }>) {
        md.push(`- [${m.meeting_date}] ${m.lobby_organisations?.name ?? "Unknown org"}${m.subject ? ` — ${m.subject}` : ""}`);
      }
    }
    if (env.data.finances) {
      md.push("");
      md.push("## Declared finances (latest year)");
      md.push("```json");
      md.push(JSON.stringify(env.data.finances, null, 2));
      md.push("```");
    }

    return {
      text: md.join("\n"),
      structured: env.data as Record<string, unknown>,
    };
  },
};
