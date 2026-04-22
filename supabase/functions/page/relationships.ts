// Handler for GET /functions/v1/page/relationships
//
// Backs Relationships.tsx. Returns the per-politician position rows with
// their joined name/party/country, a rough "alliance" grouping derived
// from ideology_label, and a per-country count breakdown.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleRelationships(ctx: EnvelopeContext) {
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("politician_positions")
    .select(
      "*, politicians!inner(name, party_name, party_abbreviation, country_code, country_name)",
    );
  if (error) return fail("QUERY_FAILED", error.message, 500);

  const rows = (data || []) as Array<Record<string, unknown> & {
    ideology_label: string | null;
    politicians: {
      name: string;
      party_name: string | null;
      party_abbreviation: string | null;
      country_code: string;
      country_name: string | null;
    } | null;
  }>;

  const positions = rows.map((r) => ({
    ...r,
    name: r.politicians?.name,
    party_name: r.politicians?.party_name,
    party_abbreviation: r.politicians?.party_abbreviation,
    country_code: r.politicians?.country_code,
    country_name: r.politicians?.country_name,
  }));

  const alliances = new Map<string, {
    ideology: string;
    size: number;
    politicians: Array<{ politician_id: string; name: string | null; country_code: string | null }>;
  }>();
  const country_counts = new Map<string, number>();
  for (const r of rows) {
    const ideology = (r.ideology_label || "Unknown").trim();
    const bucket = alliances.get(ideology) || { ideology, size: 0, politicians: [] };
    bucket.size++;
    bucket.politicians.push({
      politician_id: r.politician_id as string,
      name: r.politicians?.name || null,
      country_code: r.politicians?.country_code || null,
    });
    alliances.set(ideology, bucket);

    const cc = r.politicians?.country_code || "UNKNOWN";
    country_counts.set(cc, (country_counts.get(cc) || 0) + 1);
  }

  const party_alliances = Array.from(alliances.values()).sort((a, b) => b.size - a.size);
  const country_breakdown = Array.from(country_counts.entries())
    .map(([country_code, count]) => ({ country_code, count }))
    .sort((a, b) => b.count - a.count);

  const provenance: ProvenanceEntry[] = [
    { kind: "politician_positions", data_source: "derived", trust_level: 2 },
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
  ];

  return ok(
    {
      positions,
      party_alliances,
      country_breakdown,
    },
    {
      cacheTtlSeconds: 900,
      rowCounts: {
        positions: positions.length,
        alliances: party_alliances.length,
        countries: country_breakdown.length,
      },
      provenance,
    },
  );
}
