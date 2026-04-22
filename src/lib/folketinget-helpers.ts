/**
 * Pure helpers for ingesting Denmark Folketing bill data from the official OData API.
 * No I/O, no Supabase.
 */

export interface FolketingSag {
  id?: number;
  titel?: string | null;
  titelkort?: string | null;
  resume?: string | null;
  nummer?: string | null;
  opdateringsdato?: string | null;
  lovnummer?: string | null;
  lovnummerdato?: string | null;
  statsbudgetsag?: boolean | null;
  afstemningskonklusion?: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energi|elektricitet|elforsyning|gas|brint|klima|emission|koolstof/i, 'energy'],
  [/sundhed|medicin|vaccin|sygehus|sygdom/i, 'health'],
  [/asyl|migration|udlaending|udl[aæ]nding|graense|gr[aæ]nse|indvandring|flygtning/i, 'migration'],
  [/forsvar|militaer|milit[aæ]r|sikkerhed/i, 'defence'],
  [/digital|data|cyber|internet|kunstig intelligens|ai/i, 'digital'],
  [/landbrug|fiskeri|foedevarer|f[oø]devarer/i, 'agriculture'],
  [/handel|told|import|eksport/i, 'trade'],
  [/finans|bank|skat|budget|bevilling|finanslov/i, 'finance'],
  [/transport|luftfart|jernbane|skibsfart|vej/i, 'transport'],
  [/milj[oø]|biodiversitet|forurening|affald|vand|natur/i, 'environment'],
  [/arbejde|beskaeftigelse|besk[aæ]ftigelse|social|pension/i, 'labour'],
  [/justits|domstol|straf|retten/i, 'justice'],
  [/uddannelse|skole|universitet|forskning/i, 'education'],
];

function detectPolicyArea(title: string, statsBudgetSag: boolean | null | undefined): string | null {
  if (statsBudgetSag) return 'finance';
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function mapStatus(sag: FolketingSag, rawStatus: string | null | undefined): string {
  const value = (rawStatus ?? '').toLowerCase();
  const conclusion = (sag.afstemningskonklusion ?? '').toLowerCase();
  if (value.includes('vedtaget') || value.includes('stadf') || conclusion.includes('vedtaget') || trimToNull(sag.lovnummer)) return 'adopted';
  if (value.includes('forkastet')) return 'rejected';
  if (value.includes('tilbagetaget') || value.includes('udg') || value.includes('bortfald')) return 'withdrawn';
  if (value.includes('bet') || value.includes('afgivet')) return 'committee';
  if (value.includes('forhandlet') || value.includes('fremmet') || value.includes('igangv') || value.includes('anmeldt') || value.includes('forel') || value.includes('foretaget')) {
    return 'parliamentary_deliberation';
  }
  return 'consultation';
}

export function buildFolketingProposalSourceUrl(sagId: number | null | undefined): string {
  return `https://oda.ft.dk/api/Sag(${sagId ?? 0})?$format=json`;
}

/**
 * Build a proposal row from one Folketing Sag item plus pre-fetched relational context.
 *
 * @param sag Folketing bill row
 * @param options Related status label, sponsor names, and submitted date
 * @returns proposal row or null
 */
export function buildProposalFromFolketingSag(
  sag: FolketingSag,
  options: {
    statusLabel?: string | null;
    sponsors?: string[];
    submittedDate?: string | null;
  } = {},
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
  const officialTitle = trimToNull(sag.titel);
  const shortTitle = trimToNull(sag.titelkort) ?? officialTitle;
  if (!officialTitle || !shortTitle) return null;

  const submittedDate = trimToNull(options.submittedDate)
    ?? trimToNull(sag.opdateringsdato)?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10);
  const summary = trimToNull(sag.resume) ?? officialTitle;
  const sponsors = [...new Set((options.sponsors ?? []).map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))];

  return {
    title: shortTitle.slice(0, 500),
    official_title: officialTitle,
    status: mapStatus(sag, options.statusLabel),
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'DK',
    country_name: 'Denmark',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: summary.slice(0, 2000),
    policy_area: detectPolicyArea(officialTitle, sag.statsbudgetsag),
    source_url: buildFolketingProposalSourceUrl(sag.id),
    data_source: 'folketinget',
  };
}
