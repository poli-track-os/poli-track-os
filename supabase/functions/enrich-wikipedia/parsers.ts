// Pure parsers for Wikipedia infobox extraction. Kept third-party-free so
// the same module loads under Deno (the edge runtime) and Node (vitest).
//
// The earlier regex `\|\s*${field}\s*=\s*(.+?)(?:\n|\|)` truncated values
// at the FIRST pipe inside the value — which is wrong for almost every real
// infobox field, because templates like `{{birth date|1960|5|12}}` and
// piped wiki links `[[Labour Party (UK)|Labour]]` constantly contain pipes.
// The fixed version captures everything until the next line that begins
// with `|` or until the closing `}}` of the infobox.

const INFOBOX_FIELDS = [
  "birth_date", "birth_place", "alma_mater", "spouse", "children",
  "occupation", "party", "office", "term_start", "term_end",
  "predecessor", "successor", "nationality", "religion",
  "twitter", "twitter_handle", "website", "committees",
];

// Line-based infobox parser. Walks the source line by line, recognizing
// "| field = value" lines and skipping non-field content. When a value
// opens a `{{template}}` or `[[link]]` without closing on the same line,
// continues slurping subsequent lines until the brackets balance — but
// stops if a new "| field =" line appears, which means the source was
// malformed and we'd otherwise capture the next field's value.
//
// This replaces an earlier regex-per-field approach that had two bugs:
//   1. `(.+?)(?:\n|\|)` truncated values containing pipes ([[Foo|Bar]]).
//   2. After the first fix, the post-`=` whitespace allowance `\s*`
//      consumed trailing newlines of EMPTY fields and captured the next
//      field's value into the empty field.
export function parseInfobox(content: string): Record<string, string> | null {
  const infobox: Record<string, string> = {};
  const allowed = new Set(INFOBOX_FIELDS.map((f) => f.toLowerCase()));
  const lines = content.split('\n');

  const countBraces = (s: string): { open: number; close: number } => {
    let open = 0;
    let close = 0;
    for (const ch of s) {
      if (ch === '{') open++;
      else if (ch === '}') close++;
    }
    return { open, close };
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fieldMatch = line.match(/^[ \t]*\|[ \t]*([A-Za-z0-9_]+)[ \t]*=(.*)$/);
    if (!fieldMatch) { i += 1; continue; }
    const fieldName = fieldMatch[1].toLowerCase();
    if (!allowed.has(fieldName)) { i += 1; continue; }
    let value = fieldMatch[2].trim();

    // If this line opens braces without closing them, keep slurping
    // until balanced — but bail if we hit another "| field =" line.
    let { open, close } = countBraces(value);
    while (open > close && i + 1 < lines.length) {
      const next = lines[i + 1];
      // If the next line is itself a field declaration, the source was
      // malformed; stop slurping so we don't bleed into another field.
      if (/^[ \t]*\|[ \t]*[A-Za-z0-9_]+[ \t]*=/.test(next)) break;
      value += ' ' + next.trim();
      const counts = countBraces(next);
      open += counts.open;
      close += counts.close;
      i += 1;
    }

    value = value.trim();
    if (value.length > 0) infobox[fieldName] = value;
    i += 1;
  }

  return Object.keys(infobox).length > 0 ? infobox : null;
}

export function parseBirthYear(raw: string | undefined): number | null {
  if (!raw) return null;
  // {{birth date|YYYY|MM|DD}} → first 4-digit token; also handles "1960"
  // and "born 12 May 1960" style values.
  const match = raw.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return year >= 1700 && year <= 2100 ? year : null;
}

export function parseTwitterHandle(raw: string | undefined): string | null {
  if (!raw) return null;
  // Strip wiki markup before pulling the handle.
  const cleaned = raw
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/<[^>]+>/g, " ");
  const match = cleaned.match(/@?([A-Za-z0-9_]{2,15})/);
  if (!match) return null;
  const handle = match[1];
  if (handle.toLowerCase() === "twitter" || handle.toLowerCase() === "x") return null;
  return handle;
}

