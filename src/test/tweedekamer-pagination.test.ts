import { describe, expect, it } from 'vitest';
import { buildTweedeKamerPageUrl, resolveTweedeKamerNextUrl } from '@/lib/tweedekamer-pagination';

describe('tweedekamer pagination helpers', () => {
  it('builds a skip-based fallback when count shows more rows but nextLink is absent', () => {
    expect(
      resolveTweedeKamerNextUrl({
        top: 200,
        pageIndex: 0,
        fetchedCount: 200,
        totalCount: 2488,
      }),
    ).toBe(buildTweedeKamerPageUrl(200, 200));
  });

  it('prefers the source nextLink when it is present', () => {
    expect(
      resolveTweedeKamerNextUrl({
        top: 200,
        pageIndex: 0,
        fetchedCount: 200,
        totalCount: 2488,
        nextLink: 'https://example.test/next',
      }),
    ).toBe('https://example.test/next');
  });
});
