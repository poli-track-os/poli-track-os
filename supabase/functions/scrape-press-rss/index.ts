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

/**
 * Scrapes publicly available politician social media data from free sources.
 * Uses RSS feeds and public web pages — no API keys required.
 * Falls back to enriching existing data with public statement archives.
 */

// Known public RSS/Atom feeds for EU politician communications
const PUBLIC_FEEDS: Record<string, string> = {
  "European Commission": "https://ec.europa.eu/commission/presscorner/api/files/RSS",
  "European Parliament": "https://www.europarl.europa.eu/rss/doc/top-stories/en.xml",
};

// Public statement sources we can scrape without authentication
const PUBLIC_SOURCES = [
  {
    name: "EU Council Press",
    url: "https://www.consilium.europa.eu/en/press/press-releases/",
    type: "official_record" as const,
  },
  {
    name: "EP Press Releases",
    url: "https://www.europarl.europa.eu/news/en/press-room",
    type: "official_record" as const,
  },
];

// P2.3: sentiment analyzer removed. A 37-word substring lexicon with no
// negation handling produced misleading labels for the UI; recording no
// signal is better than recording a bad one. Sentiment fields on events
// written by this function are now always null.

function extractEntities(text: string): string[] {
  const entities: string[] = [];
  const hashtags = text.match(/#\w+/g);
  if (hashtags) entities.push(...hashtags.slice(0, 5));
  const mentions = text.match(/@\w+/g);
  if (mentions) entities.push(...mentions.slice(0, 5));
  return entities;
}

async function fetchRSSFeed(url: string): Promise<any[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PoliticalTracker/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    // Simple XML parsing for RSS items
    const items: any[] = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const itemXml of itemMatches.slice(0, 20)) {
      const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || "";
      const description = itemXml.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1] || "";
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";

      if (title) {
        items.push({ title: title.trim(), description: description.trim(), link: link.trim(), pubDate: pubDate.trim() });
      }
    }
    return items;
  } catch (e) {
    console.error(`Failed to fetch RSS feed ${url}:`, e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "twitter", status: "running" })
    .select()
    .single();

  const runId = run?.id;
  let totalFetched = 0;
  let eventsCreated = 0;

  try {
    // Fetch politicians to match against
    const { data: politicians } = await supabase
      .from("politicians")
      .select("id, name, country_name");

    if (!politicians || politicians.length === 0) {
      throw new Error("No politicians found in database");
    }

    // Strict matching: only match on the politician's full name (folded to
    // ASCII + lowercase) as a whole word. Surname-only matching produced
    // false positives ("Costa" ↔ "cost", first-match-wins attribution).
    const foldText = (s: string): string =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    interface Candidate {
      id: string;
      pattern: RegExp;
    }

    const candidates: Candidate[] = politicians
      .map((p) => {
        const folded = foldText(p.name).trim();
        if (folded.length < 5 || !folded.includes(" ")) return null; // require at least first+last
        return {
          id: p.id,
          pattern: new RegExp(`(?:^|[^\\p{L}])${escapeRegex(folded)}(?:[^\\p{L}]|$)`, "u"),
        };
      })
      .filter((c): c is Candidate => c !== null);

    console.log(`Loaded ${politicians.length} politicians (${candidates.length} eligible for full-name matching)`);

    // Scrape public RSS feeds
    for (const [feedName, feedUrl] of Object.entries(PUBLIC_FEEDS)) {
      console.log(`Fetching RSS feed: ${feedName}`);
      const items = await fetchRSSFeed(feedUrl);
      totalFetched += items.length;
      console.log(`Got ${items.length} items from ${feedName}`);

      for (const item of items) {
        const haystack = foldText(`${item.title} ${item.description}`);
        const matched = candidates.filter((c) => c.pattern.test(haystack));
        if (matched.length === 0) continue;

        const entities = extractEntities(item.title + " " + item.description);
        // Stable timestamp policy: when the RSS item has no <pubDate>,
        // fall back to the Unix epoch sentinel rather than wall-clock.
        // Wall-clock fallback would create a fresh row on every cron
        // invocation because the partial unique index
        // `(politician_id, source_url, event_timestamp)` would never
        // match the previous run's timestamp.
        const STABLE_UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00Z";
        let eventTimestamp = STABLE_UNKNOWN_TIMESTAMP;
        if (item.pubDate) {
          const parsed = new Date(item.pubDate);
          if (!Number.isNaN(parsed.getTime())) {
            eventTimestamp = parsed.toISOString();
          }
        }
        const title = `${feedName}: "${item.title.substring(0, 80)}${item.title.length > 80 ? "..." : ""}"`;

        // Attribute to every matched politician. P0.3's partial unique
        // index on (politician_id, source_url, event_timestamp) makes
        // reruns idempotent — rely on ON CONFLICT DO NOTHING via upsert.
        const rows = matched.map((c) => ({
          politician_id: c.id,
          event_type: "public_statement" as const,
          title,
          description: item.description || item.title,
          source: "news" as const,
          source_url: item.link,
          // P2.3: no more heuristic sentiment. Trust level 3 = derived / heuristic.
          sentiment: null,
          entities: entities.slice(0, 10),
          evidence_count: 1,
          event_timestamp: eventTimestamp,
          trust_level: 3,
        }));

        if (rows.length === 0) continue;
        // Surface errors instead of swallowing them with `if (!error)`.
        // A constraint target mismatch, RLS rejection, or enum error
        // would previously report "0 events created" with a green status.
        const { data: inserted, error: upsertErr } = await supabase
          .from("political_events")
          .upsert(rows, { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true })
          .select("id");
        if (upsertErr) {
          console.error(`political_events upsert failed: ${upsertErr.message}`);
          throw upsertErr;
        }
        eventsCreated += (inserted?.length ?? 0);
      }
    }

    // Update run status
    await supabase.from("scrape_runs").update({
      status: "completed",
      records_fetched: totalFetched,
      records_created: eventsCreated,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    // P2.5: cumulative counter via RPC. The previous code overwrote
    // data_sources.total_records with this single run's item count,
    // obliterating cumulative history every cron invocation.
    await supabase.rpc("increment_total_records", {
      p_source_type: "twitter",
      p_delta: eventsCreated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        items_fetched: totalFetched,
        events_created: eventsCreated,
        message: "Scraped public RSS feeds and matched to politicians. No API keys required.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Public scrape error:", error);
    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "failed",
        error_message: serializeError(error),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({ success: false, error: serializeError(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
