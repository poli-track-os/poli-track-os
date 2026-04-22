/**
 * Pure helpers for ingesting Irish Oireachtas legislation.
 * No I/O, no Supabase.
 */

export interface OireachtasBillSponsor {
  sponsor?: {
    as?: { showAs?: string | null };
    by?: { showAs?: string | null };
  };
}

export interface OireachtasBillEventDate {
  date?: string;
}

export interface OireachtasBillMostRecentStage {
  event?: {
    showAs?: string;
    dates?: OireachtasBillEventDate[];
  };
}

export interface OireachtasBill {
  billNo?: string;
  billYear?: string;
  billType?: string;
  shortTitleEn?: string;
  longTitleEn?: string;
  status?: string;
  source?: string;
  uri?: string;
  sponsors?: OireachtasBillSponsor[];
  mostRecentStage?: OireachtasBillMostRecentStage;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energy|electricity|gas|renewable|nuclear|emission|climate|carbon/i, 'energy'],
  [/health|medicine|pharmac|vaccine|hospital|disease/i, 'health'],
  [/asylum|migration|border|immigration|refugee/i, 'migration'],
  [/defence|defense|military|armament|security/i, 'defence'],
  [/data|privacy|cyber|digital|online|platform|artificial intelligence/i, 'digital'],
  [/agricul|farm|food|fisher/i, 'agriculture'],
  [/trade|tariff|customs|import|export/i, 'trade'],
  [/bank|financial|monetary|tax|budget/i, 'finance'],
  [/transport|aviation|rail|shipping|road/i, 'transport'],
  [/environment|biodiversity|pollution|waste|water|nature/i, 'environment'],
  [/employment|labour|labor|worker|pension|social/i, 'labour'],
  [/justice|court|criminal|judicial|law enforcement/i, 'justice'],
  [/education|school|university|research/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function mapStatus(rawStatus: string | undefined): string {
  const value = (rawStatus ?? '').toLowerCase();
  if (value.includes('enacted') || value.includes('signed')) return 'adopted';
  if (value.includes('withdrawn')) return 'withdrawn';
  if (value.includes('defeated') || value.includes('rejected')) return 'rejected';
  if (value.includes('committee')) return 'committee';
  if (value.includes('stage')) return 'parliamentary_deliberation';
  return 'consultation';
}

function mapType(rawType: string | undefined): string {
  const value = (rawType ?? '').toLowerCase();
  if (value.includes('resolution')) return 'resolution';
  return 'bill';
}

/**
 * Build a proposal row from one Oireachtas bill record.
 *
 * @param bill Oireachtas legislation record
 * @returns proposal row or null for invalid rows
 */
export function buildProposalFromOireachtasBill(bill: OireachtasBill): {
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
  const title = (bill.shortTitleEn || bill.longTitleEn || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const sponsorNames = new Set<string>();
  for (const entry of bill.sponsors ?? []) {
    const value = entry.sponsor?.as?.showAs ?? entry.sponsor?.by?.showAs ?? null;
    if (value?.trim()) sponsorNames.add(value.trim());
  }
  const stageDate = bill.mostRecentStage?.event?.dates?.[0]?.date;
  const submittedDate = (stageDate || `${bill.billYear ?? '2000'}-01-01`).slice(0, 10);
  const sourceUrl = bill.uri || `https://www.oireachtas.ie/en/bills/bill/${bill.billYear}/${bill.billNo}`;
  return {
    title: title.slice(0, 500),
    official_title: title,
    status: mapStatus(bill.status),
    proposal_type: mapType(bill.billType),
    jurisdiction: 'federal',
    country_code: 'IE',
    country_name: 'Ireland',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors: [...sponsorNames],
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: sourceUrl,
    data_source: 'oireachtas',
  };
}
