import { describe, expect, it } from 'vitest';
import {
  mapOverviewRowToCoveragePolitician,
  normalizePoliticalEventStatsPayload,
  normalizeProposalStatsPayload,
} from '@/hooks/use-data-observatory';

describe('data observatory helpers', () => {
  it('maps lightweight overview rows into coverage-compatible politician rows', () => {
    const row = mapOverviewRowToCoveragePolitician({
      id: 'actor-1',
      name: 'Jane Example',
      role: 'Member of Parliament',
      country_code: 'PT',
      country_name: 'Portugal',
      party_name: 'Example Party',
      party_abbreviation: 'EXP',
      jurisdiction: 'federal',
      wikipedia_url: 'https://en.wikipedia.org/wiki/Jane_Example',
      enriched_at: '2026-04-23T00:00:00.000Z',
      birth_year: 1980,
      twitter_handle: 'janeexample',
      has_biography: true,
      has_photo: true,
    });

    expect(row.biography).toBe('__available__');
    expect(row.photo_url).toBe('__available__');
    expect(row.wikipedia_url).toBe('https://en.wikipedia.org/wiki/Jane_Example');
    expect(row.twitter_handle).toBe('janeexample');
  });

  it('normalizes proposal and event stats payloads from RPC json', () => {
    const proposalStats = normalizeProposalStatsPayload({
      total: 10,
      byCountry: [{ code: 'PT', name: 'Portugal', count: 4 }],
      byStatus: [{ name: 'in_committee', count: 3 }],
      byArea: [{ name: 'tax_policy', count: 2 }],
      byType: [{ name: 'budget_bill', count: 1 }],
    });
    const eventStats = normalizePoliticalEventStatsPayload({
      total: 5,
      byType: [{ name: 'committee_join', count: 2 }],
    });

    expect(proposalStats.byStatus[0]?.name).toBe('In Committee');
    expect(proposalStats.byArea[0]?.name).toBe('Tax Policy');
    expect(proposalStats.byType[0]?.name).toBe('Budget Bill');
    expect(eventStats.byType[0]?.name).toBe('Committee Join');
  });
});
