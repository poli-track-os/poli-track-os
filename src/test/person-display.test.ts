import { describe, expect, it } from 'vitest';
import { deriveNameFromWikipediaUrl, getDisplayPersonName, resolvePersonName } from '@/lib/person-display';

describe('person-display helpers', () => {
  it('derives a readable name from a wikipedia article url', () => {
    expect(deriveNameFromWikipediaUrl('https://en.wikipedia.org/wiki/Ant%C3%B3nio_Costa')).toBe('António Costa');
  });

  it('resolves a wikidata id to a human name when a wikipedia url is available', () => {
    expect(resolvePersonName('Q610788', 'https://en.wikipedia.org/wiki/Ant%C3%B3nio_Costa')).toBe('António Costa');
  });

  it('never exposes a raw qid as the final display label', () => {
    expect(getDisplayPersonName('Q610788')).toBe('Unresolved profile');
  });
});
