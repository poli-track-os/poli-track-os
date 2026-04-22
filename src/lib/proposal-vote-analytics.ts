export type VotePosition = 'for' | 'against' | 'abstain' | 'absent' | 'paired' | 'other';

export type ProposalVoteEvent = {
  id: string;
  proposal_id: string;
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
};

export type ProposalVoteGroup = {
  id: string;
  proposal_id: string;
  event_id: string;
  group_type: string;
  group_name: string;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  absent_count: number | null;
};

export type ProposalVoteRecord = {
  id: string;
  proposal_id: string;
  event_id: string;
  politician_id: string | null;
  voter_name: string;
  party: string | null;
  vote_position: VotePosition;
  confidence: number | null;
};

export type VoteIntegrityReport = {
  hasAnyVotes: boolean;
  issues: string[];
  attendanceRate: number | null;
  rebellionCount: number;
};

/**
 * Validate vote payload consistency and derive high-signal integrity metrics.
 *
 * Args:
 *   event: Vote event summary.
 *   records: Per-member roll call records.
 *
 * Returns:
 *   Consistency report with issues, attendance rate, and rebellion count.
 */
export function buildVoteIntegrityReport(
  event: ProposalVoteEvent | null,
  records: ProposalVoteRecord[],
): VoteIntegrityReport {
  const issues: string[] = [];
  if (!event && records.length === 0) {
    return { hasAnyVotes: false, issues, attendanceRate: null, rebellionCount: 0 };
  }

  const byPosition = new Map<VotePosition, number>();
  for (const record of records) {
    byPosition.set(record.vote_position, (byPosition.get(record.vote_position) ?? 0) + 1);
  }

  if (event) {
    const checks: Array<[VotePosition, number | null, string]> = [
      ['for', event.for_count, 'for'],
      ['against', event.against_count, 'against'],
      ['abstain', event.abstain_count, 'abstain'],
      ['absent', event.absent_count, 'absent'],
    ];
    for (const [position, expected, label] of checks) {
      if (expected === null) continue;
      const actual = byPosition.get(position) ?? 0;
      if (actual !== 0 && actual !== expected) {
        issues.push(`Roll call mismatch for ${label}: expected ${expected}, got ${actual}.`);
      }
    }
    if (event.total_cast !== null) {
      const cast = (byPosition.get('for') ?? 0) + (byPosition.get('against') ?? 0) + (byPosition.get('abstain') ?? 0);
      if (cast !== 0 && cast !== event.total_cast) {
        issues.push(`Total cast mismatch: expected ${event.total_cast}, got ${cast}.`);
      }
    }
  }

  const grouped = new Map<string, Map<VotePosition, number>>();
  for (const record of records) {
    const key = (record.party ?? 'Unknown').trim() || 'Unknown';
    const partyMap = grouped.get(key) ?? new Map<VotePosition, number>();
    partyMap.set(record.vote_position, (partyMap.get(record.vote_position) ?? 0) + 1);
    grouped.set(key, partyMap);
  }

  let rebellionCount = 0;
  for (const partyMap of grouped.values()) {
    const forCount = partyMap.get('for') ?? 0;
    const againstCount = partyMap.get('against') ?? 0;
    const abstainCount = partyMap.get('abstain') ?? 0;
    const majority = Math.max(forCount, againstCount, abstainCount);
    rebellionCount += forCount + againstCount + abstainCount - majority;
  }

  const eligible = event?.total_eligible ?? (records.length || null);
  const absent = event?.absent_count ?? (byPosition.get('absent') ?? 0);
  const attendanceRate = eligible && eligible > 0 ? Math.max(0, Math.min(1, (eligible - absent) / eligible)) : null;

  return { hasAnyVotes: true, issues, attendanceRate, rebellionCount };
}
