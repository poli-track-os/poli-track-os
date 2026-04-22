/**
 * Pure helpers for ingesting Lithuanian Seimas law projects from the official
 * e-Seimas search results and detail pages.
 * No I/O, no Supabase.
 */

export interface ESeimasLtListEntry {
  typeLabel: string;
  title: string;
  documentNumber: string;
  registeredAt: string | null;
  statusLabel: string | null;
  sponsorLabel: string | null;
  detailUrl: string;
}

export interface ESeimasLtDetail {
  typeLabel: string | null;
  registeredAt: string | null;
  statusLabel: string | null;
  sponsorLabel: string | null;
  chronologyDates: string[];
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/\benerg|\belektros\b|\belektrin|\bduj|\bnaft|\bklimat|\bemis/i, 'energy'],
  [/\bsveikat|\bligon|\bmedic|\bvaist/i, 'health'],
  [/\bmigr|\bprieglobst|\bsien|\buzsieniec/i, 'migration'],
  [/\bgynyb|\bkar|\bsaugum/i, 'defence'],
  [/\bskaitmen|\bduomen|\bkibern|\bdirbtin|\belektronin|\brysi/i, 'digital'],
  [/\bzemes uk|\bmisk|\bzuvin|\bmaist/i, 'agriculture'],
  [/\bprekyb|\bmuit|\bpramon|\bversl/i, 'trade'],
  [/\bbiudzet|\bfinans|\bmokesc|\bbank|\bpensij/i, 'finance'],
  [/\btransport|\bgelezinkel|\bkeli|\baviac|\buost/i, 'transport'],
  [/\baplinkos|\batliek|\bvand|\bgamt/i, 'environment'],
  [/\bdarb|\buzimt|\bsocial|\batlygin/i, 'labour'],
  [/\bteises|\bteism|\bbaudziam|\bpolic/i, 'justice'],
  [/\bsvietim|\bmoksl|\buniversit|\bmokykl/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function foldText(value: string | null | undefined): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function normalizeSponsors(values: Array<string | null | undefined>): string[] {
  const sponsors = new Set<string>();
  for (const rawValue of values) {
    const value = cleanText(rawValue);
    if (!value) continue;
    for (const piece of value.split(/\s*;\s*/)) {
      const sponsor = cleanText(piece);
      if (sponsor) sponsors.add(sponsor);
    }
  }
  return [...sponsors];
}

function detectPolicyArea(title: string): string | null {
  const haystack = foldText(title);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

export function normalizeESeimasLtStatus(value: string | null | undefined): string {
  const status = foldText(value);
  if (!status) return 'consultation';
  if (status.includes('priimtas')) return 'adopted';
  if (status.includes('atmestas')) return 'rejected';
  if (status.includes('atsiimtas') || status.includes('senas variantas')) return 'withdrawn';
  if (status.includes('svarst') || status.includes('pateikt') || status.includes('komitet')) {
    return 'parliamentary_deliberation';
  }
  if (status.includes('registruotas')) return 'consultation';
  return 'consultation';
}

function normalizeProposalType(title: string): string {
  return /\bbiudzet/.test(foldText(title)) ? 'budget' : 'bill';
}

export function buildESeimasLtSourceUrl(detailUrl: string): string {
  const url = new URL(detailUrl, 'https://e-seimas.lrs.lt/');
  url.search = '';
  return url.toString();
}

/**
 * Build a proposal row from one Lithuanian e-Seimas list/detail pair.
 */
export function buildProposalFromESeimasLtEntry(
  entry: ESeimasLtListEntry,
  detail: ESeimasLtDetail,
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
  const title = cleanText(entry.title);
  const typeLabel = cleanText(detail.typeLabel || entry.typeLabel);
  if (!title || typeLabel !== 'Įstatymo projektas') return null;

  const status = normalizeESeimasLtStatus(detail.statusLabel || entry.statusLabel);
  const submittedDate = cleanText(detail.registeredAt || entry.registeredAt) || new Date().toISOString().slice(0, 10);
  const voteDate = ['adopted', 'rejected', 'withdrawn'].includes(status)
    ? detail.chronologyDates.at(-1) ?? null
    : null;
  const sponsors = normalizeSponsors([detail.sponsorLabel, entry.sponsorLabel]);
  const summaryParts = [
    cleanText(entry.documentNumber),
    cleanText(detail.statusLabel || entry.statusLabel),
    sponsors[0] ?? null,
  ].filter(Boolean);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: normalizeProposalType(title),
    jurisdiction: 'federal',
    country_code: 'LT',
    country_name: 'Lithuania',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: summaryParts.join(' | ') || title,
    policy_area: detectPolicyArea(title),
    source_url: buildESeimasLtSourceUrl(entry.detailUrl),
    data_source: 'eseimas_lt',
  };
}
