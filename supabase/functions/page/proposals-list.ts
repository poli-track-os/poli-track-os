// Handler for GET /functions/v1/page/proposals
//
// Filterable list backing Proposals.tsx. Also returns small rollup stats
// by status/area so the page header can render counters in one trip.

import { ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleProposalsList(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const country = url.searchParams.get("country")?.toUpperCase() || null;
  const status = url.searchParams.get("status") || null;
  const area = url.searchParams.get("area") || null;
  const query = url.searchParams.get("query")?.trim() || null;
  const limit = Math.min(Math.max(intParam(url, "limit", 50), 1), 200);
  const offset = Math.max(intParam(url, "offset", 0), 0);

  let list = supabase
    .from("proposals")
    .select("*", { count: "exact" })
    .order("submitted_date", { ascending: false, nullsFirst: false });
  if (country) list = list.eq("country_code", country);
  if (status) list = list.eq("status", status);
  if (area) list = list.eq("policy_area", area);
  if (query) list = list.ilike("title", `%${query}%`);
  list = list.range(offset, offset + limit - 1);

  // Stats query ignores pagination/search so header counters reflect the
  // underlying universe for the given country (if any).
  let statsQ = supabase.from("proposals").select("status, policy_area");
  if (country) statsQ = statsQ.eq("country_code", country);

  const [listRes, statsRes] = await Promise.all([list, statsQ]);
  if (listRes.error) return fail("QUERY_FAILED", listRes.error.message, 500);
  if (statsRes.error) return fail("QUERY_FAILED", statsRes.error.message, 500);

  const by_status: Record<string, number> = {};
  const by_area: Record<string, number> = {};
  for (const row of (statsRes.data || []) as Array<{ status: string | null; policy_area: string | null }>) {
    if (row.status) by_status[row.status] = (by_status[row.status] || 0) + 1;
    if (row.policy_area) by_area[row.policy_area] = (by_area[row.policy_area] || 0) + 1;
  }

  const provenance: ProvenanceEntry[] = [
    { kind: "proposals", data_source: "national_parliaments", trust_level: 1 },
  ];

  return ok(
    {
      proposals: listRes.data || [],
      filters: { country, status, area, query, limit, offset },
      total_count: listRes.count ?? (listRes.data || []).length,
      stats: { by_status, by_area },
    },
    {
      cacheTtlSeconds: 300,
      rowCounts: { proposals: (listRes.data || []).length },
      provenance,
    },
  );
}
