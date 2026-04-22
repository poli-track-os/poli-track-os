/**
 * Pure helpers for ingesting Latvian Saeima legislative proposals from the
 * official LIVS registry pages.
 * No I/O, no Supabase.
 */

export interface SaeimaLvListEntry {
  term: string;
  reference: string;
  title: string;
  statusLabel: string;
  unid: string;
}

export interface SaeimaLvDetail {
  submittedDate: string | null;
  lastActionDate: string | null;
  sponsors: string[];
  responsibleCommittee: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/enerģ|elektr|gāz|klimat|emis/i, 'energy'],
  [/vesel|slimnīc|ārst|medic|vakc/i, 'health'],
  [/migrāc|patvērum|robež|imigr/i, 'migration'],
  [/aizsardz|milit|drošīb/i, 'defence'],
  [/digit|datu|kiber|mākslīgais intelekts/i, 'digital'],
  [/lauksaimn|mež|zvej|pārtik/i, 'agriculture'],
  [/tirdzniec|muit|rūpniec|uzņēm/i, 'trade'],
  [/budžet|finan|nodok|nodev|bank|kredīt/i, 'finance'],
  [/transport|dzelzceļ|ceļ|ostas|aviāc/i, 'transport'],
  [/vides|atkrit|ūden|dabas/i, 'environment'],
  [/darb|nodarbin|sociāl|pensij|alg/i, 'labour'],
  [/tiesli|krimin|tiesa|polic|cietum/i, 'justice'],
  [/izglīt|skol|universit|zinātn/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function detectPolicyArea(title: string): string | null {
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(title)) return area;
  }
  return null;
}

export function normalizeSaeimaLvStatus(value: string | null | undefined): string {
  const status = cleanText(value).toLowerCase();
  if (!status) return 'consultation';
  if (status.includes('izsludin')) return 'adopted';
  if (status.includes('noraid')) return 'rejected';
  if (status.includes('atsauk')) return 'withdrawn';
  if (status.includes('komisij')) return 'committee';
  if (status.includes('lasījum') || status.includes('sēd') || status.includes('iekļauts') || status.includes('steidzam')) {
    return 'parliamentary_deliberation';
  }
  return 'consultation';
}

function normalizeSponsors(values: string[]): string[] {
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

export function buildSaeimaLvSourceUrl(term: string, unid: string): string {
  return `https://titania.saeima.lv/LIVS${encodeURIComponent(term)}/saeimalivs${encodeURIComponent(term)}.nsf/0/${encodeURIComponent(unid)}?OpenDocument`;
}

/**
 * Build a proposal row from one Latvian list entry plus the structured fields
 * extracted from its official detail page.
 */
export function buildProposalFromSaeimaLvRow(
  entry: SaeimaLvListEntry,
  detail: SaeimaLvDetail,
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
  const reference = cleanText(entry.reference);
  const unid = cleanText(entry.unid);
  if (!title || !reference || !unid) return null;

  const status = normalizeSaeimaLvStatus(entry.statusLabel);
  const submittedDate = detail.submittedDate ?? new Date().toISOString().slice(0, 10);
  const voteDate = ['adopted', 'rejected', 'withdrawn'].includes(status) ? detail.lastActionDate : null;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: /budžet/i.test(title) ? 'budget' : 'bill',
    jurisdiction: 'federal',
    country_code: 'LV',
    country_name: 'Latvia',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors: normalizeSponsors(detail.sponsors),
    affected_laws: [],
    evidence_count: 1,
    summary: detail.responsibleCommittee ? `${detail.responsibleCommittee}: ${title}` : title,
    policy_area: detectPolicyArea(title),
    source_url: buildSaeimaLvSourceUrl(entry.term, unid),
    data_source: 'saeima_lv',
  };
}
