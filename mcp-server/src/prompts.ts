import { z } from "zod";

// Reusable investigative prompt templates. Ship with the MCP server and
// surface in the client UI's "suggested prompts" menu.
//
// Each entry is converted to an `McpServer.registerPrompt()` call in the
// Node entry, or returned verbatim via `prompts/list` by the Deno edge
// function. The Handler returns a list of Messages with inlined tool
// usage hints — the model then decides which tools to call.

export interface PromptDef {
  name: string;
  title: string;
  description: string;
  argsSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, string>) => {
    messages: Array<{
      role: "user" | "assistant";
      content: { type: "text"; text: string };
    }>;
  };
}

export const investigatePolitician: PromptDef = {
  name: "investigate_politician",
  title: "Investigate a politician",
  description:
    "Assemble a dossier on one politician: committee assignments, lobby meetings, voting record on recent major proposals, and reputational signals.",
  argsSchema: {
    name_or_id: z
      .string()
      .describe("Politician name or UUID. If name, the LLM should search first."),
  },
  handler({ name_or_id }) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Investigate the politician "${name_or_id}".`,
              "",
              "Steps:",
              "1. If the input isn't already a UUID, call `search_politicians` to find the match.",
              "2. Call `get_politician` with the resolved id. Read every returned section.",
              "3. For each lobby organisation that met with them, call `get_lobby_org` to see declared spend and sector.",
              "4. Produce a 1-page Markdown briefing with: role and party, committee assignments, top 3 lobby relationships, 3 most recent significant events, and any items that warrant follow-up.",
              "5. Include inline citations to `source_url` fields from the data.",
            ].join("\n"),
          },
        },
      ],
    };
  },
};

export const compareCountries: PromptDef = {
  name: "compare_countries",
  title: "Compare countries on a topic",
  description:
    "Side-by-side comparison of two or more EU countries on a named topic (budget allocation, legislative activity, lobbying pressure).",
  argsSchema: {
    countries: z.string().describe("Comma-separated ISO-3166 alpha-2 codes, e.g. DE,FR,PT"),
    topic: z.string().describe("Topic focus: budget, proposals, lobbying, or a policy area like health."),
  },
  handler({ countries, topic }) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Compare countries [${countries}] on the topic "${topic}".`,
              "",
              "For each country:",
              "- Call `get_country` for the composite snapshot.",
              "- If the topic is budget-related, also call `get_budget` with the default (latest) year.",
              "- If the topic is legislative, call `search_proposals` filtered by area.",
              "",
              "Return a Markdown table comparing the countries on the most relevant 3-5 metrics, plus a short prose summary of the biggest divergences. Cite each fact via the response's `provenance` entries.",
            ].join("\n"),
          },
        },
      ],
    };
  },
};

export const traceMoneyFlow: PromptDef = {
  name: "trace_money_flow",
  title: "Trace a lobby organisation's influence",
  description:
    "Given a lobby organisation name or transparency ID, trace its declared spend, the politicians it has met with, and those politicians' voting activity on relevant proposals.",
  argsSchema: {
    lobby_org: z.string().describe("Organisation name or EU Transparency Register ID."),
  },
  handler({ lobby_org }) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Trace the money flow for the lobby organisation "${lobby_org}".`,
              "",
              "Plan:",
              "1. If the input isn't a transparency ID, call `search_entities` with kind=lobby_org to resolve it.",
              "2. Call `get_lobby_org` with the transparency ID. Read declared spend history and meetings.",
              "3. For the top 5 politicians they met with, call `get_politician` and `get_timeline` with the politician id. Look for votes on proposals in the organisation's domain.",
              "4. Output a chain-of-evidence Markdown report: org → spend → meetings → votes, with inline URL citations.",
            ].join("\n"),
          },
        },
      ],
    };
  },
};

export const findCommitteeMembers: PromptDef = {
  name: "find_committee_members",
  title: "Find committee members",
  description:
    "Find current members of an EP or national committee. Summarise each by party, country, and any disclosed lobby meetings.",
  argsSchema: {
    committee: z.string().describe("Committee name or acronym, e.g. ECON or Environment."),
  },
  handler({ committee }) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Find current members of the committee "${committee}".`,
              "",
              "Plan:",
              "1. Call `search_politicians` to find MEPs and MPs whose `committees` field contains the committee name.",
              "2. For each, call `get_politician` to fetch lobby_meetings and recent events.",
              "3. Return a Markdown table: name, country, party, number of disclosed lobby meetings, and a one-line note about their recent activity.",
            ].join("\n"),
          },
        },
      ],
    };
  },
};

export const ALL_PROMPTS: PromptDef[] = [
  investigatePolitician,
  compareCountries,
  traceMoneyFlow,
  findCommitteeMembers,
];
