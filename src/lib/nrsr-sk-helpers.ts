/**
 * Pure helpers for ingesting Slovak National Council legislative proposals
 * from the official NRSR legislative search and detail pages.
 * No I/O, no Supabase.
 */

export interface NrsrSkListEntry {
  masterId: string;
  title: string;
  printNumber: string;
  statusLabel: string;
  deliveredDate: string | null;
  approvedDate: string | null;
  proposers: string | null;
  categoryLabel: string;
  sourceUrl: string;
}

export interface NrsrSkDetail {
  processState: string | null;
  title: string | null;
  categoryLabel: string | null;
  printNumber: string | null;
  deliveredDate: string | null;
  proposers: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/\benerg|\belektr|\bplyn|\bklimat|\bemisi/i, 'energy'],
  [/\bzdrav|\bnemocnic|\blekar|\bo[cč]kov|\bvakcin/i, 'health'],
  [/\bmigrac|\bazyl|\bhranic|\bcudzin/i, 'migration'],
  [/\bobrann|\bvojen|\bbezpec/i, 'defence'],
  [/\bdigital|\bkyber|\bdata|\bumel[ay] inteligenc/i, 'digital'],
  [/\bpolnohospod|\bles|\bryb|\bpotravin/i, 'agriculture'],
  [/\bobchod|\bclo|\bpriemys|\bpodnik/i, 'trade'],
  [/\brozpoc|\bfinanc|\bdan|\bfiskal|\bbank/i, 'finance'],
  [/\bdoprav|\bcestn|\bzelezn|\bleteck|\bpristav/i, 'transport'],
  [/\bzivotn[eé] prostred|\bodpad|\bvoda|\bvodovod|\bkanalizac|\bprirod/i, 'environment'],
  [/\bprac|\bzamestnan|\bsocial|\bdochod|\bmzd/i, 'labour'],
  [/\bspravodliv|\btrestn|\bsud|\bpolic|\bväz|\bvez/i, 'justice'],
  [/\bskol|\bvzdelav|\buniverzit|\bved/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldText(value: string | null | undefined): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function parseNrsrSkDate(value: string | null | undefined): string | null {
  const match = cleanText(value).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function detectPolicyArea(title: string, categoryLabel: string | null): string | null {
  const haystack = foldText(`${title} ${categoryLabel ?? ''}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function normalizeProposalType(title: string, categoryLabel: string | null): string {
  const haystack = foldText(`${title} ${categoryLabel ?? ''}`);
  if (haystack.includes('ustavny zakon')) return 'constitutional_revision';
  if (haystack.includes('statnom rozpocte') || haystack.includes('rozpocte') || haystack.includes('rozpoctovej')) return 'budget';
  return 'bill';
}

export function normalizeNrsrSkStatus(
  processState: string | null | undefined,
  approvedDate: string | null | undefined,
): string {
  if (parseNrsrSkDate(approvedDate)) return 'adopted';

  const state = foldText(processState);
  if (!state) return 'consultation';
  if (state.includes('vzaty spat') || state.includes('stiahnut')) return 'withdrawn';
  if (state.includes('uzavreta') || state.includes('uzavrety') || state.includes('ukonceny')) return 'rejected';
  if (state.includes('vybor') || state.includes('spolocnej spravy') || state.includes('gestorsky')) return 'committee';
  if (
    state.includes('evidencia')
    || state.includes('zaevidovany')
    || state.includes('vyber poradcov')
    || state.includes('stanovisko')
    || state.includes('i. citanie')
    || state.includes('ii. citanie')
    || state.includes('iii. citanie')
    || state.includes('redakcia')
  ) {
    return 'parliamentary_deliberation';
  }
  return 'consultation';
}

function normalizeSponsors(value: string | null | undefined): string[] {
  const text = cleanText(value);
  if (!text) return [];

  const parenMatch = text.match(/\((.+)\)$/);
  const folded = foldText(text);
  if (parenMatch && (folded.includes('poslanci nr sr') || folded.includes('poslankyn') || folded.includes('skupina poslancov'))) {
    const names = parenMatch[1]
      .split(/\s*,\s*/)
      .map((part) => cleanText(part))
      .filter(Boolean);
    if (names.length > 0) return [...new Set(names)];
  }

  if (text.includes(',') && !folded.includes('vlada')) {
    const parts = text
      .split(/\s*,\s*/)
      .map((part) => cleanText(part))
      .filter(Boolean);
    if (parts.length > 1) return [...new Set(parts)];
  }

  return [text];
}

function isBillCategory(categoryLabel: string | null | undefined): boolean {
  const category = foldText(categoryLabel);
  return category === 'ustavny zakon'
    || category === 'zakon vrateny prezidentom'
    || category === 'navrh zakona o statnom rozpocte'
    || category === 'novela zakona'
    || category === 'navrh noveho zakona';
}

export function buildNrsrSkSourceUrl(masterId: string): string {
  return `https://www.nrsr.sk/web/Default.aspx?sid=zakony/zakon&MasterID=${encodeURIComponent(masterId)}`;
}

export function isNrsrSkBillCategory(categoryLabel: string | null | undefined): boolean {
  return isBillCategory(categoryLabel);
}

/**
 * Build a proposal row from one Slovak NRSR list/detail pair.
 */
export function buildProposalFromNrsrSkEntry(
  entry: NrsrSkListEntry,
  detail: NrsrSkDetail,
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
  const masterId = cleanText(entry.masterId);
  const title = cleanText(detail.title || entry.title);
  const categoryLabel = cleanText(detail.categoryLabel || entry.categoryLabel) || null;
  if (!masterId || !title || !isBillCategory(categoryLabel)) return null;

  const deliveredDate = parseNrsrSkDate(detail.deliveredDate || entry.deliveredDate);
  const approvedDate = parseNrsrSkDate(entry.approvedDate);
  const processState = cleanText(detail.processState || entry.statusLabel) || null;
  const proposers = normalizeSponsors(detail.proposers || entry.proposers);
  const printNumber = cleanText(detail.printNumber || entry.printNumber);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status: normalizeNrsrSkStatus(processState, entry.approvedDate),
    proposal_type: normalizeProposalType(title, categoryLabel),
    jurisdiction: 'federal',
    country_code: 'SK',
    country_name: 'Slovakia',
    vote_date: approvedDate,
    submitted_date: deliveredDate ?? new Date().toISOString().slice(0, 10),
    sponsors: proposers,
    affected_laws: [],
    evidence_count: 1,
    summary: [processState, categoryLabel, printNumber].filter(Boolean).join(' | ') || title,
    policy_area: detectPolicyArea(title, categoryLabel),
    source_url: buildNrsrSkSourceUrl(masterId),
    data_source: 'nrsr_sk',
  };
}
