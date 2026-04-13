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

const WIKI_API = "https://en.wikipedia.org/api/rest_v1";
const WIKI_ACTION = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "PoliticalTracker/1.0 (https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track)";

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

  const infobox: Record<string, string> = {};
  const fields = [
    "birth_date", "birth_place", "alma_mater", "spouse", "children",
    "occupation", "party", "office", "term_start", "term_end",
    "predecessor", "successor", "nationality", "religion",
    "twitter", "twitter_handle", "website", "committees",
  ];

  for (const field of fields) {
    const regex = new RegExp(`\\|\\s*${field}\\s*=\\s*(.+?)(?:\\n|\\|)`, "i");
    const match = content.match(regex);
    if (match) {
      let val = match[1].trim();
      val = val.replace(/\[\[([^\]|]*?\|)?([^\]]*?)\]\]/g, "$2");
      val = val.replace(/\{\{[^}]*\}\}/g, "").trim();
      if (val) infobox[field] = val;
    }
  }

  return Object.keys(infobox).length > 0 ? infobox : null;
}

function parseTwitterHandle(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/@?([A-Za-z0-9_]{2,15})/);
  if (!match) return null;
  const handle = match[1];
  if (handle.toLowerCase() === "twitter" || handle.toLowerCase() === "x") return null;
  return handle;
}

function parseInOfficeSince(raw: string | undefined): string | null {
  if (!raw) return null;
  const ymd = raw.match(/(\d{4})[-/\s|](\d{1,2})[-/\s|](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const yearOnly = raw.match(/\b(\d{4})\b/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;
  return null;
}

function parseCommittees(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;*\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 80);
}

function parsePartyName(raw: string | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/{{[^{}]*}}/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\[/g, "")
    .replace(/\]\]/g, "")
    .replace(/''+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const primary = cleaned
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .split("|")[0]
    .split(/\s*,\s*|\s*;\s*|\s+•\s+|\s+·\s+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 2);

  return primary || null;
}

interface EnrichTarget {
  id: string;
  name: string;
  country_name: string;
  country_code: string;
  party_name?: string;
  photo_url?: string | null;
  biography?: string | null;
  birth_year?: number | null;
  in_office_since?: string | null;
  twitter_handle?: string | null;
  committees?: string[] | null;
  external_id?: string | null;
  source_url?: string | null;
  wikipedia_url?: string | null;
  wikipedia_summary?: string | null;
  wikipedia_image_url?: string | null;
  wikipedia_data?: Record<string, unknown> | null;
}

function extractWikipediaTitleFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || !rawUrl.includes("wikipedia.org/wiki/")) return null;

  try {
    const parsed = new URL(rawUrl);
    const marker = "/wiki/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    const encodedTitle = parsed.pathname.slice(index + marker.length);
    if (!encodedTitle) return null;
    return decodeURIComponent(encodedTitle);
  } catch {
    return null;
  }
}

// P2.2: Disambiguation guardrail. Before accepting a candidate page,
// check three things:
//   1. The candidate title contains at least one token from the
//      politician's name (rules out list pages, category pages, and
//      unrelated articles that just happen to match category filters).
//   2. Categories mark this as a politician (not "Presidency of X",
//      "Family of X", "Political positions of X", etc.).
//   3. Categories tie the person to the right country or an EU-level role.
function candidateMatchesPolitician(
  candidateTitle: string,
  categories: string[],
  politician: EnrichTarget,
): boolean {
  const lowerCats = categories.map((c) => c.toLowerCase());
  const country = politician.country_name.toLowerCase();

  // Reject disambiguation / list pages outright.
  if (/\bdisambig/i.test(candidateTitle)) return false;
  if (/^list of|^lists of/i.test(candidateTitle)) return false;
  if (lowerCats.some((c) => c.includes("disambiguation pages"))) return false;

  // Title must share at least one non-trivial token with the politician.
  // We fold to ASCII and require a token of length ≥4 to appear in the title.
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const titleFolded = fold(candidateTitle);
  const nameTokens = fold(politician.name)
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (nameTokens.length > 0 && !nameTokens.some((t) => titleFolded.includes(t))) {
    return false;
  }

  // Must look like a politician.
  const politicianMarker = lowerCats.some(
    (c) =>
      c.includes("politician") ||
      c.includes("members of") ||
      c.includes("mps") ||
      c.includes("ministers") ||
      c.includes("senators") ||
      c.includes("deputies") ||
      c.includes("meps"),
  );
  if (!politicianMarker) return false;

  // Must look like the right country (or an EU-level role).
  const countryMatch = lowerCats.some(
    (c) =>
      c.includes(country) ||
      c.includes("european parliament") ||
      c.includes("european union"),
  );
  return countryMatch;
}

