/**
 * Pure helpers for ingesting Croatian parliamentary proposals from the
 * official Sabor e-doc list and detail pages.
 * No I/O, no Supabase.
 */

export interface SaborHrListEntry {
  proposalCode: string;
  title: string;
  legislature: string | null;
  session: string | null;
  readingLabel: string | null;
  sponsor: string | null;
  statusLabel: string | null;
  detailUrl: string;
}

export interface SaborHrDetail {
  proposalNumber: string | null;
  euAligned: string | null;
  procedureType: string | null;
  policyArea: string | null;
  globalStatus: string | null;
  readings: string[];
  sponsor: string | null;
  committees: string[];
  signature: string | null;
  readingStatus: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/\benerg|\bplin|\belektr|\bnaft|\bemisij/i, 'energy'],
  [/\bzdrav|\bbolnic|\blijek|\bmedicin/i, 'health'],
  [/\bmigrac|\bazil|\bstranac|\bgranic/i, 'migration'],
  [/\bobrana|\bvoj|\bsigurnost/i, 'defence'],
  [/\bdigital|\belektronick|\bkibern|\bpodatak/i, 'digital'],
  [/\bpoljopriv|\bribarstv|\bsumarstv|\bhrana/i, 'agriculture'],
  [/\btrzist|\btrgovin|\bgospodarst|\bcarin/i, 'trade'],
  [/\bproracun|\bfinanc|\bporez|\bbank|\bmirovinsk/i, 'finance'],
  [/\bpromet|\bcest|\bzeljezn|\bzracn|\bpomorsk/i, 'transport'],
  [/\bokolis|\bprirod|\bvodn|\botpad/i, 'environment'],
  [/\bradn|\bzaposlj|\bsocijal|\bplac/i, 'labour'],
  [/\bpravosud|\bkaznen|\bprekrsaj|\bsudben/i, 'justice'],
  [/\bobrazov|\bznanost|\bskol|\bsveucili/i, 'education'],
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
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function detectPolicyArea(title: string, policyArea: string | null): string | null {
  const haystack = foldText(`${title} ${policyArea ?? ''}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

export function normalizeSaborHrStatus(value: string | null | undefined): string {
  const status = foldText(value);
  if (!status) return 'consultation';
  if (status.includes('povucen')) return 'withdrawn';
  if (status.includes('odbijen')) return 'rejected';
  if (status.includes('donesen') || status.includes('prihvacen')) return 'adopted';
  if (status.includes('u proceduri') || status.includes('zakljucena rasprava')) return 'parliamentary_deliberation';
  if (status.includes('prima se na znanje') || status.includes('dostavljeno radi informiranja')) return 'consultation';
  return 'consultation';
}

function normalizeProposalType(title: string, policyArea: string | null): string {
  const haystack = foldText(`${title} ${policyArea ?? ''}`);
  if (/\bproracun|\bdržavni proracun|\bproračun/.test(haystack)) return 'budget';
  return 'bill';
}

function deriveSubmittedDate(signature: string | null): string {
  const match = cleanText(signature).match(/\/(\d{4})$/);
  if (match) return `${match[1]}-01-01`;
  return new Date().toISOString().slice(0, 10);
}

export function buildSaborHrSourceUrl(detailUrl: string): string {
  return new URL(detailUrl, 'https://edoc.sabor.hr/').toString();
}

/**
 * Build a proposal row from one Croatian Sabor list/detail pair.
 *
 * The public HTML card exposes a reliable signatura year but not a direct
 * registration date. We therefore anchor `submitted_date` to January 1 of the
 * official signatura year until a public exact-date field is found.
 */
export function buildProposalFromSaborHrEntry(
  entry: SaborHrListEntry,
  detail: SaborHrDetail,
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
  const proposalCode = cleanText(entry.proposalCode);
  if (!title || !/^PZE?\s+\d+$/i.test(proposalCode)) return null;

  const status = normalizeSaborHrStatus(detail.readingStatus || detail.globalStatus || entry.statusLabel);
  const policyArea = detectPolicyArea(title, detail.policyArea);
  const proposalType = normalizeProposalType(title, detail.policyArea);
  const readings = detail.readings.length > 0 ? detail.readings : [cleanText(entry.readingLabel)].filter(Boolean);
  const summaryParts = [
    readings.at(-1) ?? null,
    cleanText(detail.procedureType),
    cleanText(detail.policyArea),
    cleanText(detail.readingStatus || detail.globalStatus || entry.statusLabel),
  ].filter(Boolean);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: proposalType,
    jurisdiction: 'federal',
    country_code: 'HR',
    country_name: 'Croatia',
    vote_date: null,
    submitted_date: deriveSubmittedDate(detail.signature),
    sponsors: normalizeSponsors([detail.sponsor, entry.sponsor]),
    affected_laws: [],
    evidence_count: 1,
    summary: summaryParts.join(' | ') || title,
    policy_area: policyArea,
    source_url: buildSaborHrSourceUrl(entry.detailUrl),
    data_source: 'sabor_hr',
  };
}
