/**
 * Pure helpers for ingesting Estonia Riigikogu draft bills.
 * No I/O, no Supabase.
 */

export interface RiigikoguDraftListRow {
  uuid?: string;
  title?: string | null;
  mark?: number | null;
  draftTypeCode?: string | null;
  activeDraftStage?: string | null;
  activeDraftStatus?: string | null;
  proceedingStatus?: string | null;
  activeDraftStatusDate?: string | null;
  initiated?: string | null;
  amendmentsDeadline?: string | null;
  leadingCommittee?: {
    name?: string | null;
  } | null;
  _links?: {
    self?: {
      href?: string | null;
    } | null;
  } | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energia|elektri|gaasi|kliima|heite|vesiniku/i, 'energy'],
  [/tervishoiu|tervise|meditsi|haigla|vaktsiin/i, 'health'],
  [/ranne|r[aä]nne|varjupaiga|piiri|v[aä]lismaalase|kodakondsuse/i, 'migration'],
  [/kaitse|s[oõ]ja|julgeoleku|relva/i, 'defence'],
  [/digitaal|andmekogu|andme|k[uü]berturbe|tehisintellekti/i, 'digital'],
  [/p[oõ]llumajand|kalanduse|toidu|maaelu/i, 'agriculture'],
  [/kauband|tolli|impordi|ekspordi/i, 'trade'],
  [/eelarve|maksu|rahandus|panga|finants/i, 'finance'],
  [/transpordi|raudtee|lennund|meres[oõ]idu|tee/i, 'transport'],
  [/keskkonna|loodus|bioloogilise|saaste|j[aä]tme|vee/i, 'environment'],
  [/to[oö]h[oõ]ive|sotsiaal|pensioni|to[oö][oö]lepingu/i, 'labour'],
  [/kriminaal|karistus|kohtumenetluse|justiits/i, 'justice'],
  [/haridus|kooli|uuringu|teadus|u[nü]likool/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function normalizeStatus(row: RiigikoguDraftListRow): string {
  const combined = `${row.activeDraftStage ?? ''} ${row.activeDraftStatus ?? ''}`.toUpperCase();
  if (combined.includes('VASTU_VOETUD') || combined.includes('AVALDATUD_RIIGITEATAJAS')) return 'adopted';
  if (combined.includes('TAGASI_LYKATUD')) return 'rejected';
  if (combined.includes('TAGASI_VOETUD')) return 'withdrawn';
  if (combined.includes('LUGEMINE') || combined.includes('MENETLUSSE_VOETUD')) return 'parliamentary_deliberation';
  if (combined.includes('KOMISJON')) return 'committee';
  if ((row.proceedingStatus ?? '').toUpperCase() === 'IN_PROCESS') return 'consultation';
  return 'consultation';
}

export function buildRiigikoguSourceUrl(href: string | null | undefined, uuid: string | null | undefined = null): string {
  const fallback = uuid?.trim()
    ? `https://api.riigikogu.ee/api/volumes/drafts/${uuid.trim()}`
    : 'https://api.riigikogu.ee/api/volumes/drafts';
  if (!href?.trim()) return fallback;
  const url = new URL(href.trim(), 'https://api.riigikogu.ee');
  url.searchParams.set('lang', 'EN');
  return url.toString();
}

/**
 * Build a proposal row from a Riigikogu draft-bill search row.
 *
 * @param row Riigikogu list item
 * @returns proposal row or null
 */
export function buildProposalFromRiigikoguDraft(row: RiigikoguDraftListRow): {
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
  const title = row.title?.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const status = normalizeStatus(row);
  const statusDate = row.activeDraftStatusDate?.slice(0, 10) ?? null;
  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'EE',
    country_name: 'Estonia',
    vote_date: status === 'adopted' || status === 'rejected' || status === 'withdrawn' ? statusDate : null,
    submitted_date: row.initiated?.slice(0, 10) ?? statusDate ?? new Date().toISOString().slice(0, 10),
    sponsors: [],
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: buildRiigikoguSourceUrl(row._links?.self?.href, row.uuid),
    data_source: 'riigikogu',
  };
}

/**
 * Build a vote bundle from Riigikogu draft terminal stage metadata.
 *
 * Args:
 *   row: Riigikogu draft list row.
 *
 * Returns:
 *   Vote bundle when stage indicates a final decision, otherwise null.
 */
export function buildVoteBundleFromRiigikoguDraft(row: RiigikoguDraftListRow): {
  source_event_id: string;
  chamber: string | null;
  vote_method: string | null;
  happened_at: string | null;
  result: string | null;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  absent_count: number | null;
  total_eligible: number | null;
  total_cast: number | null;
  quorum_required: number | null;
  quorum_reached: boolean | null;
  source_url: string | null;
  source_payload: Record<string, unknown>;
  groups: [];
  records: [];
} | null {
  const status = normalizeStatus(row);
  if (!['adopted', 'rejected', 'withdrawn'].includes(status)) return null;
  const happenedAt = row.activeDraftStatusDate?.slice(0, 10) ?? null;
  if (!happenedAt) return null;
  const sourceUrl = buildRiigikoguSourceUrl(row._links?.self?.href, row.uuid);
  return {
    source_event_id: `${row.uuid ?? sourceUrl}-${status}-${happenedAt}`,
    chamber: 'Riigikogu',
    vote_method: 'plenary',
    happened_at: happenedAt,
    result: status,
    for_count: null,
    against_count: null,
    abstain_count: null,
    absent_count: null,
    total_eligible: null,
    total_cast: null,
    quorum_required: null,
    quorum_reached: null,
    source_url: sourceUrl,
    source_payload: row as Record<string, unknown>,
    groups: [],
    records: [],
  };
}
