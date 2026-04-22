import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  code: z.string().length(2).describe("ISO-3166 alpha-2 country code, e.g. DE, FR, PT."),
};

export const getCountry: ToolDef<typeof inputSchema> = {
  name: "get_country",
  title: "Get country dossier",
  description:
    "Return a composite country page: country metadata, politicians grouped by party, party metadata, recent proposals, and the latest year's government expenditure snapshot (COFOG breakdown).",
  inputSchema,
  async handler({ code }, { api }) {
    const env = await api.get<{
      country: Record<string, unknown> | null;
      politicians: unknown[];
      politicians_by_party: Record<string, unknown[]>;
      proposals: unknown[];
      budget_latest: {
        year: number;
        total_million_eur: number;
        breakdown: Array<{ cofog_code: string; cofog_label: string | null; amount_million_eur: number }>;
      } | null;
    }>(`/page/country/${encodeURIComponent(code.toUpperCase())}`);

    const c = env.data.country as {
      country_name?: string;
      head_of_state?: string | null;
      head_of_government?: string | null;
      capital?: string | null;
      wikipedia_url?: string | null;
    } | null;

    const md: string[] = [];
    md.push(`# ${c?.country_name || code.toUpperCase()}`);
    if (c?.capital) md.push(`**Capital:** ${c.capital}`);
    if (c?.head_of_state) md.push(`**Head of state:** ${c.head_of_state}`);
    if (c?.head_of_government) md.push(`**Head of government:** ${c.head_of_government}`);
    if (c?.wikipedia_url) md.push(`**Wikipedia:** ${c.wikipedia_url}`);
    md.push("");
    md.push(`## Parties (${Object.keys(env.data.politicians_by_party).length})`);
    for (const [abbr, list] of Object.entries(env.data.politicians_by_party)) {
      md.push(`- **${abbr}** — ${(list as unknown[]).length} politicians`);
    }
    md.push("");
    md.push(`## Recent proposals (${(env.data.proposals as unknown[]).length})`);
    for (const p of (env.data.proposals as unknown[]).slice(0, 8) as Array<{
      title: string;
      status: string;
      submitted_date: string | null;
    }>) {
      md.push(`- [${p.submitted_date?.slice(0, 10) || "?"}] [${p.status}] ${p.title}`);
    }
    if (env.data.budget_latest) {
      md.push("");
      md.push(`## Budget (${env.data.budget_latest.year})`);
      md.push(`**Total:** €${env.data.budget_latest.total_million_eur.toLocaleString()} million`);
      md.push("");
      md.push("Top functions by spend:");
      for (const b of env.data.budget_latest.breakdown.slice(0, 6)) {
        md.push(`- **${b.cofog_label || b.cofog_code}** — €${b.amount_million_eur.toLocaleString()}M`);
      }
    }
    return { text: md.join("\n"), structured: env.data as Record<string, unknown> };
  },
};
