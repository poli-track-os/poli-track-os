import { z } from "zod";
import type { ToolDef } from "./types.js";

const inputSchema = {
  id: z.string().uuid(),
};

export const getProposal: ToolDef<typeof inputSchema> = {
  name: "get_proposal",
  title: "Get proposal detail",
  description:
    "Return full detail for a single parliamentary proposal — title, summary, status, sponsors, affected laws, submission/vote dates, source URL.",
  inputSchema,
  async handler({ id }, { api }) {
    const env = await api.get<{
      proposal: Record<string, unknown> | null;
      sponsor_politicians?: unknown[];
      related_events?: unknown[];
    }>(`/page/proposal/${encodeURIComponent(id)}`);
    const p = env.data.proposal as {
      title: string;
      status: string;
      country_name: string;
      submitted_date: string | null;
      vote_date: string | null;
      summary: string | null;
      policy_area: string | null;
      source_url: string | null;
      sponsors: string[] | null;
      affected_laws: string[] | null;
    } | null;
    if (!p) return { text: `Proposal \`${id}\` not found.`, isError: true };
    const md: string[] = [];
    md.push(`# ${p.title}`);
    md.push(`**Status:** ${p.status}`);
    md.push(`**Country:** ${p.country_name}`);
    if (p.policy_area) md.push(`**Policy area:** ${p.policy_area}`);
    if (p.submitted_date) md.push(`**Submitted:** ${p.submitted_date.slice(0, 10)}`);
    if (p.vote_date) md.push(`**Voted:** ${p.vote_date.slice(0, 10)}`);
    if (p.source_url) md.push(`**Source:** ${p.source_url}`);
    md.push("");
    if (p.summary) {
      md.push("## Summary");
      md.push(p.summary);
      md.push("");
    }
    if (p.sponsors && p.sponsors.length > 0) {
      md.push(`**Sponsors:** ${p.sponsors.join(", ")}`);
    }
    if (p.affected_laws && p.affected_laws.length > 0) {
      md.push(`**Affected laws:** ${p.affected_laws.join(", ")}`);
    }
    return { text: md.join("\n"), structured: env.data as Record<string, unknown> };
  },
};
