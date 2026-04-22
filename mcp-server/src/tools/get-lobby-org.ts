import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  transparency_id: z.string().describe("EU Transparency Register ID (e.g. 12345678-12)."),
};

export const getLobbyOrg: ToolDef<typeof inputSchema> = {
  name: "get_lobby_org",
  title: "Get lobby organisation",
  description:
    "Return full detail for a registered lobby organisation: declared category, declared annual spend history, and disclosed meetings with politicians (where available). Sourced from LobbyFacts / EU Transparency Register.",
  inputSchema,
  async handler({ transparency_id }, { api }) {
    const env = await api.get<{
      organisation: Record<string, unknown> | null;
      spend_history?: Array<{ year: number; declared_amount_eur_high: number | null }>;
      meetings?: Array<{ meeting_date: string; politicians?: { name: string } | null; subject: string | null }>;
    }>(`/page/lobby/${encodeURIComponent(transparency_id)}`);
    const org = env.data.organisation as {
      name?: string;
      category?: string | null;
      country_code?: string | null;
      website?: string | null;
    } | null;
    if (!org) return { text: `Lobby org ${transparency_id} not found.`, isError: true };
    const md: string[] = [];
    md.push(`# ${org.name ?? transparency_id}`);
    if (org.category) md.push(`**Category:** ${org.category}`);
    if (org.country_code) md.push(`**Country:** ${org.country_code}`);
    if (org.website) md.push(`**Website:** ${org.website}`);
    md.push("");
    if (env.data.spend_history && env.data.spend_history.length > 0) {
      md.push("## Declared annual spend");
      md.push("| Year | Upper bound (€) |");
      md.push("|---|---:|");
      for (const s of env.data.spend_history.slice(-10)) {
        md.push(`| ${s.year} | ${s.declared_amount_eur_high?.toLocaleString() ?? "—"} |`);
      }
    }
    if (env.data.meetings && env.data.meetings.length > 0) {
      md.push("");
      md.push(`## Meetings (${env.data.meetings.length})`);
      for (const m of env.data.meetings.slice(0, 10)) {
        md.push(`- [${m.meeting_date}] ${m.politicians?.name ?? "Unknown"}${m.subject ? ` — ${m.subject}` : ""}`);
      }
    }
    return { text: md.join("\n"), structured: env.data as Record<string, unknown> };
  },
};
