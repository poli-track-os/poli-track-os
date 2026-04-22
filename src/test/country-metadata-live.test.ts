import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCountryMetadata } from '@/lib/country-metadata-live';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('loadCountryMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles countries with only one direct leader entry without crashing', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.includes('action=wbsearchentities')) {
        return jsonResponse({
          search: [
            { id: 'Q213', label: 'Czech Republic', description: 'sovereign state in Europe' },
          ],
        });
      }

      if (url.includes('action=wbgetentities') && url.includes('ids=Q213')) {
        return jsonResponse({
          entities: {
            Q213: {
              sitelinks: {
                enwiki: { title: 'Czech_Republic' },
              },
              claims: {
                P36: [
                  {
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q1085' } } },
                  },
                ],
                P35: [
                  {
                    rank: 'normal',
                    mainsnak: { snaktype: 'value', datavalue: { value: { id: 'Q100' } } },
                  },
                ],
              },
            },
          },
        });
      }

      if (url.includes('action=wbgetentities') && url.includes('ids=Q1085%7CQ100')) {
        return jsonResponse({
          entities: {
            Q1085: {
              labels: { en: { value: 'Prague' } },
              sitelinks: { enwiki: { title: 'Prague' } },
            },
            Q100: {
              labels: { en: { value: 'Petr Pavel' } },
              sitelinks: { enwiki: { title: 'Petr_Pavel' } },
            },
          },
        });
      }

      if (url.includes('/page/summary/Czech_Republic')) {
        return jsonResponse({
          description: 'country in Central Europe',
          extract: 'Czechia is a country in Central Europe.',
          content_urls: {
            desktop: {
              page: 'https://en.wikipedia.org/wiki/Czech_Republic',
            },
          },
        });
      }

      if (url.includes('en.wikipedia.org/w/api.php') && url.includes('action=query')) {
        return jsonResponse({
          query: {
            pages: {
              '1': {
                extract: 'Czechia is a country in Central Europe.',
                fullurl: 'https://en.wikipedia.org/wiki/Czech_Republic',
              },
            },
          },
        });
      }

      if (url.startsWith('https://query.wikidata.org/sparql')) {
        return jsonResponse({
          results: {
            bindings: [],
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCountryMetadata('CZ', 'Czechia')).resolves.toMatchObject({
      countryCode: 'CZ',
      countryName: 'Czechia',
      capital: 'Prague',
      headOfState: 'Petr Pavel',
      officeholders: [
        expect.objectContaining({
          office: 'Head of State',
          personName: 'Petr Pavel',
        }),
      ],
    });
  });
});
