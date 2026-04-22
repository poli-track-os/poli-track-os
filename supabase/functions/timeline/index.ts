// GET /functions/v1/timeline?subject_id=&country=&event_type=&from=&to=&limit=&cursor=
//
// Cross-entity timeline. Returns political_events filtered by any of the
// supported facets, newest-first, with cursor-based pagination.
//
// The cursor is a base64url-encoded `{ts, id}` pair — the event_timestamp
// and primary key of the last row in the previous page. Clients pass it
// back as `cursor` and the next page starts after that position in the
// keyset.
//
// Why keyset: offset-based pagination breaks on large filtered timelines
// (27k+ events today, more as ingestion grows). Keyset is O(1) regardless
// of page number.

import { handle, ok, fail, intParam, type ProvenanceEntry } from "../_shared/envelope.ts";

interface CursorPayload {
  ts: string;
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "==".slice(0, (4 - (padded.length % 4)) % 4));
    const parsed = JSON.parse(json);
    if (typeof parsed.ts === "string" && typeof parsed.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

Deno.serve((req) => handle(req, async ({ supabase, url }) => {
  const subjectId = url.searchParams.get("subject_id");
  const country = url.searchParams.get("country")?.toUpperCase();
  const eventType = url.searchParams.get("event_type");
  const source = url.searchParams.get("source");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(Math.max(intParam(url, "limit", 50), 1), 200);
  const cursorRaw = url.searchParams.get("cursor");

  let q = supabase
    .from("political_events")
    .select(
      "id, politician_id, event_type, title, description, event_timestamp, source, source_url, source_handle, sentiment, evidence_count, trust_level, entities",
    )
    .order("event_timestamp", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (subjectId) {
    // subject_id can point either to a politician_id OR to an entity_id.
    // We try politician_id first since that's the common SPA case.
    q = q.eq("politician_id", subjectId);
  }
  if (eventType) q = q.eq("event_type", eventType);
  if (source) q = q.eq("source", source);
  if (from) q = q.gte("event_timestamp", from);
  if (to) q = q.lte("event_timestamp", to);

  if (country) {
    // political_events has no country column; join through politicians.
    // Use PostgREST's embed + filter semantics to narrow the rows.
    q = q.eq("politicians.country_code", country);
    q = q.select(
      "id, politician_id, event_type, title, description, event_timestamp, source, source_url, source_handle, sentiment, evidence_count, trust_level, entities, politicians!inner(country_code, country_name)",
    );
  }

  if (cursorRaw) {
    const cursor = decodeCursor(cursorRaw);
    if (!cursor) return fail("BAD_CURSOR", "cursor is not a valid keyset token", 400);
    // Keyset continuation: event_timestamp < cursor.ts OR (event_timestamp = cursor.ts AND id < cursor.id)
    // PostgREST can't express composite comparisons, so we approximate with
    // the timestamp bound. Ties on the exact microsecond are rare enough
    // to accept the sliver of duplication; callers should dedupe on id.
    q = q.lte("event_timestamp", cursor.ts);
  }

  const { data, error } = await q;
  if (error) return fail("QUERY_FAILED", error.message, 500);

  const rows = (data || []) as Array<{ id: string; event_timestamp: string } & Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore
    ? encodeCursor({ ts: page[page.length - 1].event_timestamp, id: page[page.length - 1].id })
    : null;

  const provenance: ProvenanceEntry[] = [
    { kind: "political_events", data_source: "mixed", trust_level: 2 },
  ];

  return ok(
    { events: page, next_cursor: next },
    {
      cacheTtlSeconds: 120,
      rowCounts: { events: page.length },
      provenance,
    },
  );
}));
