import { describe, expect, it } from 'vitest';
import { buildVoteIntegrityReport, type ProposalVoteEvent, type ProposalVoteRecord } from '@/lib/proposal-vote-analytics';

describe('buildVoteIntegrityReport', () => {
  it('reports mismatch issues when event totals do not match roll call', () => {
    const event: ProposalVoteEvent = {
      id: 'event-1',
      proposal_id: 'proposal-1',
      source_event_id: 'source-event-1',
      chamber: 'Chamber',
      vote_method: 'roll_call',
      happened_at: '2026-04-21T00:00:00Z',
      result: 'adopted',
      for_count: 10,
      against_count: 5,
      abstain_count: 0,
      absent_count: 0,
      total_eligible: 20,
      total_cast: 15,
      quorum_required: null,
      quorum_reached: null,
      source_url: null,
    };
    const records: ProposalVoteRecord[] = [
      { id: 'r1', proposal_id: 'proposal-1', event_id: 'event-1', politician_id: null, voter_name: 'A', party: 'P1', vote_position: 'for', confidence: 1 },
      { id: 'r2', proposal_id: 'proposal-1', event_id: 'event-1', politician_id: null, voter_name: 'B', party: 'P1', vote_position: 'for', confidence: 1 },
      { id: 'r3', proposal_id: 'proposal-1', event_id: 'event-1', politician_id: null, voter_name: 'C', party: 'P1', vote_position: 'against', confidence: 1 },
    ];
    const report = buildVoteIntegrityReport(event, records);
    expect(report.hasAnyVotes).toBe(true);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('computes attendance and rebellion with consistent counts', () => {
    const event: ProposalVoteEvent = {
      id: 'event-2',
      proposal_id: 'proposal-1',
      source_event_id: 'source-event-2',
      chamber: 'Chamber',
      vote_method: 'roll_call',
      happened_at: '2026-04-21T00:00:00Z',
      result: 'adopted',
      for_count: 2,
      against_count: 1,
      abstain_count: 1,
      absent_count: 1,
      total_eligible: 5,
      total_cast: 4,
      quorum_required: null,
      quorum_reached: null,
      source_url: null,
    };
    const records: ProposalVoteRecord[] = [
      { id: 'r1', proposal_id: 'proposal-1', event_id: 'event-2', politician_id: null, voter_name: 'A', party: 'PX', vote_position: 'for', confidence: 1 },
      { id: 'r2', proposal_id: 'proposal-1', event_id: 'event-2', politician_id: null, voter_name: 'B', party: 'PX', vote_position: 'against', confidence: 1 },
      { id: 'r3', proposal_id: 'proposal-1', event_id: 'event-2', politician_id: null, voter_name: 'C', party: 'PX', vote_position: 'for', confidence: 1 },
      { id: 'r4', proposal_id: 'proposal-1', event_id: 'event-2', politician_id: null, voter_name: 'D', party: 'PY', vote_position: 'abstain', confidence: 1 },
      { id: 'r5', proposal_id: 'proposal-1', event_id: 'event-2', politician_id: null, voter_name: 'E', party: 'PY', vote_position: 'absent', confidence: 1 },
    ];
    const report = buildVoteIntegrityReport(event, records);
    expect(report.issues).toEqual([]);
    expect(report.attendanceRate).toBe(0.8);
    expect(report.rebellionCount).toBe(1);
  });
});
