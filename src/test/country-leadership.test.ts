import { describe, expect, it } from 'vitest';
import {
  buildTrackedLeadershipEntries,
  getLeadershipCategory,
  getLeadershipPriority,
  isLeadershipRole,
} from '@/lib/country-leadership';

describe('country leadership classification', () => {
  it('keeps legislative heads distinct from heads of state', () => {
    expect(getLeadershipCategory('President of the Bundestag')).toBe('legislative_leadership');
    expect(getLeadershipPriority('President of the Bundestag')).toBe(110);
  });

  it('rejects party and non-government president labels', () => {
    expect(isLeadershipRole("President of Citizens' Alliance (Cyprus)")).toBe(false);
    expect(isLeadershipRole('Spouse of the President')).toBe(false);
    expect(isLeadershipRole('President of the Movement for Social Democracy')).toBe(false);
    expect(getLeadershipCategory("President of Citizens' Alliance (Cyprus)")).toBeUndefined();
    expect(getLeadershipPriority('President of the Movement for Social Democracy')).toBe(-1);
  });

  it('retains executive heads and substantive cabinet roles', () => {
    expect(getLeadershipCategory('President')).toBe('head_of_state');
    expect(getLeadershipCategory('Prime Minister')).toBe('head_of_government');
    expect(getLeadershipCategory('Federal Minister for Foreign Affairs')).toBe('foreign_affairs');
  });

  it('filters tracked actors down to real leadership roles', () => {
    const entries = buildTrackedLeadershipEntries([
      {
        id: 'actor-1',
        name: 'Julia Klöckner',
        partyId: 'cdu',
        party: 'CDU',
        canton: 'Germany',
        countryId: 'de',
        cityId: '',
        role: 'President of the Bundestag',
        jurisdiction: 'federal',
        committees: [],
        recentVotes: [],
        revisionId: 'rev-1',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
      {
        id: 'actor-2',
        name: 'Nikolas Papadopoulos',
        partyId: 'diko',
        party: 'DIKO',
        canton: 'Cyprus',
        countryId: 'cy',
        cityId: '',
        role: "President of Citizens' Alliance (Cyprus)",
        jurisdiction: 'federal',
        committees: [],
        recentVotes: [],
        revisionId: 'rev-2',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      personName: 'Julia Klöckner',
      category: 'legislative_leadership',
      href: '/actors/actor-1',
    });
  });
});
