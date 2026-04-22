// Handler for GET /functions/v1/page/home
//
// Landing page aggregator. Mirrors what Index.tsx assembles from a few
// hooks (politicians, country stats, proposals, countries by coverage).

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleHome(ctx: EnvelopeContext) {
  const { supabase } = ctx;

  const [recentRes, statsRes, topProposalsRes] = await Promise.all([
    supabase
      .from("politicians")
      .select("*")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("politicians")
      .select("country_code, country_name, continent, party_name"),
    supabase
      .from("proposals")
      .select("*")
      .order("submitted_date", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  if (recentRes.error) return fail("QUERY_FAILED", recentRes.error.message, 500);
  if (statsRes.error) return fail("QUERY_FAILED", statsRes.error.message, 500);
  if (topProposalsRes.error) return fail("QUERY_FAILED", topProposalsRes.error.message, 500);

  type StatRow = {
    country_code: string;
    country_name: string;
    continent: string | null;
    party_name: string | null;
  };
  const countries = new Map<string, {
    code: string;
    name: string;
    continent: string;
    actor_count: number;
    parties: Set<string>;
  }>();
  for (const p of (statsRes.data || []) as StatRow[]) {
    const existing = countries.get(p.country_code) || {
      code: p.country_code,
      name: p.country_name,
      continent: p.continent || "Unknown",
      actor_count: 0,
      parties: new Set<string>(),
    };
    existing.actor_count++;
    if (p.party_name) existing.parties.add(p.party_name);
    countries.set(p.country_code, existing);
  }
  const country_stats = Array.from(countries.values()).map((c) => ({
    code: c.code,
    name: c.name,
    continent: c.continent,
    actor_count: c.actor_count,
    party_count: c.parties.size,
  }));
  const top_countries_by_coverage = [...country_stats]
    .sort((a, b) => b.actor_count - a.actor_count)
    .slice(0, 10);

  const provenance: ProvenanceEntry[] = [
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
    { kind: "proposals", data_source: "national_parliaments", trust_level: 1 },
  ];

  return ok(
    {
      recent_politicians: recentRes.data || [],
      country_stats,
      top_proposals: topProposalsRes.data || [],
      top_countries_by_coverage,
    },
    {
      cacheTtlSeconds: 300,
      rowCounts: {
        recent_politicians: (recentRes.data || []).length,
        top_proposals: (topProposalsRes.data || []).length,
        country_stats: country_stats.length,
      },
      provenance,
    },
  );
}
