// GET /functions/v1/search?q=...&kind=...&limit=...
//
// Global search over the canonical entities graph. Matches on
// `entities.canonical_name`, `entities.slug`, and `entity_aliases.value`
// (the last one so things like MEP IDs or Wikidata QIDs are discoverable).
//
// Returns an envelope with a results array sorted by a heuristic score:
//   - exact canonical_name match         : 100
//   - canonical_name prefix match        : 80
//   - canonical_name contains match      : 60
//   - alias exact match                  : 70
//   - alias contains match               : 40
//
// Not a real search engine — this is a Postgres ILIKE query. If quality
// becomes a problem, upgrade to tsvector or pg_trgm. Keeping it simple
// here so there's nothing extra to operate.

import { handle, ok, fail, requireParam, intParam, type ProvenanceEntry } from "../_shared/envelope.ts";

interface EntityRow {
  id: string;
  kind: string;
  canonical_name: string;
  slug: string;
  summary: string | null;
}

interface AliasRow {
  entity_id: string;
  scheme: string;
  value: string;
}

interface Hit {
  id: string;
  kind: string;
  canonical_name: string;
  slug: string;
  summary: string | null;
  score: number;
  matched_on: "canonical_name" | "alias";
  matched_value?: string;
}

function scoreCanonical(name: string, q: string): number {
  const nameLower = name.toLowerCase();
  const qLower = q.toLowerCase();
  if (nameLower === qLower) return 100;
  if (nameLower.startsWith(qLower)) return 80;
  if (nameLower.includes(qLower)) return 60;
  return 0;
}

function scoreAlias(value: string, q: string): number {
  const v = value.toLowerCase();
  const qLower = q.toLowerCase();
  if (v === qLower) return 70;
  if (v.includes(qLower)) return 40;
  return 0;
}

Deno.serve((req) => handle(req, async ({ supabase, url }) => {
  const q = requireParam(url, "q").trim();
  if (q.length < 2) return fail("QUERY_TOO_SHORT", "q must be at least 2 characters", 400);
  const kind = url.searchParams.get("kind") || undefined;
  const limit = Math.min(intParam(url, "limit", 20), 100);

  // Escape ILIKE metacharacters so the query behaves as a literal substring.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  let entityQuery = supabase
    .from("entities")
    .select("id, kind, canonical_name, slug, summary")
    .ilike("canonical_name", pattern)
    .limit(limit * 2);
  if (kind) entityQuery = entityQuery.eq("kind", kind);

  const aliasQuery = supabase
    .from("entity_aliases")
    .select("entity_id, scheme, value")
    .ilike("value", pattern)
    .limit(limit * 2);

  const [{ data: entityRows, error: entErr }, { data: aliasRows, error: aliasErr }] = await Promise.all([
    entityQuery,
    aliasQuery,
  ]);
  if (entErr) return fail("QUERY_FAILED", entErr.message, 500);
  if (aliasErr) return fail("QUERY_FAILED", aliasErr.message, 500);

  const hits = new Map<string, Hit>();
  for (const e of (entityRows || []) as EntityRow[]) {
    const s = scoreCanonical(e.canonical_name, q);
    if (!s) continue;
    hits.set(e.id, {
      id: e.id,
      kind: e.kind,
      canonical_name: e.canonical_name,
      slug: e.slug,
      summary: e.summary,
      score: s,
      matched_on: "canonical_name",
    });
  }

  // Look up the entities referenced by alias hits so we can score them too.
  const aliasEntityIds = [...new Set(((aliasRows || []) as AliasRow[]).map((a) => a.entity_id))]
    .filter((id) => !hits.has(id));
  if (aliasEntityIds.length > 0) {
    let q2 = supabase
      .from("entities")
      .select("id, kind, canonical_name, slug, summary")
      .in("id", aliasEntityIds);
    if (kind) q2 = q2.eq("kind", kind);
    const { data: more } = await q2;
    const byId = new Map<string, EntityRow>();
    for (const e of (more || []) as EntityRow[]) byId.set(e.id, e);
    for (const a of (aliasRows || []) as AliasRow[]) {
      const e = byId.get(a.entity_id);
      if (!e) continue;
      const s = scoreAlias(a.value, q);
      if (!s) continue;
      const existing = hits.get(a.entity_id);
      if (!existing || existing.score < s) {
        hits.set(a.entity_id, {
          id: e.id,
          kind: e.kind,
          canonical_name: e.canonical_name,
          slug: e.slug,
          summary: e.summary,
          score: s,
          matched_on: "alias",
          matched_value: a.value,
        });
      }
    }
  }

  const results = [...hits.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const provenance: ProvenanceEntry[] = [
    {
      kind: "entities",
      data_source: "canonical_graph",
      trust_level: 2,
    },
  ];

  return ok(
    { query: q, kind: kind || null, results },
    {
      cacheTtlSeconds: 60,
      rowCounts: { results: results.length },
      provenance,
    },
  );
}));
