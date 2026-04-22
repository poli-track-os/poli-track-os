import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  query: z.string().optional().describe("Substring to match against politician name."),
  country: z.string().length(2).optional().describe("ISO-3166 alpha-2 country code, e.g. DE, FR, PT."),
  limit: z.number().int().min(1).max(200).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
};

export const searchPoliticians: ToolDef<typeof inputSchema> = {
  name: "search_politicians",
  title: "Search politicians",
  description:
    "List politicians (MEPs and national parliamentarians) optionally filtered by country and name substring. Returns a paginated array of politician summaries — id, name, party, country, role.",
  inputSchema,
  async handler({ query, country, limit, offset }, { api }) {
    const env = await api.get<{ politicians: unknown[]; total_count?: number }>("/page/actors", {
      query,
      country: country?.toUpperCase(),
      limit,
      offset,
    });
    const politicians = (env.data.politicians || []) as Array<{
      id: string;
      name: string;
      country_code: string;
      country_name: string;
      party_abbreviation: string | null;
      party_name: string | null;
      role: string | null;
    }>;
    const lines = politicians.map(
      (p) =>
        `- **${p.name}** (${p.party_abbreviation || "Independent"}, ${p.country_name}) — ${p.role || "Politician"}  \n  id: \`${p.id}\``,
    );
    return {
      text:
        `### Politicians${country ? ` in ${country.toUpperCase()}` : ""}` +
        `${query ? ` matching "${query}"` : ""}\n\n` +
        (lines.length > 0 ? lines.join("\n") : "_No matches._") +
        `\n\n_Showing ${politicians.length}${env.data.total_count ? ` of ${env.data.total_count}` : ""}._`,
      structured: env.data as Record<string, unknown>,
    };
  },
};
