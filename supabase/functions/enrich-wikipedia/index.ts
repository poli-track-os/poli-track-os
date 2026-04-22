import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildEnrichmentUpdate,
  candidateMatchesPolitician,
  extractWikipediaTitleFromUrl,
  parseInfobox,
  type EnrichmentSourceData,
  type ExistingPoliticianForEnrichment,
} from "./parsers.ts";

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

const WIKI_API = "https://en.wikipedia.org/api/rest_v1";
const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "PoliticalTracker/1.0 (https://github.com/poli-track-os/poli-track-os)";

// P2.6: rate limiter + Retry-After respect.
// Wikipedia asks for <200 req/s; we hold ourselves to ~5 req/s with a
// per-request minimum delay plus adaptive back-off on 429s.
let nextAllowedAt = 0;

async function throttledFetch(url: string, opts: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    if (now < nextAllowedAt) {
      await new Promise((r) => setTimeout(r, nextAllowedAt - now));
    }
    nextAllowedAt = Date.now() + 200; // baseline 200ms between calls

    try {
      const res = await fetch(url, {
        ...opts,
        headers: { "User-Agent": USER_AGENT, ...(opts.headers || {}) },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (attempt + 1);
        nextAllowedAt = Date.now() + waitMs;
        console.log(`429 from Wikipedia, backing off ${waitMs}ms`);
        continue;
      }

      return res;
    } catch (e) {
      if (attempt === 2) {
        console.error(`Wikipedia fetch failed after 3 attempts: ${e}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

interface WikiSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string };
  content_urls?: { desktop?: { page?: string } };
  coordinates?: { lat: number; lon: number };
}

interface WikiSearchResult {
  title: string;
  snippet: string;
}

async function searchWikipediaCandidates(query: string): Promise<WikiSearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: "5",
    format: "json",
    origin: "*",
  });
  const res = await throttledFetch(`${WIKI_ACTION}?${params}`);
  if (!res || !res.ok) return [];
  const data = await res.json();
  const results = data?.query?.search ?? [];
  return results.map((r: any) => ({ title: r.title as string, snippet: (r.snippet as string) || "" }));
}

interface PageMetadata {
  summary: WikiSummary | null;
  wikidataId: string | null;
  categories: string[];
}

async function getPageMetadata(title: string): Promise<PageMetadata> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "pageprops|categories",
    cllimit: "30",
    clshow: "!hidden",
    format: "json",
    origin: "*",
  });
  const [propsRes, summaryRes] = await Promise.all([
    throttledFetch(`${WIKI_ACTION}?${params}`),
    throttledFetch(`${WIKI_API}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`),
  ]);

  let summary: WikiSummary | null = null;
  if (summaryRes && summaryRes.ok) summary = await summaryRes.json();

  let wikidataId: string | null = null;
  const categories: string[] = [];
  if (propsRes && propsRes.ok) {
    const data = await propsRes.json();
    const page = Object.values(data?.query?.pages || {})[0] as any;
    wikidataId = page?.pageprops?.wikibase_item ?? null;
    for (const c of page?.categories ?? []) {
      if (c?.title) categories.push(String(c.title).replace(/^Category:/, ""));
    }
  }

  return { summary, wikidataId, categories };
}

async function getWikiExtract(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts",
    exintro: "false",
    explaintext: "true",
    exlimit: "1",
    exsectionformat: "plain",
    exchars: "3000",
    format: "json",
    origin: "*",
  });
  const res = await throttledFetch(`${WIKI_ACTION}?${params}`);
  if (!res || !res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as any;
  return page?.extract || null;
}

async function getWikiInfobox(title: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    rvsection: "0",
    format: "json",
    origin: "*",
  });
  const res = await throttledFetch(`${WIKI_ACTION}?${params}`);
  if (!res || !res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as any;
  const content = page?.revisions?.[0]?.slots?.main?.["*"] || "";
  return parseInfobox(content);
}

interface EnrichTarget extends ExistingPoliticianForEnrichment {
  id: string;
  name: string;
  country_name: string;
  country_code: string;
  source_url?: string | null;
}

type EnrichResult = "enriched" | "no_match" | "failed";

async function enrichPolitician(
  supabase: any,
  politician: EnrichTarget,
): Promise<EnrichResult> {
  let chosen: { title: string; meta: PageMetadata } | null = null;

  const linkedTitle = extractWikipediaTitleFromUrl(politician.wikipedia_url || politician.source_url);
  if (linkedTitle) {
    const linkedMeta = await getPageMetadata(linkedTitle);
    if (linkedMeta.summary) {
      chosen = { title: linkedTitle, meta: linkedMeta };
    }
  }

  if (!chosen) {
    const query = `${politician.name} politician ${politician.country_name}`;
    const candidates = await searchWikipediaCandidates(query);
    if (candidates.length === 0) {
      console.log(`No candidates for: ${politician.name}`);
      return "no_match";
    }

    // Try candidates in order; first one that passes the guardrail wins.
    for (const c of candidates) {
      const meta = await getPageMetadata(c.title);
      if (!meta.summary) continue;
      if (candidateMatchesPolitician(c.title, meta.categories, politician.name, politician.country_name)) {
        chosen = { title: c.title, meta };
        break;
      }
    }
  }

  if (!chosen) {
    console.log(`No candidate passed disambiguation for: ${politician.name}`);
    return "no_match";
  }

  const { title: wikiTitle, meta } = chosen;
  const summary = meta.summary!;

  const [fullExtract, infobox] = await Promise.all([
    getWikiExtract(wikiTitle),
    getWikiInfobox(wikiTitle),
  ]);

  const sourceData: EnrichmentSourceData = {
    wikiTitle,
    wikiUrl: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`,
    wikiImage: summary.originalimage?.source || summary.thumbnail?.source || null,
    summaryExtract: summary.extract || null,
    summaryDescription: summary.description || null,
    fullExtract,
    infobox,
    categories: meta.categories,
    wikidataId: meta.wikidataId,
    coordinates: summary.coordinates || null,
  };

  const updateData = buildEnrichmentUpdate(politician, sourceData);

  const { error } = await supabase
    .from("politicians")
    .update(updateData)
    .eq("id", politician.id);

  if (error) {
    console.error(`Failed to update ${politician.name}:`, error.message);
    return "failed";
  }

  console.log(`Enriched: ${politician.name} → ${wikiTitle} (${meta.wikidataId ?? "no wikidata"})`);
  return "enriched";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Request body:
  //   { batchSize?: number }                          — process N unenriched rows
  //   { politicianId: string }                         — one specific row
  //   { politicianIds: string[], parentRunId?: uuid }  — explicit list (chained)
  let batchSize = 20;
  let politicianId: string | null = null;
  let politicianIds: string[] | null = null;
  let parentRunId: string | null = null;

  try {
    const body = await req.json();
    batchSize = Math.min(body.batchSize || 20, 50);
    politicianId = body.politicianId || null;
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
    .insert({
      source_type: "wikipedia",
      status: "running",
      parent_run_id: parentRunId,
    })
    .select()
    .single();
  const runId = run?.id;

  try {
    let politicians: EnrichTarget[];
    const selectCols = "id, name, country_name, country_code, party_name, photo_url, biography, birth_year, in_office_since, twitter_handle, committees, external_id, source_url, wikipedia_url, wikipedia_summary, wikipedia_image_url, wikipedia_data";

    if (politicianIds && politicianIds.length > 0) {
      const { data } = await supabase
        .from("politicians")
        .select(selectCols)
        .in("id", politicianIds);
      politicians = (data || []) as EnrichTarget[];
    } else if (politicianId) {
      const { data } = await supabase
        .from("politicians")
        .select(selectCols)
        .eq("id", politicianId)
        .single();
      politicians = data ? [data as EnrichTarget] : [];
    } else {
      // Automatic backlog mode should stick to higher-signal rows. Blind
      // search across the official-roster backlog creates repeated 0/N
      // runs and turns no-match cases into scrape_run failures.
      const { data } = await supabase
        .from("politicians")
        .select(selectCols)
        .is("enriched_at", null)
        .neq("data_source", "official_record")
        .order("created_at", { ascending: true })
        .limit(batchSize);
      politicians = (data || []) as EnrichTarget[];
    }

    if (politicians.length === 0) {
      if (runId) {
        await supabase.from("scrape_runs").update({
          status: "completed",
          records_fetched: 0,
          records_updated: 0,
          completed_at: new Date().toISOString(),
        }).eq("id", runId);
      }
      return new Response(
        JSON.stringify({ success: true, message: "No politicians to enrich", enriched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Enriching ${politicians.length} politicians with Wikipedia data...`);

    let enriched = 0;
    let failed = 0;
    let noMatch = 0;
    let processed = 0;
    // Wall-clock cutoff so we never hit the edge function WORKER_LIMIT.
    const deadline = Date.now() + 90_000;

    for (const pol of politicians) {
      if (Date.now() > deadline) break;
      processed++;
      const result = await enrichPolitician(supabase, pol);
      if (result === "enriched") enriched++;
      else if (result === "no_match") noMatch++;
      else failed++;
    }

    const { count } = await supabase
      .from("politicians")
      .select("id", { count: "exact", head: true })
      .is("enriched_at", null);

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: failed > 0 && enriched === 0 ? "failed" : "completed",
        records_fetched: politicians.length,
        records_updated: enriched,
        error_message: failed > 0
          ? `${failed} enrichment errors${noMatch > 0 ? `; ${noMatch} no-match skips` : ""}`
          : (noMatch > 0 ? `${noMatch} no-match skips` : null),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    await supabase.rpc("increment_total_records", {
      p_source_type: "wikipedia",
      p_delta: enriched,
    });

    return new Response(
      JSON.stringify({
        success: true,
        enriched,
        failed,
        no_match: noMatch,
        remaining: count || 0,
        message: `Enriched ${enriched}/${politicians.length} politicians. ${count || 0} remaining.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Wikipedia enrichment error:", error);
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
