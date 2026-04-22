// Handler for GET /functions/v1/page/lobby
//
// Top organisations list backing Lobby.tsx. Mirrors the useTopLobbyOrgs
// hook: pull a wider candidate pool, join the latest spend row per org,
// sort desc, then slice to limit.

import { ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleLobbyList(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const search = url.searchParams.get("search")?.trim() || null;
  const limit = Math.min(Math.max(intParam(url, "limit", 50), 1), 200);

  let orgQ = supabase
    .from("lobby_organisations")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });
  if (search) orgQ = orgQ.ilike("name", `%${search}%`);
  orgQ = orgQ.limit(limit * 3);

  const { data: orgs, error: orgErr, count } = await orgQ;
  if (orgErr) return fail("QUERY_FAILED", orgErr.message, 500);

  const orgRows = (orgs || []) as Array<Record<string, unknown> & { id: string }>;
  if (orgRows.length === 0) {
    return ok(
      { organisations: [], total_count: count ?? 0 },
      {
        cacheTtlSeconds: 600,
        rowCounts: { organisations: 0 },
        provenance: [
          { kind: "lobby_organisations", data_source: "eu_transparency_register", trust_level: 1 },
        ],
      },
    );
  }

  const { data: spend, error: spendErr } = await supabase
    .from("lobby_spend")
    .select("lobby_id, year, declared_amount_eur_high, declared_amount_eur_low")
    .in("lobby_id", orgRows.map((o) => o.id))
    .order("year", { ascending: false });
  if (spendErr) return fail("QUERY_FAILED", spendErr.message, 500);

  type SpendRow = {
    lobby_id: string;
    year: number;
    declared_amount_eur_high: number | null;
    declared_amount_eur_low: number | null;
  };
  const latestByLobby = new Map<string, { year: number; amount: number }>();
  for (const row of (spend || []) as SpendRow[]) {
    if (latestByLobby.has(row.lobby_id)) continue;
    if (row.declared_amount_eur_high !== null) {
      latestByLobby.set(row.lobby_id, { year: row.year, amount: Number(row.declared_amount_eur_high) });
    }
  }

  const enriched = orgRows.map((o) => ({
    ...o,
    latest_spend: latestByLobby.get(o.id)?.amount ?? null,
    latest_spend_year: latestByLobby.get(o.id)?.year ?? null,
  }));
  enriched.sort((a, b) => (Number(b.latest_spend) || 0) - (Number(a.latest_spend) || 0));
  const organisations = enriched.slice(0, limit);

  const provenance: ProvenanceEntry[] = [
    { kind: "lobby_organisations", data_source: "eu_transparency_register", trust_level: 1 },
    { kind: "lobby_spend", data_source: "eu_transparency_register", trust_level: 1 },
  ];

  return ok(
    { organisations, total_count: count ?? orgRows.length },
    {
      cacheTtlSeconds: 600,
      rowCounts: { organisations: organisations.length },
      provenance,
    },
  );
}
