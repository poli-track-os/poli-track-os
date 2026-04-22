/**
 * Pure helpers for ingesting Czech Chamber print records from the official
 * PSP list and history pages.
 * No I/O, no Supabase.
 */

export interface PspCzListEntry {
  printNumber: string;
  title: string;
  typeLabel: string;
  sourceUrl: string;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/rozpo[cč]t|da[nň]|financ|bank|ú[čc]etn/i, 'finance'],
  [/zdravot|nemocnic|l[eé]ka[řr]|z[aá]chrann/i, 'health'],
  [/energi|elektr|plyn|klimat|emis/i, 'energy'],
  [/migrac|azyl|cizinc|hranic/i, 'migration'],
  [/obrana|vojensk|bezpe[cč]nost/i, 'defence'],
  [/digit|data|kyber|um[ěe]l[áa] inteligenc/i, 'digital'],
  [/zem[eě]d[eě]l|lesn|ryb[aá][řr]|potravin/i, 'agriculture'],
  [/doprava|silni[cč]n|železni[cč]|leteck|p[řr]ístav/i, 'transport'],
  [/životn[ií] prost[řr]ed[ií]|odpad|voda|p[řr]írod/i, 'environment'],
  [/pr[aá]ce|zam[ěe]stnan|soci[aá]ln|d[ůu]chod|mzda/i, 'labour'],
  [/spravedlnost|trestn|soud|polici|v[ěe]ze[ňn]/i, 'justice'],
  [/škol|vzd[ěe]l[aá]v|univerzit|v[ěe]d/i, 'education'],
];

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isPspCzBillType(typeLabel: string): boolean {
  const folded = foldText(typeLabel);
  return folded.includes('navrh zakona') || folded === 'zakon ze senatu' || folded === 'statni rozpocet';
}

function detectPolicyArea(title: string, typeLabel: string): string | null {
  const haystack = foldText(`${title} ${typeLabel}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function toIsoDate(match: RegExpMatchArray): string {
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function parseDateFromText(detailText: string): string | null {
  const anchoredMatch = detailText.match(/p[řr]edlo[zž]i(?:l|la|lo)\s+sn[ěe]movn[ěe]\s+n[aá]vrh\s+z[aá]kona\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i);
  if (anchoredMatch) {
    return `${anchoredMatch[3]}-${anchoredMatch[2].padStart(2, '0')}-${anchoredMatch[1].padStart(2, '0')}`;
  }
  const match = detailText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return null;
  return toIsoDate(match);
}

function normalizeStatus(detailText: string): string {
  const folded = foldText(detailText);
  if (folded.includes('vzato zpet') || folded.includes('vzal zpet')) return 'withdrawn';
  if (folded.includes('zamitnut') || folded.includes('zamietnuto')) return 'rejected';
  if (folded.includes('vyhlasen ve sbirce zakonu') || folded.includes('zakon byl vyhlasen') || folded.includes('podepsal prezident republiky')) return 'adopted';
  return 'parliamentary_deliberation';
}

function extractSponsors(entry: PspCzListEntry, detailText: string): string[] {
  const foldedType = foldText(entry.typeLabel);
  if (foldedType.includes('vladni')) return ['Vlada'];
  if (foldedType.includes('senatni') || foldedType === 'zakon ze senatu') return ['Senat'];
  if (foldedType.includes('zastupitelstva kraje')) {
    const match = detailText.match(/Zastupitelstv[oa]\s+(.+?)\s+kraje/i);
    return match ? [`Zastupitelstvo ${match[1]} kraje`] : ['Zastupitelstvo kraje'];
  }
  const groupMatch = detailText.match(/Skupina poslanc[ůu]\s*\((.+?)\)\s+p[řr]edlo[zž]ila/i);
  if (groupMatch) {
    return groupMatch[1].split(/,\s*/).map((name) => name.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Build a proposal row from one Czech PSP list entry plus the text content of
 * its official history page.
 */
export function buildProposalFromPspCzEntry(
  entry: PspCzListEntry,
  detailText: string,
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
  if (!entry.title.trim()) return null;
  const submittedDate = parseDateFromText(detailText) ?? new Date().toISOString().slice(0, 10);
  return {
    title: entry.title.slice(0, 500),
    official_title: entry.title,
    status: normalizeStatus(detailText),
    proposal_type: foldText(entry.typeLabel) === 'statni rozpocet' ? 'budget' : 'bill',
    jurisdiction: 'federal',
    country_code: 'CZ',
    country_name: 'Czech Republic',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors: extractSponsors(entry, detailText),
    affected_laws: [],
    evidence_count: 1,
    summary: entry.title,
    policy_area: detectPolicyArea(entry.title, entry.typeLabel),
    source_url: entry.sourceUrl,
    data_source: 'psp_cz',
  };
}