export function parseInOfficeSince(raw: string | undefined): string | null {
  if (!raw) return null;
  // {{start date|YYYY|MM|DD}} → use the pipe-separated year/month/day.
  // `[-/\s|]` handles ISO, slashed, and template forms.
  const ymd = raw.match(/(\d{4})[-/\s|](\d{1,2})[-/\s|](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const yearOnly = raw.match(/\b(\d{4})\b/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;
  return null;
}

export function parseCommittees(raw: string | undefined): string[] {
  if (!raw) return [];
  const cleaned = raw
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/<[^>]+>/g, " ");
  return cleaned
    .split(/[,;*\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 80);
}

export function parsePartyName(raw: string | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/\{\{[^{}]*\}\}/g, " ")
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

export function extractWikipediaTitleFromUrl(rawUrl: string | null | undefined): string | null {
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

// P2.2 disambiguation guardrail. Pure: takes a candidate title + categories
// + the politician we're trying to enrich, returns true if the candidate
// passes basic safety checks.
export function candidateMatchesPolitician(
  candidateTitle: string,
  categories: string[],
  politicianName: string,
  countryName: string,
): boolean {
  const lowerCats = categories.map((c) => c.toLowerCase());
  const country = countryName.toLowerCase();

  if (/\bdisambig/i.test(candidateTitle)) return false;
  if (/^list of|^lists of/i.test(candidateTitle)) return false;
  if (lowerCats.some((c) => c.includes("disambiguation pages"))) return false;

  const fold = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const titleFolded = fold(candidateTitle);
  const nameTokens = fold(politicianName)
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (nameTokens.length > 0 && !nameTokens.some((t) => titleFolded.includes(t))) {
    return false;
  }

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

  const countryMatch = lowerCats.some(
    (c) =>
      c.includes(country) ||
      c.includes("european parliament") ||
      c.includes("european union"),
  );
  return countryMatch;
}

// Build the update payload for `politicians` from the existing row + the
// freshly fetched Wikipedia data. Pure so we can test it end-to-end without
// a live Supabase client.
//
// CRITICAL: this function MUST NOT clobber values that were already set by
// a higher-trust source. The earlier version overwrote `wikipedia_url`,
// `biography`, and `wikipedia_summary` unconditionally — meaning a chained
// run from `scrape-eu-parliament` (which writes a curated EP MEP page URL)
// could be silently replaced by a worse Wikipedia disambiguation guess on a
// later enrichment pass. We now use the "existing wins" pattern for every
// optional field; only `wikipedia_data.last_fetched` updates each call.
export interface ExistingPoliticianForEnrichment {
  party_name?: string | null;
  photo_url?: string | null;
  biography?: string | null;
  birth_year?: number | null;
  in_office_since?: string | null;
  twitter_handle?: string | null;
  committees?: string[] | null;
  external_id?: string | null;
  wikipedia_url?: string | null;
  wikipedia_summary?: string | null;
  wikipedia_image_url?: string | null;
  wikipedia_data?: Record<string, unknown> | null;
}

export interface EnrichmentSourceData {
  wikiTitle: string;
  wikiUrl: string;
  wikiImage: string | null;
  summaryExtract: string | null;
  summaryDescription: string | null;
  fullExtract: string | null;
  infobox: Record<string, string> | null;
  categories: string[];
  wikidataId: string | null;
  coordinates: { lat: number; lon: number } | null;
}

export function buildEnrichmentUpdate(
  existing: ExistingPoliticianForEnrichment,
  source: EnrichmentSourceData,
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    // "Existing wins" — never replace a non-null value that was set by a
    // potentially higher-trust source.
    wikipedia_url: existing.wikipedia_url || source.wikiUrl,
    wikipedia_summary: existing.wikipedia_summary || source.summaryExtract || null,
    biography: existing.biography || source.fullExtract || source.summaryExtract || null,
    wikipedia_image_url: existing.wikipedia_image_url || source.wikiImage || null,
    wikipedia_data: {
      ...(existing.wikipedia_data && typeof existing.wikipedia_data === "object" ? existing.wikipedia_data : {}),
      title: source.wikiTitle,
      description: source.summaryDescription || null,
      infobox: source.infobox || null,
      coordinates: source.coordinates || null,
      categories: source.categories,
      wikidata_id: source.wikidataId,
      last_fetched: now,
    },
    enriched_at: now,
  };

  // Wikidata ID → external_id, only if not already set.
  if (source.wikidataId && !existing.external_id) {
    update.external_id = source.wikidataId;
  }

  if (source.wikiImage && !existing.photo_url) {
    update.photo_url = source.wikiImage;
  }

  if (!existing.birth_year && source.infobox?.birth_date) {
    const year = parseBirthYear(source.infobox.birth_date);
    if (year !== null) update.birth_year = year;
  }

  if (!existing.twitter_handle) {
    const handle = parseTwitterHandle(source.infobox?.twitter_handle || source.infobox?.twitter);
    if (handle) update.twitter_handle = handle;
  }

  if (!existing.in_office_since && source.infobox?.term_start) {
    const parsed = parseInOfficeSince(source.infobox.term_start);
    if (parsed) update.in_office_since = parsed;
  }

  if (!existing.party_name && source.infobox?.party) {
    const partyName = parsePartyName(source.infobox.party);
    if (partyName) update.party_name = partyName;
  }

  if ((!existing.committees || existing.committees.length === 0) && source.infobox?.committees) {
    const committees = parseCommittees(source.infobox.committees);
    if (committees.length > 0) update.committees = committees;
  }

  return update;
}
