/**
 * Pure helpers for ingesting Poland Sejm prints API data.
 * No I/O, no Supabase.
 */

export interface SejmPrint {
  number?: string;
  title?: string;
  deliveryDate?: string;
  documentDate?: string;
  changeDate?: string;
  term?: number;
  attachments?: string[];
}

export interface SejmVotingEntry {
  term?: number;
  sitting?: number;
  votingNumber?: number;
  date?: string;
  title?: string;
  topic?: string;
  description?: string;
  kind?: string;
  yes?: number;
  no?: number;
  abstain?: number;
  notParticipating?: number;
  totalVoted?: number;
  majorityVotes?: number;
  majorityType?: string;
  votes?: Array<{
    MP?: number;
    firstName?: string;
    lastName?: string;
    secondName?: string;
    club?: string;
    vote?: string;
    listVotes?: Record<string, string>;
  }>;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energi|elektrycz|gaz|odnawial|nuklear|emisj|klimat|węgl|wegl/i, 'energy'],
  [/zdrow|medycz|farmac|szpital|chorob/i, 'health'],
  [/azyl|migrac|granic|imigrac|uchodź|uchodz/i, 'migration'],
  [/obron|wojsk|bezpiecze|uzbrojen/i, 'defence'],
  [/cyfrow|danych|cyber|internet|sztucznej inteligencji/i, 'digital'],
  [/roln|żywno|zywno|rybo/i, 'agriculture'],
  [/handel|cło|clo|taryf|import|eksport/i, 'trade'],
  [/finans|bank|podatk|budżet|budzet/i, 'finance'],
  [/transport|lotnic|kolej|morsk|drogow/i, 'transport'],
  [/środow|srodow|bioróżnor|biorozn|zanieczyszc|odpady|wod/i, 'environment'],
  [/pracy|zatrudn|społecz|spolecz|emerytur/i, 'labour'],
  [/sprawiedliwo|sąd|sad|karn|trybuna/i, 'justice'],
  [/edukac|szko|uniwersytet|nauk/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function isLegislation(title: string): boolean {
  const value = title.toLowerCase();
  return value.includes('projekt ustawy')
    || value.includes('ustaw')
    || value.includes('kodeks');
}

/**
 * Build a proposal row from Sejm print record.
 *
 * @param item print item
 * @returns proposal row or null for non-legislation rows
 */
export function buildProposalFromSejmPrint(item: SejmPrint): {
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
  const title = item.title?.replace(/\s+/g, ' ').trim();
  if (!title || !isLegislation(title)) return null;
  const submittedDate = item.deliveryDate || item.documentDate || item.changeDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const fileName = item.attachments?.find((name) => name.endsWith('.pdf')) || item.attachments?.[0] || '';
  const sourceUrl = fileName
    ? `https://api.sejm.gov.pl/sejm/term${item.term ?? 10}/prints/${item.number}/${fileName}`
    : `https://api.sejm.gov.pl/sejm/term${item.term ?? 10}/prints/${item.number}`;
  return {
    title: title.slice(0, 500),
    official_title: title,
    status: 'consultation',
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'PL',
    country_name: 'Poland',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors: [],
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: sourceUrl,
    data_source: 'sejm',
  };
}

/**
 * Extract referenced print numbers from a voting title/topic/description blob.
 *
 * Args:
 *   voting: Sejm voting payload.
 *
 * Returns:
 *   Distinct print-number strings like "123".
 */
export function extractPrintNumbersFromVoting(voting: SejmVotingEntry): string[] {
  const text = `${voting.title ?? ''} ${voting.topic ?? ''} ${voting.description ?? ''}`;
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const out = new Set<string>();
  const patterns = [
    /druki?\s+nr\s+([0-9,\si-]+)/gi,
    /druk(?:u)?\s+nr\s+([0-9]+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(normalized))) {
      const raw = match[1] ?? '';
      for (const token of raw.split(/[,\si-]+/)) {
        const value = token.trim();
        if (/^\d+$/.test(value)) out.add(value);
      }
    }
  }
  return [...out];
}

/**
 * Build vote bundle from one Sejm voting payload.
 *
 * Args:
 *   voting: Single voting details response item.
 *
 * Returns:
 *   Normalized vote bundle.
 */
export function buildVoteBundleFromSejmVoting(voting: SejmVotingEntry) {
  const records = (voting.votes ?? []).map((item, index) => {
    const fullName = [item.firstName, item.secondName, item.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
    let votePosition: 'for' | 'against' | 'abstain' | 'absent' | 'paired' | 'other' = 'other';
    if (item.vote === 'VOTE_YES') votePosition = 'for';
    if (item.vote === 'VOTE_NO') votePosition = 'against';
    if (item.vote === 'VOTE_ABSTAIN') votePosition = 'abstain';
    if (item.vote === 'VOTE_ABSENT') votePosition = 'absent';
    if (item.vote === 'VOTE_VALID' && item.listVotes && Object.keys(item.listVotes).length > 0) {
      votePosition = 'other';
    }
    return {
      source_record_id: `${voting.sitting ?? 's'}-${voting.votingNumber ?? 'v'}-${item.MP ?? index}`,
      politician_id: null,
      voter_name: fullName,
      party: item.club ?? null,
      vote_position: votePosition,
      confidence: fullName === 'Unknown' ? 0.3 : 1,
      source_payload: item as Record<string, unknown>,
    };
  });
  const partyMatrix = new Map<string, { for: number; against: number; abstain: number; absent: number }>();
  for (const record of records) {
    const party = (record.party ?? 'Unknown').trim() || 'Unknown';
    const row = partyMatrix.get(party) ?? { for: 0, against: 0, abstain: 0, absent: 0 };
    if (record.vote_position === 'for') row.for += 1;
    if (record.vote_position === 'against') row.against += 1;
    if (record.vote_position === 'abstain') row.abstain += 1;
    if (record.vote_position === 'absent') row.absent += 1;
    partyMatrix.set(party, row);
  }
  const groups = [...partyMatrix.entries()].map(([party, row]) => ({
    source_group_id: `${voting.sitting ?? 's'}-${voting.votingNumber ?? 'v'}-${party}`,
    group_type: 'party',
    group_name: party,
    for_count: row.for,
    against_count: row.against,
    abstain_count: row.abstain,
    absent_count: row.absent,
    source_payload: { party },
  }));
  return {
    source_event_id: `${voting.sitting ?? 's'}-${voting.votingNumber ?? 'v'}`,
    chamber: 'Sejm',
    vote_method: voting.kind?.toLowerCase().includes('electronic') ? 'electronic' : 'other',
    happened_at: voting.date ?? null,
    result: (voting.yes ?? 0) >= (voting.majorityVotes ?? Number.MAX_SAFE_INTEGER) ? 'adopted' : 'rejected',
    for_count: voting.yes ?? null,
    against_count: voting.no ?? null,
    abstain_count: voting.abstain ?? null,
    absent_count: voting.notParticipating ?? null,
    total_eligible: voting.totalVoted ?? null,
    total_cast: voting.totalVoted ?? null,
    quorum_required: voting.majorityVotes ?? null,
    quorum_reached: null,
    source_url: voting.sitting && voting.votingNumber ? `https://api.sejm.gov.pl/sejm/term${voting.term ?? 10}/votings/${voting.sitting}/${voting.votingNumber}` : null,
    source_payload: voting as Record<string, unknown>,
    groups,
    records,
  };
}
