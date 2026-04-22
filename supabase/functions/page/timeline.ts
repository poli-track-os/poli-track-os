// Handler for GET /functions/v1/page/timeline
//
// Thin wrapper around the same cursor-paginated keyset query used by
// supabase/functions/timeline/index.ts, but parses SPA-style filters so
// the page can hit a single route. Kept inline — no shared module,
// because edge-function directories don't always resolve cleanly across
// each other at deploy time.

import { ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

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

export async function handleTimeline(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const type = url.searchParams.get("type"); // aliases event_type
  const source = url.searchParams.get("source");
  const country = url.searchParams.get("country")?.toUpperCase();
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

  if (type) q = q.eq("event_type", type);
  if (source) q = q.eq("source", source);
  if (from) q = q.gte("event_timestamp", from);
  if (to) q = q.lte("event_timestamp", to);

  if (country) {
    q = q.eq("politicians.country_code", country);
    q = q.select(
      "id, politician_id, event_type, title, description, event_timestamp, source, source_url, source_handle, sentiment, evidence_count, trust_level, entities, politicians!inner(country_code, country_name)",
    );
  }

  if (cursorRaw) {
    const cursor = decodeCursor(cursorRaw);
    if (!cursor) return fail("BAD_CURSOR", "cursor is not a valid keyset token", 400);
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
    {
      events: page,
      next_cursor: next,
      filters: { type, source, country: country || null, from, to, limit },
    },
    {
      cacheTtlSeconds: 120,
      rowCounts: { events: page.length },
      provenance,
    },
  );
}
