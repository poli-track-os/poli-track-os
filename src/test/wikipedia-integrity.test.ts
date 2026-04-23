import {
  findDuplicateWikipediaUrlConflicts,
  findWikipediaIdentityMismatches,
  getDuplicateWikipediaRowsToClear,
  matchesStoredWikipediaIdentity,
  type WikipediaIdentityRow,
} from '@/lib/wikipedia-integrity';

function makeRow(overrides: Partial<WikipediaIdentityRow>): WikipediaIdentityRow {
  return {
    id: 'row-1',
    name: 'Example Person',
    country_code: 'GR',
    country_name: 'Greece',
    wikipedia_url: 'https://en.wikipedia.org/wiki/Example_Person',
    wikipedia_data: {
      categories: ['Greek politicians', 'MEPs for Greece 2024–2029'],
    },
    source_attribution: null,
    ...overrides,
  };
}

describe('wikipedia-integrity helpers', () => {
  it('flags stored Wikipedia identities that no longer match the row identity', () => {
    const mismatches = findWikipediaIdentityMismatches([
      makeRow({
        name: 'Konstantinos ARVANITIS',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Konstantinos_Papadakis_(politician)',
        wikipedia_data: {
          categories: ['Communist Party of Greece MEPs', 'Greek MEP stubs', 'MEPs for Greece 2024–2029'],
        },
      }),
    ]);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.wikiTitle).toBe('Konstantinos_Papadakis_(politician)');
  });

  it('recognizes the correct row inside a duplicate Wikipedia collision and only clears the wrong row', () => {
    const rows = [
      makeRow({
        id: 'wrong-row',
        name: 'Konstantinos ARVANITIS',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Konstantinos_Papadakis_(politician)',
        wikipedia_data: {
          categories: ['Communist Party of Greece MEPs', 'Greek MEP stubs', 'MEPs for Greece 2024–2029'],
        },
      }),
      makeRow({
        id: 'right-row',
        name: 'Kostas PAPADAKIS',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Konstantinos_Papadakis_(politician)',
        wikipedia_data: {
          categories: ['Communist Party of Greece MEPs', 'Greek MEP stubs', 'MEPs for Greece 2024–2029'],
        },
      }),
    ];

    expect(matchesStoredWikipediaIdentity(rows[0]!)).toBe(false);
    expect(matchesStoredWikipediaIdentity(rows[1]!)).toBe(true);

    const conflicts = findDuplicateWikipediaUrlConflicts(rows);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.matchedRows.map((row) => row.id)).toEqual(['right-row']);
    expect(conflicts[0]?.mismatchedRows.map((row) => row.id)).toEqual(['wrong-row']);
    expect(getDuplicateWikipediaRowsToClear(conflicts).map((row) => row.id)).toEqual(['wrong-row']);
  });
});
