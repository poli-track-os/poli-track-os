// Pure helpers for seed-associations. No Supabase or third-party imports
// so the same module loads under Deno (the edge runtime) and Node (vitest).

export interface Politician {
  id: string;
  country_code: string;
  data_source: string | null;
  jurisdiction: string | null;
  party_abbreviation: string | null;
  party_name: string | null;
  committees: string[] | null;
}

// Country-aware committee key. EP committees ARE genuinely shared across
// MEPs from different countries (that's the whole point of the European
// Parliament), so a global key is correct for them. National committees
// (Bundestag Auswärtiger Ausschuss, UK Foreign Affairs Committee) just
// happen to translate to similar English strings — pairing those would
// be semantic nonsense. Scope national committees by country_code to
// prevent cross-country false pairs.
export function committeeKeyFor(p: Politician, committee: string): string {
  const cm = committee.toLowerCase().trim();
  const isEpMember =
    p.data_source === "eu_parliament" || p.jurisdiction === "eu";
  return isEpMember ? `eu|${cm}` : `${p.country_code}|${cm}`;
}
