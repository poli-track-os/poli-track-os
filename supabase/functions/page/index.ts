// GET /functions/v1/page/{route}/...
//
// Single edge function that hosts every Layer 3 per-page aggregator.
// Routes match SPA pages 1:1 (home, explore, country, actor, proposal,
// budget, lobby, ...). Each concrete handler lives in its own file and
// returns an envelope via the shared helpers in ../_shared/envelope.ts.
//
// Why one function instead of 14: deploys are faster, shared helpers are
// imported once, and the MCP server only has one edge endpoint to target.
// The tradeoff is that all handlers share the same cold-start cost, but
// that's acceptable for a read-only batch-updated platform.

import { handle, fail, type EnvelopeContext } from "../_shared/envelope.ts";
import { handleHome } from "./home.ts";
import { handleExplore } from "./explore.ts";
import { handleActorsList } from "./actors-list.ts";
import { handleActor } from "./actor.ts";
import { handleCountry } from "./country.ts";
import { handleParty } from "./party.ts";
import { handleProposalsList } from "./proposals-list.ts";
import { handleProposal } from "./proposal.ts";
import { handleRelationships } from "./relationships.ts";
import { handleData } from "./data.ts";
import { handleBudget } from "./budget.ts";
import { handleLobbyList } from "./lobby.ts";
import { handleLobbyDetail } from "./lobby-detail.ts";
import { handleTimeline } from "./timeline.ts";

interface Route {
  match: RegExp;
  paramNames: string[];
  handler: (ctx: EnvelopeContext, params: Record<string, string>) => Promise<unknown>;
}

// Strip the function prefix (`/page` or `/functions/v1/page`) so the
// route matching works regardless of how the function is invoked.
function stripPrefix(pathname: string): string {
  return pathname
    .replace(/^\/functions\/v1\/page/, "")
    .replace(/^\/page/, "")
    .replace(/\/+$/, "") || "/";
}

const ROUTES: Route[] = [
  { match: /^\/?$/,                           paramNames: [],                    handler: (ctx) => handleHome(ctx) },
  { match: /^\/home\/?$/,                     paramNames: [],                    handler: (ctx) => handleHome(ctx) },
  { match: /^\/explore\/?$/,                  paramNames: [],                    handler: (ctx) => handleExplore(ctx) },
  { match: /^\/actors\/?$/,                   paramNames: [],                    handler: (ctx) => handleActorsList(ctx) },
  { match: /^\/actor\/([^/]+)\/?$/,           paramNames: ["id"],                handler: (ctx, p) => handleActor(ctx, p) },
  { match: /^\/country\/([^/]+)\/?$/,         paramNames: ["code"],              handler: (ctx, p) => handleCountry(ctx, p) },
  { match: /^\/party\/([^/]+)\/([^/]+)\/?$/,  paramNames: ["country", "party"],  handler: (ctx, p) => handleParty(ctx, p) },
  { match: /^\/proposals\/?$/,                paramNames: [],                    handler: (ctx) => handleProposalsList(ctx) },
  { match: /^\/proposal\/([^/]+)\/?$/,        paramNames: ["id"],                handler: (ctx, p) => handleProposal(ctx, p) },
  { match: /^\/relationships\/?$/,            paramNames: [],                    handler: (ctx) => handleRelationships(ctx) },
  { match: /^\/data\/?$/,                     paramNames: [],                    handler: (ctx) => handleData(ctx) },
  { match: /^\/budget\/([^/]+)\/?$/,          paramNames: ["country"],           handler: (ctx, p) => handleBudget(ctx, p) },
  { match: /^\/lobby\/([^/]+)\/?$/,           paramNames: ["transparency_id"],   handler: (ctx, p) => handleLobbyDetail(ctx, p) },
  { match: /^\/lobby\/?$/,                    paramNames: [],                    handler: (ctx) => handleLobbyList(ctx) },
  { match: /^\/timeline\/?$/,                 paramNames: [],                    handler: (ctx) => handleTimeline(ctx) },
];

Deno.serve((req) => handle(req, async (ctx) => {
  const path = stripPrefix(ctx.url.pathname);
  for (const route of ROUTES) {
    const m = path.match(route.match);
    if (!m) continue;
    const params: Record<string, string> = {};
    for (let i = 0; i < route.paramNames.length; i++) {
      params[route.paramNames[i]] = decodeURIComponent(m[i + 1] || "");
    }
    const result = await route.handler(ctx, params);
    return result as never;
  }
  return fail("NOT_FOUND", `no page handler for ${path}`, 404);
}));
