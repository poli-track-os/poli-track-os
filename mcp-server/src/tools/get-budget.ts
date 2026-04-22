import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  country: z.string().length(2).describe("ISO-3166 alpha-2 country code."),
  year: z.number().int().min(2000).max(2100).optional().describe("Budget year; defaults to latest available."),
};

export const getBudget: ToolDef<typeof inputSchema> = {
  name: "get_budget",
  title: "Get country budget snapshot",
  description:
    "Return a country's government-expenditure snapshot from Eurostat COFOG data for one year: total spend, per-function breakdown, time series, and demographics (population, GDP) where available.",
  inputSchema,
  async handler({ country, year }, { api }) {
    const env = await api.get<{
      country: string;
      year: number;
      total_million_eur?: number;
      breakdown?: Array<{ cofog_code: string; cofog_label: string | null; amount_million_eur: number; pct_of_total: number | null }>;
      timeseries?: Array<{ year: number; total: number }>;
      demographics?: { population?: number; gdp_million_eur?: number };
    }>(`/page/budget/${encodeURIComponent(country.toUpperCase())}`, { year });
    const md: string[] = [];
    md.push(`# Budget — ${country.toUpperCase()} (${env.data.year})`);
    if (env.data.total_million_eur) {
      md.push(`**Total expenditure:** €${env.data.total_million_eur.toLocaleString()} million`);
    }
    if (env.data.demographics?.population) {
      md.push(`**Population:** ${env.data.demographics.population.toLocaleString()}`);
    }
    if (env.data.demographics?.gdp_million_eur) {
      md.push(`**GDP:** €${env.data.demographics.gdp_million_eur.toLocaleString()} million`);
    }
    md.push("");
    if (env.data.breakdown && env.data.breakdown.length > 0) {
      md.push("## Breakdown by function (COFOG)");
      md.push("| Function | Amount (€M) | % of total |");
      md.push("|---|---:|---:|");
      for (const b of env.data.breakdown.slice(0, 12)) {
        md.push(
          `| ${b.cofog_label || b.cofog_code} | ${b.amount_million_eur.toLocaleString()} | ${b.pct_of_total?.toFixed(1) ?? "—"}% |`,
        );
      }
    }
    return { text: md.join("\n"), structured: env.data as Record<string, unknown> };
  },
};
