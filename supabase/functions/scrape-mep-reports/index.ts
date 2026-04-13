import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.code, obj.details, obj.hint]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" | ");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// legislation_sponsored events for MEPs.
//
// Source: https://www.europarl.europa.eu/meps/en/{id}/{SLUG}/main-activities/reports
//
// Each report appears on this page with:
//   - the full report title wrapped in an <h3>
//   - an identifier like "A10-0013/2026"
//   - a publication date like "04-02-2026"
//   - an owning committee short code (e.g. "JURI")
//
// We emit one political_events row per report with event_type
// 'legislation_sponsored', source 'parliamentary_record', trust_level 1.

interface MepRow {
  id: string;
  name: string;
  external_id: string;
}

interface ReportEntry {
  title: string;
  reportId: string | null;
  committee: string | null;
  date: string | null;
}

function slugifyMepName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z\s]/g, "").replace(/\s+/g, "_");
}

function parseReports(html: string): ReportEntry[] {
  const reports: ReportEntry[] = [];

  // 1. Extract all REPORT titles from <h3> (stripping nested tags first).
  const titleRe = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const titles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html))) {
    const clean = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/^REPORT\b/i.test(clean)) titles.push(clean);
  }

  // 2. Strip HTML tags from the whole document and collapse whitespace,
  //    then parse the flat text for A-number + committee + date triples.
  //    This is resilient to <span>/<div> noise between the fields.
  const flat = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const idRe = /\b(A\d+-\d{4}\/\d{4})\s+(?:PE[\w.-]+\s+)?([A-Z]{3,6})\b/g;
  const metas: Array<{ reportId: string; committee: string; date: string | null }> = [];
  let mm: RegExpExecArray | null;
  while ((mm = idRe.exec(flat))) {
    // Find the nearest DD-MM-YYYY within a ±500 char window around the
    // A-number. Dates can appear before or after depending on the card
    // layout (ordering varies by EP page template).
    const windowStart = Math.max(0, mm.index - 500);
    const windowEnd = Math.min(flat.length, mm.index + mm[0].length + 500);
    const window = flat.slice(windowStart, windowEnd);
    const dateMatch = window.match(/(\d{2})-(\d{2})-(\d{4})/);
    metas.push({
      reportId: mm[1],
      committee: mm[2],
      date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
    });
  }

  // Zip titles and metas positionally — the page lists them in order.
  const n = Math.max(titles.length, metas.length);
  for (let i = 0; i < n; i++) {
    const meta = metas[i];
    reports.push({
      title: titles[i] ?? (meta?.reportId ?? "Report"),
      reportId: meta?.reportId ?? null,
      committee: meta?.committee ?? null,
      date: meta?.date ?? null,
    });
  }

  return reports;
}

async function fetchReportsPage(externalId: string, name: string): Promise<string | null> {
  const slug = slugifyMepName(name);
  const url = `https://www.europarl.europa.eu/meps/en/${externalId}/${slug}/main-activities/reports`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PoliticalTracker/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let batchSize = 30;
  let politicianIds: string[] | null = null;
  let parentRunId: string | null = null;
  try {
    const body = await req.json();
    batchSize = Math.min(body.batchSize || 30, 200);
    politicianIds = Array.isArray(body.politicianIds) && body.politicianIds.length > 0
      ? body.politicianIds
      : null;
    parentRunId = body.parentRunId || null;
  } catch { /* defaults */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "parliamentary_record", status: "running", parent_run_id: parentRunId })
    .select()
    .single();
  const runId = run?.id;

  try {
    let query = supabase
      .from("politicians")
      .select("id, name, external_id")
      .eq("data_source", "eu_parliament")
      .not("external_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(batchSize);
    if (politicianIds) query = query.in("id", politicianIds);

    const { data, error } = await query;
    if (error) throw error;
    const meps = (data || []) as MepRow[];

    let eventsWritten = 0;
    let processed = 0;
    // Wall-clock cutoff so we never hit the edge function WORKER_LIMIT.
    const deadline = Date.now() + 90_000;

    for (const mep of meps) {
      if (Date.now() > deadline) break;
      processed++;
      const html = await fetchReportsPage(mep.external_id, mep.name);
      await new Promise((r) => setTimeout(r, 150));
      if (!html) continue;

      const reports = parseReports(html);
      if (reports.length === 0) continue;

      const rows = reports.map((r) => {
        const source_url = r.reportId
          ? `https://www.europarl.europa.eu/doceo/document/${r.reportId}_EN.html`
          : `https://www.europarl.europa.eu/meps/en/${mep.external_id}/main-activities/reports`;
        return {
          politician_id: mep.id,
          event_type: "legislation_sponsored" as const,
          title: r.reportId ? `${r.reportId}: ${r.title.substring(0, 180)}` : r.title.substring(0, 220),
          description: [
            r.committee ? `Committee: ${r.committee}` : null,
            r.reportId ? `Report ID: ${r.reportId}` : null,
            "Rapporteur attribution from EP main-activities page.",
          ].filter(Boolean).join(" · "),
          source: "parliamentary_record" as const,
          source_url,
          event_timestamp: r.date ? `${r.date}T00:00:00Z` : new Date().toISOString(),
          raw_data: { reportId: r.reportId, committee: r.committee, date: r.date },
          evidence_count: 1,
          trust_level: 1,
          entities: r.committee ? [`#${r.committee}`] : [],
        };
      });

      if (rows.length > 0) {
        const { data: ins } = await supabase
          .from("political_events")
          .upsert(rows, { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true })
          .select("id");
        eventsWritten += ins?.length ?? 0;
      }
    }

    const hasMore = processed < meps.length;

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: meps.length,
        records_created: eventsWritten,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({ success: true, scanned: meps.length, processed, events: eventsWritten, has_more: hasMore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("mep-reports scrape error:", error);
    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "failed",
        error_message: serializeError(error),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(
      JSON.stringify({ success: false, error: serializeError(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
