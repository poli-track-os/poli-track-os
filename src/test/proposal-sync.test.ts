import { describe, expect, it, vi } from 'vitest';
import { fetchExistingProposalIdsBySourceUrl, upsertProposalVoteBundles } from '@/lib/proposal-sync';

describe('fetchExistingProposalIdsBySourceUrl', () => {
  it('queries proposal source URLs in chunks and merges the results', async () => {
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({
        in: vi.fn().mockResolvedValue({
          data: [{ id: '1', source_url: 'https://example.test/0' }],
          error: null,
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockResolvedValue({
          data: [{ id: '2', source_url: 'https://example.test/500' }],
          error: null,
        }),
      })
      .mockReturnValueOnce({
        in: vi.fn().mockResolvedValue({
          data: [{ id: '3', source_url: 'https://example.test/1000' }],
          error: null,
        }),
      });

    const supabase = {
      from: vi.fn(() => ({
        select: selectMock,
      })),
    } as never;

    const sourceUrls = Array.from({ length: 1200 }, (_, index) => `https://example.test/${index}`);
    const existing = await fetchExistingProposalIdsBySourceUrl(supabase, sourceUrls, 500);

    expect(existing).toEqual(
      new Map([
        ['https://example.test/0', '1'],
        ['https://example.test/500', '2'],
        ['https://example.test/1000', '3'],
      ]),
    );
    expect(selectMock).toHaveBeenCalledTimes(3);
  });
});

describe('upsertProposalVoteBundles', () => {
  it('upserts event, group, and records for each vote bundle', async () => {
    const eventSingle = vi.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null });
    const eventSelect = vi.fn(() => ({ single: eventSingle }));
    const eventUpsert = vi.fn(() => ({ select: eventSelect }));
    const groupUpsert = vi.fn().mockResolvedValue({ error: null });
    const recordUpsert = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'proposal_vote_events') return { upsert: eventUpsert };
        if (table === 'proposal_vote_groups') return { upsert: groupUpsert };
        if (table === 'proposal_vote_records') return { upsert: recordUpsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as never;

    const result = await upsertProposalVoteBundles(supabase, [{
      proposal_id: 'proposal-1',
      event: {
        source_event_id: 'source-event-1',
        chamber: 'Bundestag',
        vote_method: 'roll_call',
        happened_at: '2026-04-21T10:00:00Z',
        result: 'adopted',
        for_count: 100,
        against_count: 80,
        abstain_count: 10,
        absent_count: 5,
        total_eligible: 195,
        total_cast: 190,
        quorum_required: 98,
        quorum_reached: true,
        source_url: 'https://example.test/vote',
        source_payload: {},
      },
      groups: [{
        source_group_id: 'group-1',
        group_type: 'party',
        group_name: 'Party A',
        for_count: 60,
        against_count: 20,
        abstain_count: 5,
        absent_count: 1,
        source_payload: {},
      }],
      records: [{
        source_record_id: 'record-1',
        politician_id: null,
        voter_name: 'Jane Doe',
        party: 'Party A',
        vote_position: 'for',
        confidence: 1,
        source_payload: {},
      }],
    }]);

    expect(result.eventsUpserted).toBe(1);
    expect(eventUpsert).toHaveBeenCalledTimes(1);
    expect(groupUpsert).toHaveBeenCalledTimes(1);
    expect(recordUpsert).toHaveBeenCalledTimes(1);
  });
});
