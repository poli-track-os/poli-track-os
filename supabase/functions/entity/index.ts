// GET /functions/v1/entity?kind=person&slug=jane-example-12345678&format=json|markdown
//
// Canonical entity card. Stitches together `entities`, `entity_aliases`,
// `claims`, `relationships`, and a slice of `political_events` for the
// linked politician (if any), and returns either:
//
//   - `Accept: application/json` (default) → envelope + structured data
//   - `Accept: text/markdown` or `?format=markdown` → deterministic
//     Markdown card rendered by src/lib/entity-card.ts
//
// The Markdown mode is the one that's optimized for LLM prompts; JSON
// is for programmatic consumers (typed clients, visualizations, etc).

import { renderEntityCard, type EntityCardInput } from "../../../src/lib/entity-card.ts";
import { handle, ok, fail, requireParam, type ProvenanceEntry } from "../_shared/envelope.ts";

Deno.serve((req) => handle(req, async ({ supabase, url, accept }) => {
  const kind = requireParam(url, "kind");
  const slug = requireParam(url, "slug");
  const format = url.searchParams.get("format") || (accept.includes("text/markdown") ? "markdown" : "json");

  const { data: entity, error: entityErr } = await supabase
    .from("entities")
    .select("id, kind, canonical_name, slug, summary, first_seen_at")
    .eq("kind", kind)
    .eq("slug", slug)
    .maybeSingle();
  if (entityErr) return fail("QUERY_FAILED", entityErr.message, 500);
  if (!entity) return fail("NOT_FOUND", `entity ${kind}/${slug} not found`, 404);

  const [{ data: aliases }, { data: claims }, { data: relsOut }, { data: relsIn }] = await Promise.all([
    supabase
      .from("entity_aliases")
      .select("scheme, value, trust_level")
      .eq("entity_id", entity.id),
    supabase
      .from("claims")
      .select("key, value, value_type, valid_from, valid_to, data_source, trust_level, source_url")
      .eq("entity_id", entity.id)
      .order("trust_level", { ascending: true }),
    supabase
      .from("relationships")
      .select(
        "predicate, object_id, valid_from, valid_to, role, entities!relationships_object_id_fkey(id, kind, canonical_name, slug)",
      )
      .eq("subject_id", entity.id)
      .limit(200),
    supabase
      .from("relationships")
      .select(
        "predicate, subject_id, valid_from, valid_to, entities!relationships_subject_id_fkey(id, kind, canonical_name, slug)",
      )
      .eq("object_id", entity.id)
      .limit(200),
  ]);

  let recentEvents: Array<{
    event_type: string;
    title: string;
    event_timestamp: string;
    source: string | null;
    source_url: string | null;
  }> = [];
  if (entity.kind === "person") {
    const { data: pol } = await supabase
      .from("politicians")
      .select("id")
      .eq("entity_id", entity.id)
      .maybeSingle();
    if (pol) {
      const { data: events } = await supabase
        .from("political_events")
        .select("event_type, title, event_timestamp, source, source_url")
        .eq("politician_id", (pol as { id: string }).id)
        .order("event_timestamp", { ascending: false })
        .limit(20);
      recentEvents = (events || []) as typeof recentEvents;
    }
  }

  const input: EntityCardInput = {
    entity: entity as EntityCardInput["entity"],
    aliases: (aliases || []) as EntityCardInput["aliases"],
    claims: (claims || []) as EntityCardInput["claims"],
    relationshipsOut: ((relsOut || []) as Array<{
      predicate: string;
      valid_from: string | null;
      valid_to: string | null;
      role: string | null;
      entities: { id: string; kind: string; canonical_name: string; slug: string } | null;
    }>).map((r) => ({
      predicate: r.predicate,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      role: r.role,
      object: r.entities,
    })),
    relationshipsIn: ((relsIn || []) as Array<{
      predicate: string;
      valid_from: string | null;
      valid_to: string | null;
      entities: { id: string; kind: string; canonical_name: string; slug: string } | null;
    }>).map((r) => ({
      predicate: r.predicate,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      subject: r.entities,
    })),
    recentEvents,
  };

  const provenance: ProvenanceEntry[] = [
    {
      kind: "entity",
      id: entity.id,
      data_source: "canonical_graph",
      trust_level: 2,
    },
  ];

  const markdownBody = renderEntityCard(input);
  const rowCounts = {
    aliases: input.aliases.length,
    claims: input.claims.length,
    relationships_out: input.relationshipsOut.length,
    relationships_in: input.relationshipsIn.length,
    recent_events: recentEvents.length,
  };

  if (format === "markdown" || accept.includes("text/markdown")) {
    return ok(
      {
        entity: input.entity,
        aliases: input.aliases,
        claims: input.claims,
        relationships_out: input.relationshipsOut,
        relationships_in: input.relationshipsIn,
        recent_events: recentEvents,
      },
      {
        cacheTtlSeconds: 600,
        rowCounts,
        provenance,
        markdownBody,
      },
    );
  }

  return ok(
    {
      entity: input.entity,
      aliases: input.aliases,
      claims: input.claims,
      relationships_out: input.relationshipsOut,
      relationships_in: input.relationshipsIn,
      recent_events: recentEvents,
      markdown: markdownBody,
    },
    { cacheTtlSeconds: 600, rowCounts, provenance },
  );
}));
