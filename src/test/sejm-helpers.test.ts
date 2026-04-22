import { describe, expect, it } from 'vitest';
import { buildVoteBundleFromSejmVoting, extractPrintNumbersFromVoting } from '@/lib/sejm-helpers';

describe('extractPrintNumbersFromVoting', () => {
  it('extracts single and multiple print numbers from vote text', () => {
    const numbers = extractPrintNumbersFromVoting({
      title: 'Pkt. 3 ... (druki nr 12, 13 i 14)',
      topic: 'głosowanie nad druk nr 15',
      description: 'w sprawie projektu',
    });
    expect(numbers).toEqual(expect.arrayContaining(['12', '13', '14', '15']));
  });
});

describe('buildVoteBundleFromSejmVoting', () => {
  it('builds vote bundle with grouped party splits and roll-call records', () => {
    const bundle = buildVoteBundleFromSejmVoting({
      term: 10,
      sitting: 22,
      votingNumber: 9,
      date: '2026-01-11T10:00:00',
      kind: 'ELECTRONIC',
      yes: 2,
      no: 1,
      abstain: 1,
      notParticipating: 1,
      totalVoted: 4,
      majorityVotes: 2,
      votes: [
        { MP: 1, firstName: 'A', lastName: 'One', club: 'KO', vote: 'VOTE_YES' },
        { MP: 2, firstName: 'B', lastName: 'Two', club: 'KO', vote: 'VOTE_YES' },
        { MP: 3, firstName: 'C', lastName: 'Three', club: 'PiS', vote: 'VOTE_NO' },
        { MP: 4, firstName: 'D', lastName: 'Four', club: 'PiS', vote: 'VOTE_ABSTAIN' },
      ],
    });
    expect(bundle.source_event_id).toBe('22-9');
    expect(bundle.for_count).toBe(2);
    expect(bundle.against_count).toBe(1);
    expect(bundle.abstain_count).toBe(1);
    expect(bundle.groups.length).toBeGreaterThan(0);
    expect(bundle.records).toHaveLength(4);
  });
});
