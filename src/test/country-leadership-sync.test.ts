import { describe, expect, it } from 'vitest';
import {
  buildCountryLeadershipMatchIndexes,
  buildCountryLeadershipMutationPlan,
  buildCountryLeadershipSeeds,
  getCountryLeadershipMatch,
} from '../lib/country-leadership-sync';

describe('country leadership sync helpers', () => {
  it('extracts head-of-state and head-of-government seeds from country metadata', () => {
    const seeds = buildCountryLeadershipSeeds({
      country_code: 'PT',
      country_name: 'Portugal',
      head_of_state: 'António José Seguro',
      head_of_government: 'Luís Montenegro',
      officeholders: [
        {
          office: 'Head of State',
          personName: 'António José Seguro',
          personEntityId: 'Q1580316',
          personUrl: 'https://en.wikipedia.org/wiki/Ant%C3%B3nio_Jos%C3%A9_Seguro',
        },
        {
          office: 'Head of Government',
          personName: 'Luís Montenegro',
          personEntityId: 'Q11764394',
          personUrl: 'https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro',
        },
      ],
    });

    expect(seeds).toHaveLength(2);
    expect(seeds.map((seed) => seed.office)).toEqual(['Head of State', 'Head of Government']);
    expect(seeds[0].personEntityId).toBe('Q1580316');
    expect(seeds[1].personUrl).toContain('Lu%C3%ADs_Montenegro');
  });

  it('matches existing politicians by raw or prefixed wikidata external ids', () => {
    const seed = buildCountryLeadershipSeeds({
      country_code: 'PT',
      country_name: 'Portugal',
      head_of_state: 'António José Seguro',
      head_of_government: 'Luís Montenegro',
      officeholders: [
        {
          office: 'Head of Government',
          personName: 'Luís Montenegro',
          personEntityId: 'Q11764394',
          personUrl: 'https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro',
        },
      ],
    })[1];

    const indexes = buildCountryLeadershipMatchIndexes([
      {
        id: 'actor-1',
        country_code: 'PT',
        name: 'Luís Montenegro',
        role: 'Member of Parliament',
        data_source: 'wikipedia',
        external_id: 'wikidata:Q11764394',
        source_attribution: null,
        source_url: null,
        wikipedia_url: 'https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro',
      },
    ]);

    const match = getCountryLeadershipMatch(indexes, seed);
    expect(match.matchedBy).toBe('external_id');
    expect(match.row?.id).toBe('actor-1');
  });

  it('builds insert payloads with leadership provenance and Wikipedia enrichment inputs', () => {
    const seed = buildCountryLeadershipSeeds({
      country_code: 'PT',
      country_name: 'Portugal',
      head_of_state: 'António José Seguro',
      head_of_government: 'Luís Montenegro',
      officeholders: [
        {
          office: 'Head of Government',
          personName: 'Luís Montenegro',
          personEntityId: 'Q11764394',
          personUrl: 'https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro',
        },
      ],
    })[1];

    const plan = buildCountryLeadershipMutationPlan(null, seed, 'none');
    expect(plan.action).toBe('insert');
    expect(plan.payload.role).toBe('Head of Government');
    expect(plan.payload.external_id).toBe('Q11764394');
    expect(plan.payload.wikipedia_url).toBe('https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro');
    expect((plan.payload.source_attribution as Record<string, unknown>)._country_leadership).toBeDefined();
  });

  it('preserves official provenance when annotating an existing actor row', () => {
    const seed = buildCountryLeadershipSeeds({
      country_code: 'PT',
      country_name: 'Portugal',
      head_of_state: 'António José Seguro',
      head_of_government: 'Luís Montenegro',
      officeholders: [
        {
          office: 'Head of Government',
          personName: 'Luís Montenegro',
          personEntityId: 'Q11764394',
          personUrl: 'https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro',
        },
      ],
    })[1];

    const plan = buildCountryLeadershipMutationPlan({
      id: 'actor-2',
      country_code: 'PT',
      name: 'Luís Montenegro',
      role: 'Member of Parliament',
      data_source: 'official_record',
      external_id: null,
      source_attribution: null,
      source_url: 'https://www.parlamento.pt/DeputadoPT',
      wikipedia_url: null,
    }, seed, 'name');

    expect(plan.action).toBe('update');
    expect(plan.payload.data_source).toBeUndefined();
    expect(plan.payload.source_url).toBeUndefined();
    expect(plan.payload.wikipedia_url).toBe('https://en.wikipedia.org/wiki/Lu%C3%ADs_Montenegro');
    expect(plan.payload.role).toBe('Head of Government');
    expect((plan.payload.source_attribution as Record<string, unknown>)._country_leadership).toBeDefined();
  });
});
