/**
 * Pure helpers for ingesting Belgian Chamber legislative dossiers from the
 * official XML corpus.
 * No I/O, no Supabase.
 */

export interface LaChambreAuthor {
  AUTEURM_FAMNAAM?: string | null;
  AUTEURM_FORNAAM?: string | null;
  AUTEURM_PARTY?: string | null;
}

export interface LaChambreMainDoc {
  DEPOTDAT?: string | null;
  CONSID?: string | null;
  DISTRIBUTION_DATE?: string | null;
  ENVOI?: string | null;
  AUTEURM?: LaChambreAuthor | LaChambreAuthor[] | null;
}

export interface LaChambreDossier {
  ID?: string | null;
  TITLE?: {
    TITLE_LONG?: {
      TITLE_LONG_textF?: string | null;
      TITLE_LONG_textN?: string | null;
    } | null;
  } | null;
  SITU?: {
    SITUK_textF?: string | null;
    SITUK_textN?: string | null;
  } | null;
  LEG?: string | null;
  BICAM?: {
    MAINDOC?: LaChambreMainDoc | null;
  } | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energie|electri|gas|klima|climat|emission/i, 'energy'],
  [/sante|gezond|hopit|zieken|medic|vaccin/i, 'health'],
  [/migration|asile|migratie|asiel|grens|etranger|vreemdeling/i, 'migration'],
  [/defense|militaire|veiligheid|securite|leger/i, 'defence'],
  [/digital|numerique|digit|data|cyber|donnees|gegevens/i, 'digital'],
  [/agric|landbouw|foret|bos|peche|visserij|aliment/i, 'agriculture'],
  [/commerce|handel|douane|industrie|economie/i, 'trade'],
  [/budget|begroting|impot|belasting|taxe|finance|banque|bank/i, 'finance'],
  [/transport|vervoer|rail|spoor|route|weg|aviation|luchtvaart|port/i, 'transport'],
  [/environnement|milieu|dechet|afval|eau|water|nature/i, 'environment'],
  [/travail|werk|emploi|social|pension|pensioen|salaire|loon/i, 'labour'],
  [/justice|penal|straf|tribunal|rechtbank|police|gevangen/i, 'justice'],
  [/education|onderwijs|ecole|school|universite|universiteit|science|wetenschap/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function detectPolicyArea(title: string): string | null {
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(title)) return area;
  }
  return null;
}

function normalizeStatus(dossier: LaChambreDossier): string {
  const status = `${cleanText(dossier.SITU?.SITUK_textF)} ${cleanText(dossier.SITU?.SITUK_textN)}`.toLowerCase();
  if (status.includes('retir') || status.includes('ingetrokken')) return 'withdrawn';
  if (status.includes('rejet') || status.includes('verworpen')) return 'rejected';
  if (status.includes('publ') || status.includes('adopt') || status.includes('aangenomen') || status.includes('bekrachtigd')) return 'adopted';
  if (status.includes('pendant') || status.includes('hangend')) return 'parliamentary_deliberation';
  return 'consultation';
}

function extractSponsors(dossier: LaChambreDossier): string[] {
  const sponsors = new Set<string>();
  for (const author of asArray(dossier.BICAM?.MAINDOC?.AUTEURM)) {
    const name = `${cleanText(author.AUTEURM_FORNAAM)} ${cleanText(author.AUTEURM_FAMNAAM)}`.trim();
    const party = cleanText(author.AUTEURM_PARTY);
    if (name && party) sponsors.add(`${name} (${party})`);
    else if (name) sponsors.add(name);
  }
  return [...sponsors];
}

/**
 * Build a proposal row from one Belgian Chamber XML dossier.
 */
export function buildProposalFromLaChambreDossier(
  dossier: LaChambreDossier,
  sourceUrl: string,
): {
  title: string;
  official_title: string;
  status: string;
  proposal_type: string;
  jurisdiction: string;
  country_code: string;
  country_name: string;
  vote_date: string | null;
  submitted_date: string;
  sponsors: string[];
  affected_laws: string[];
  evidence_count: number;
  summary: string;
  policy_area: string | null;
  source_url: string;
  data_source: string;
} | null {
  const title = cleanText(dossier.TITLE?.TITLE_LONG?.TITLE_LONG_textN)
    || cleanText(dossier.TITLE?.TITLE_LONG?.TITLE_LONG_textF);
  if (!title) return null;

  const submittedDate =
    parseDate(dossier.BICAM?.MAINDOC?.DEPOTDAT)
    || parseDate(dossier.BICAM?.MAINDOC?.DISTRIBUTION_DATE)
    || new Date().toISOString().slice(0, 10);
  const decisionDate =
    parseDate(dossier.BICAM?.MAINDOC?.ENVOI)
    || parseDate(dossier.BICAM?.MAINDOC?.CONSID);
  const status = normalizeStatus(dossier);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'BE',
    country_name: 'Belgium',
    vote_date: status === 'adopted' || status === 'rejected' || status === 'withdrawn' ? decisionDate : null,
    submitted_date: submittedDate,
    sponsors: extractSponsors(dossier),
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: sourceUrl,
    data_source: 'lachambre_be',
  };
}
