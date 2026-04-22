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

// MEP financial and conflict-of-interest declarations.
//
// Source: https://www.europarl.europa.eu/meps/en/{external_id}/{SLUG}/declarations
//
// Each declaration is published as a PDF. Full PDF text extraction in a
// Deno edge function is fragile (deno-compatible PDF libraries are thin),
// so this pass records the DECLARATION METADATA: which documents exist,
// when they were filed, and where to find the authoritative source.
// That already unblocks the finance and investment UI boxes — every row
// carries a valid `source_url` straight to the MEP's own filing, which
// is the ground-truth anyone verifying a number needs to click on.
//
// Full per-number parsing (side income, property values, investments)
// remains a follow-up: see ROADMAP P1.2 / P1.3 details in INGESTION.md.

interface MepRow {
  id: string;
  name: string;
  external_id: string;
}

function slugifyMepName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z\s]/g, "").replace(/\s+/g, "_");
}

interface DeclarationRef {
  section: string;                 // heading, e.g. "Declaration of private interests"
  url: string;                     // absolute PDF URL
  date: string | null;             // ISO date extracted from the filename or surrounding HTML
  kind: "DPI" | "DAT" | "DCI" | "DAB" | "CAH" | "other";
}

// Detect the document kind from its URL. The EP uses stable short codes:
//   DPI = Declaration of Private Interests
//   DAT = Declaration of Attendance / events
//   DCI = Declaration on conflicts of interest
//   DAB = Declaration on appropriate behaviour
//   CAH = Code of conduct / conflict attestation
function kindFromUrl(url: string): DeclarationRef["kind"] {
  if (/\/DPI\//i.test(url)) return "DPI";
  if (/\/DAT\//i.test(url) || /\bDAT-/i.test(url)) return "DAT";
  if (/\/DCI-|\bDCI\b/i.test(url)) return "DCI";
  if (/\/DAB\//i.test(url)) return "DAB";
  if (/\/CAH\b|\/CAH-/i.test(url)) return "CAH";
  return "other";
}

// DCI filenames embed the filing date: DCI-<mep_id>-YYYY-MM-DD-...
function dateFromUrl(url: string): string | null {
  const m = url.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function fetchDeclarationsPage(externalId: string, name: string): Promise<string | null> {
  const slug = slugifyMepName(name);
  const url = `https://www.europarl.europa.eu/meps/en/${externalId}/${slug}/declarations`;
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

// Parse the HTML into declaration references grouped by section heading.
// We split on <h3>/<h4> tags and collect PDFs inside each block.
function parseDeclarations(html: string): DeclarationRef[] {
  const out: DeclarationRef[] = [];
  const blockRe = /<h[34][^>]*>([^<]+)<\/h[34]>([\s\S]*?)(?=<h[34]|<\/main>|$)/g;

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html))) {
    const heading = match[1].replace(/\s+/g, " ").trim();
    const body = match[2];
    const pdfMatches = body.match(/href="(https?:\/\/[^"]+?\.pdf)"/gi) ?? [];
    for (const m of pdfMatches) {
      const url = m.slice(6, -1); // strip href=" and trailing "
      out.push({
        section: heading,
        url,
        date: dateFromUrl(url),
        kind: kindFromUrl(url),
      });
    }
  }
  return out;
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
    .insert({ source_type: "financial_filing", status: "running", parent_run_id: parentRunId })
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

    let financeRowsWritten = 0;
    let investmentRowsWritten = 0;
    let eventsWritten = 0;
    let processed = 0;
    const deadline = Date.now() + 90_000;

    for (const mep of meps) {
      if (Date.now() > deadline) break;
      processed++;
      const html = await fetchDeclarationsPage(mep.external_id, mep.name);
      await new Promise((r) => setTimeout(r, 150));
      if (!html) continue;

      const declarations = parseDeclarations(html);
      if (declarations.length === 0) continue;

      // 1. politician_finances row per year observed in DPI / DCI filings.
      //    We don't parse numbers from the PDF yet, so the row is
      //    intentionally sparse: year + source_url + currency default.
      const dpiFilings = declarations.filter((d) => d.kind === "DPI");
      const yearsSeen = new Set<number>();
      for (const d of dpiFilings) {
        const year = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear();
        if (yearsSeen.has(year)) continue;
        yearsSeen.add(year);

        const { error: fErr } = await supabase
          .from("politician_finances")
          .upsert(
            {
              politician_id: mep.id,
              declaration_year: year,
              currency: "EUR",
              salary_source: "European Parliament MEP salary",
              notes: `Source: ${d.url}`,
            },
            { onConflict: "politician_id,declaration_year" },
          );
        if (!fErr) financeRowsWritten++;
      }

      // 2. One row per declaration PDF as a financial_filing event, so
      //    the UI timeline shows when each document was filed.
      //
      //    When a PDF filename has no parseable date (DAB / CAH / certain
      //    DAT filings), use a STABLE epoch sentinel instead of
      //    `new Date().toISOString()`. The partial unique index on
      //    (politician_id, source_url, event_timestamp) only deduplicates
      //    if the timestamp is reproducible across runs — wall-clock
      //    fallback would create a fresh row on every cron invocation.
      const STABLE_UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00Z";
      const eventRows = declarations.map((d) => ({
        politician_id: mep.id,
        event_type: "financial_disclosure" as const,
        title: `${d.kind}: ${d.section.substring(0, 120)}`,
        description: `Published ${d.kind} filing. Authoritative source linked.`,
        source: "financial_filing" as const,
        source_url: d.url,
        event_timestamp: d.date ? `${d.date}T00:00:00Z` : STABLE_UNKNOWN_TIMESTAMP,
        raw_data: { kind: d.kind, section: d.section },
        evidence_count: 1,
        trust_level: 1,
      }));

      if (eventRows.length > 0) {
        // CRITICAL: check the error on the upsert. The previous version
        // only destructured `data` and silently ignored `error`, so an
        // upsert constraint target mismatch made the function report
        // "0 events written" with a green status.
        const { data: ins, error: upsertErr } = await supabase
          .from("political_events")
          .upsert(eventRows, { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true })
          .select("id");
        if (upsertErr) {
          console.error(`political_events upsert failed for mep ${mep.id}: ${upsertErr.message}`);
          throw upsertErr;
        }
        eventsWritten += ins?.length ?? 0;
      }

      // 3. Investments — without PDF text extraction we cannot enumerate
      //    individual shareholdings, so we leave politician_investments
      //    alone for now. The UI already handles an empty list.
      investmentRowsWritten += 0;

      // Advance the cursor: bump updated_at so this MEP rotates to the
      // back of the order-by-updated_at queue. Without this the scraper
      // would re-process the same first batch on every cron invocation.
      await supabase
        .from("politicians")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", mep.id);
    }

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: meps.length,
        records_created: financeRowsWritten + eventsWritten,
        records_updated: 0,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    await supabase.rpc("increment_total_records", {
      p_source_type: "financial_filing",
      p_delta: financeRowsWritten + eventsWritten,
    });

    const hasMore = processed < meps.length;

    return new Response(
      JSON.stringify({
        success: true,
        scanned: meps.length,
        processed,
        finance_rows: financeRowsWritten,
        investment_rows: investmentRowsWritten,
        events: eventsWritten,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("mep-declarations scrape error:", error);
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
