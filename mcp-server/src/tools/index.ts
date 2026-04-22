// All Poli-Track MCP tools, registered as plain data so both the Node
// stdio transport (in ../stdio.ts) and the Deno edge function
// (../../../supabase/functions/mcp/index.ts) can import and dispatch the
// same definitions without re-declaring schemas.

import { searchPoliticians } from "./search-politicians.js";
import { getPolitician } from "./get-politician.js";
import { getCountry } from "./get-country.js";
import { searchProposals } from "./search-proposals.js";
import { getProposal } from "./get-proposal.js";
import { getBudget } from "./get-budget.js";
import { getLobbyOrg } from "./get-lobby-org.js";
import { getEntityCard } from "./get-entity-card.js";
import { searchEntities } from "./search-entities.js";
import { getTimeline } from "./get-timeline.js";
import { getGraph } from "./get-graph.js";
import type { ToolDef } from "./types.js";

export const ALL_TOOLS: ToolDef[] = [
  searchPoliticians as unknown as ToolDef,
  getPolitician as unknown as ToolDef,
  getCountry as unknown as ToolDef,
  searchProposals as unknown as ToolDef,
  getProposal as unknown as ToolDef,
  getBudget as unknown as ToolDef,
  getLobbyOrg as unknown as ToolDef,
  getEntityCard as unknown as ToolDef,
  searchEntities as unknown as ToolDef,
  getTimeline as unknown as ToolDef,
  getGraph as unknown as ToolDef,
];

export {
  searchPoliticians,
  getPolitician,
  getCountry,
  searchProposals,
  getProposal,
  getBudget,
  getLobbyOrg,
  getEntityCard,
  searchEntities,
  getTimeline,
  getGraph,
};
