// Handler for GET /functions/v1/page/actors
//
// Filterable/paginated politician directory. Matches Actors.tsx — which
// loads the full list client-side today — but returns a page at a time.

import { ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleActorsList(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const country = url.searchParams.get("country")?.toUpperCase() || null;
  const query = url.searchParams.get("query")?.trim() || null;
  const limit = Math.min(Math.max(intParam(url, "limit", 50), 1), 200);
  const offset = Math.max(intParam(url, "offset", 0), 0);

  let q = supabase
    .from("politicians")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });
  if (country) q = q.eq("country_code", country);
  if (query) q = q.ilike("name", `%${query}%`);
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return fail("QUERY_FAILED", error.message, 500);

  const provenance: ProvenanceEntry[] = [
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
  ];

  return ok(
    {
      politicians: data || [],
      total_count: count ?? (data || []).length,
      filters: { country, query, limit, offset },
    },
    {
      cacheTtlSeconds: 300,
      rowCounts: { politicians: (data || []).length },
      provenance,
    },
  );
}
