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

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";

// CELEX sector 3 = secondary legislation. The letter after the 4-digit year
// encodes the type of act:
//   L = directive, R = regulation, D = decision, H = recommendation,
//   X = other, C = non-legislative.
// We only want the first four here; the rest are not parliamentary proposals
// in the sense the proposals table models.
const CELEX_TYPE_TO_PROPOSAL_TYPE: Record<string, { type: string; label: string }> = {
  L: { type: "directive", label: "Directive" },
  R: { type: "regulation", label: "Regulation" },
  D: { type: "decision", label: "Decision" },
  H: { type: "recommendation", label: "Recommendation" },
};

// Heuristic policy-area detection from title keywords. Mirrors the labels
// already rendered in the UI (`src/hooks/use-proposals.ts` policy_area).
const POLICY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(energy|electricity|gas|renewable|nuclear|emission|climate|CO2|carbon)\b/i, "energy"],
  [/\b(health|medicine|pharmac|vaccine|hospital|COVID|disease)\b/i, "health"],
  [/\b(asylum|migration|border|immigration|refugee)\b/i, "migration"],
  [/\b(defence|military|armament|NATO|security)\b/i, "defence"],
  [/\b(data|privacy|GDPR|cyber|digital|online|platform|AI|artificial intelligence)\b/i, "digital"],
  [/\b(agricul|CAP|farm|food|fishery|fisheries)\b/i, "agriculture"],
  [/\b(trade|tariff|customs|import|export|anti-dumping)\b/i, "trade"],
  [/\b(bank|financial|monetary|euro|tax|VAT)\b/i, "finance"],
  [/\b(transport|aviation|rail|shipping|road)\b/i, "transport"],
  [/\b(environment|biodiversity|pollution|waste|water|nature)\b/i, "environment"],
  [/\b(employment|labour|labor|worker|pension|social security)\b/i, "labour"],
  [/\b(justice|court|criminal|judicial|law enforcement|prosecution)\b/i, "justice"],
];

function detectPolicyArea(title: string): string | null {
  for (const [regex, area] of POLICY_KEYWORDS) {
    if (regex.test(title)) return area;
  }
  return null;
}

interface SparqlBinding {
  work: { value: string };
  celex: { value: string };
  title: { value: string };
  date: { value: string };
}

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

async function queryRecentLegislation(sinceDate: string, limit: number): Promise<SparqlBinding[]> {
  // Bind explicit language URI instead of relying on BIND/FILTER regex on
  // language tags; SPARQL implementations vary on string-filter semantics.
  const query = `
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX lang: <http://publications.europa.eu/resource/authority/language/>
SELECT ?work ?celex ?title ?date WHERE {
  ?work cdm:resource_legal_id_celex ?celex ;
        cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work ;
        cdm:expression_uses_language lang:ENG ;
        cdm:expression_title ?title .
  FILTER(?date > "${sinceDate}"^^xsd:date)
  FILTER(regex(str(?celex), "^3[0-9]{4}[LRDH]"))
}
ORDER BY DESC(?date)
LIMIT ${limit}
`;

  const body = new URLSearchParams({ query });
  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "PoliticalTracker/1.0",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`EUR-Lex SPARQL ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as SparqlResponse;
  return json?.results?.bindings ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let sinceDate = "2025-01-01";
  let limit = 200;
  try {
    const body = await req.json();
    if (typeof body.sinceDate === "string") sinceDate = body.sinceDate;
    if (typeof body.limit === "number") limit = Math.min(Math.max(body.limit, 1), 500);
  } catch { /* defaults */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "official_record", status: "running" })
    .select()
    .single();
  const runId = run?.id;

  try {
    const bindings = await queryRecentLegislation(sinceDate, limit);
    console.log(`EUR-Lex returned ${bindings.length} works since ${sinceDate}`);

    const rows = bindings.map((b) => {
      const celex = b.celex.value;
      const typeLetter = celex.charAt(5); // e.g. 32025L0123 → 'L'
      const typeInfo = CELEX_TYPE_TO_PROPOSAL_TYPE[typeLetter] ?? {
        type: "bill",
        label: "Act",
      };
      const title = b.title.value.trim();
      return {
        title: title.substring(0, 500),
        official_title: title,
        status: "adopted",
        proposal_type: typeInfo.type,
        jurisdiction: "eu",
        country_code: "EU",
        country_name: "European Union",
        vote_date: b.date.value,
        submitted_date: b.date.value,
        sponsors: [],
        affected_laws: [],
        evidence_count: 1,
        summary: title,
        policy_area: detectPolicyArea(title),
        source_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`,
      };
    });

    // Dedupe locally on source_url (CELEX-based, one URL per act)
    const seen = new Set<string>();
    const uniqueRows = rows.filter((r) => {
      if (seen.has(r.source_url)) return false;
      seen.add(r.source_url);
      return true;
    });

    // Upsert on source_url. proposals has no unique index yet, so rely on
    // a manual existence check to split create vs update.
    const { data: existing } = await supabase
      .from("proposals")
      .select("id, source_url")
      .in("source_url", uniqueRows.map((r) => r.source_url));
    const existingByUrl = new Map<string, string>();
    for (const row of existing || []) {
      if (row.source_url) existingByUrl.set(row.source_url, row.id);
    }

    const toInsert = uniqueRows.filter((r) => !existingByUrl.has(r.source_url));
    const toUpdate = uniqueRows.filter((r) => existingByUrl.has(r.source_url));

    let created = 0;
    let updated = 0;

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error, data } = await supabase.from("proposals").insert(chunk).select("id");
        if (error) throw error;
        created += data?.length ?? 0;
      }
    }

    for (const row of toUpdate) {
      const id = existingByUrl.get(row.source_url);
      if (!id) continue;
      const { error } = await supabase.from("proposals").update(row).eq("id", id);
      if (!error) updated++;
    }

    await supabase.from("scrape_runs").update({
      status: "completed",
      records_fetched: bindings.length,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    await supabase.rpc("increment_total_records", {
      p_source_type: "official_record",
      p_delta: created,
    });

    return new Response(
      JSON.stringify({
        success: true,
        fetched: bindings.length,
        created,
        updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("EUR-Lex scrape error:", error);
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