async function enrichPolitician(
  supabase: any,
  politician: EnrichTarget,
): Promise<boolean> {
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
      return false;
    }

    // Try candidates in order; first one that passes the guardrail wins.
    for (const c of candidates) {
      const meta = await getPageMetadata(c.title);
      if (!meta.summary) continue;
      if (candidateMatchesPolitician(c.title, meta.categories, politician)) {
        chosen = { title: c.title, meta };
        break;
      }
    }
  }

  if (!chosen) {
    console.log(`No candidate passed disambiguation for: ${politician.name}`);
    return false;
  }

  const { title: wikiTitle, meta } = chosen;
  const summary = meta.summary!;

  const [fullExtract, infobox] = await Promise.all([
    getWikiExtract(wikiTitle),
    getWikiInfobox(wikiTitle),
  ]);

  const wikiUrl = summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
  const wikiImage = summary.originalimage?.source || summary.thumbnail?.source || null;

  const updateData: Record<string, any> = {
    wikipedia_url: wikiUrl,
    wikipedia_summary: summary.extract || politician.wikipedia_summary || null,
    biography: fullExtract || summary.extract || politician.biography || null,
    wikipedia_image_url: wikiImage || politician.wikipedia_image_url || null,
    wikipedia_data: {
      ...(typeof politician.wikipedia_data === "object" && politician.wikipedia_data ? politician.wikipedia_data : {}),
      title: wikiTitle,
      description: summary.description || null,
      infobox: infobox || null,
      coordinates: summary.coordinates || null,
      categories: meta.categories,
      wikidata_id: meta.wikidataId,
      last_fetched: new Date().toISOString(),
    },
    enriched_at: new Date().toISOString(),
  };

  // P1.5: store Wikidata ID as external_id for stable cross-source joins.
  // Don't clobber an existing external_id (e.g. an MEP numeric id set by
  // scrape-eu-parliament).
  if (meta.wikidataId && !politician.external_id) {
    updateData.external_id = meta.wikidataId;
  }

  if (wikiImage && !politician.photo_url) {
    updateData.photo_url = wikiImage;
  }

  if (!politician.birth_year && infobox?.birth_date) {
    const yearMatch = infobox.birth_date.match(/(\d{4})/);
    if (yearMatch) updateData.birth_year = parseInt(yearMatch[1]);
  }

  if (!politician.twitter_handle) {
    const handle = parseTwitterHandle(infobox?.twitter_handle || infobox?.twitter);
    if (handle) updateData.twitter_handle = handle;
  }

  if (!politician.in_office_since && infobox?.term_start) {
    const parsed = parseInOfficeSince(infobox.term_start);
    if (parsed) updateData.in_office_since = parsed;
  }

  if (!politician.party_name && infobox?.party) {
    const partyName = parsePartyName(infobox.party);
    if (partyName) updateData.party_name = partyName;
  }

  if ((!politician.committees || politician.committees.length === 0) && infobox?.committees) {
    const committees = parseCommittees(infobox.committees);
    if (committees.length > 0) updateData.committees = committees;
  }

  const { error } = await supabase
    .from("politicians")
    .update(updateData)
    .eq("id", politician.id);

  if (error) {
    console.error(`Failed to update ${politician.name}:`, error.message);
    return false;
  }

  console.log(`Enriched: ${politician.name} → ${wikiTitle} (${meta.wikidataId ?? "no wikidata"})`);
  return true;
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
      const { data } = await supabase
        .from("politicians")
        .select(selectCols)
        .is("enriched_at", null)
        .order("role", { ascending: true })
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
    let processed = 0;
    // Wall-clock cutoff so we never hit the edge function WORKER_LIMIT.
    const deadline = Date.now() + 90_000;

    for (const pol of politicians) {
      if (Date.now() > deadline) break;
      processed++;
      const success = await enrichPolitician(supabase, pol);
      if (success) enriched++;
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
        error_message: failed > 0 ? `${failed} enrichment failures` : null,
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
