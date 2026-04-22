// Handler for GET /functions/v1/page/explore
//
// Grouping countries by continent for the Explore page. Reuses the same
// politicians-derived stats as /home but partitions by continent.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleExplore(ctx: EnvelopeContext) {
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("politicians")
    .select("country_code, country_name, continent, party_name");
  if (error) return fail("QUERY_FAILED", error.message, 500);

  type Row = {
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
  for (const p of (data || []) as Row[]) {
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

  const countries_by_continent: Record<string, Array<{
    code: string;
    name: string;
    actor_count: number;
    party_count: number;
  }>> = {};
  let total = 0;
  for (const c of countries.values()) {
    (countries_by_continent[c.continent] ||= []).push({
      code: c.code,
      name: c.name,
      actor_count: c.actor_count,
      party_count: c.parties.size,
    });
    total++;
  }
  for (const key of Object.keys(countries_by_continent)) {
    countries_by_continent[key].sort((a, b) => a.name.localeCompare(b.name));
  }

  const provenance: ProvenanceEntry[] = [
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
  ];

  return ok(
    { countries_by_continent },
    {
      cacheTtlSeconds: 900,
      rowCounts: { countries: total },
      provenance,
    },
  );
}
