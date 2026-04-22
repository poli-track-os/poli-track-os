import { describe, expect, it } from 'vitest';
import {
  buildEuParliamentBiography,
  buildEuParliamentProfileUpdate,
  parseEuParliamentCvHtml,
  parseEuParliamentHomeHtml,
} from '@/lib/eu-parliament-profile-helpers';

describe('eu parliament profile helpers', () => {
  it('parses the official home profile header, birth date, and social links', () => {
    const html = `
      <html>
        <head>
          <link rel="canonical" href="https://www.europarl.europa.eu/meps/en/12345/JANE_EXAMPLE/home" />
        </head>
        <body>
          <span class="sln-member-name">Jane Example</span>
          <h3 class="es_title-h3 mt-1 mb-1">Czechia - PIRÁTI (Czechia)</h3>
          <h3 class="es_title-h3 mt-1 sln-political-group-name">Group of the Greens/European Free Alliance</h3>
          <p class="sln-political-group-role">Member</p>
          <p>Date of birth : <time class="sln-birth-date" datetime="1993-01-14">14-01-1993</time>, <span class="sln-birth-place">Most</span></p>
          <a class="link_twitt" href="https://twitter.com/JaneExample">X</a>
          <a class="link_website" href="https://example.eu/">Website</a>
          <div class="erpl_meps-status">
            <h4 class="es_title-h4">Vice-Chair</h4>
            <a class="es_badge">Committee on Economic and Monetary Affairs</a>
          </div>
        </body>
      </html>
    `;

    const profile = parseEuParliamentHomeHtml(html);

    expect(profile).toEqual({
      canonicalUrl: 'https://www.europarl.europa.eu/meps/en/12345/JANE_EXAMPLE/home',
      countryName: 'Czechia',
      nationalParty: 'PIRÁTI',
      politicalGroup: 'Group of the Greens/European Free Alliance',
      politicalRole: 'Member',
      birthDate: '1993-01-14',
      birthYear: 1993,
      birthPlace: 'Most',
      twitterHandle: 'JaneExample',
      websiteUrl: 'https://example.eu/',
      statuses: ['Vice-Chair of Committee on Economic and Monetary Affairs'],
    });
  });

  it('parses CV sections and the updated date', () => {
    const html = `
      <html>
        <body>
          <p class="small">Updated: 08/04/2026</p>
          <div class="erpl_meps-activity">
            <h4 class="es_title-h4">Education (qualifications and diplomas)</h4>
            <ul>
              <li><strong>2012-2016</strong> : University degree</li>
            </ul>
          </div>
          <div class="erpl_meps-activity">
            <h4 class="es_title-h4">Professional career</h4>
            <ul>
              <li>2019-... : Member of the European Parliament</li>
            </ul>
          </div>
        </body>
      </html>
    `;

    expect(parseEuParliamentCvHtml(html)).toEqual({
      hasCv: true,
      sections: [
        {
          title: 'Education (qualifications and diplomas)',
          items: ['2012-2016 : University degree'],
        },
        {
          title: 'Professional career',
          items: ['2019-... : Member of the European Parliament'],
        },
      ],
      updatedAt: '2026-04-08',
    });
  });

  it('builds a safe biography and a non-clobbering update plan', () => {
    const home = parseEuParliamentHomeHtml(`
      <html>
        <head><link rel="canonical" href="https://www.europarl.europa.eu/meps/en/12345/JANE_EXAMPLE/home" /></head>
        <body>
          <h3 class="es_title-h3 mt-1 mb-1">Czechia - PIRÁTI (Czechia)</h3>
          <h3 class="sln-political-group-name">Group of the Greens/European Free Alliance</h3>
          <p class="sln-political-group-role">Member</p>
          <time class="sln-birth-date" datetime="1993-01-14"></time>
          <span class="sln-birth-place">Most</span>
          <a class="link_twitt" href="https://x.com/JaneExample"></a>
          <div class="erpl_meps-status">
            <h4>Vice-Chair</h4>
            <span class="es_badge">Committee on Economic and Monetary Affairs</span>
          </div>
        </body>
      </html>
    `);
    const cv = parseEuParliamentCvHtml(`
      <html>
        <body>
          <div class="erpl_meps-activity">
            <h4>Education (qualifications and diplomas)</h4>
            <ul><li>2012-2016 : University degree</li></ul>
          </div>
        </body>
      </html>
    `);
    const biography = buildEuParliamentBiography('Jane Example', home, cv);
    const plan = buildEuParliamentProfileUpdate({
      biography: null,
      birth_year: null,
      enriched_at: null,
      external_id: '12345',
      source_attribution: null,
      source_url: 'https://www.europarl.europa.eu/meps/en/12345',
      twitter_handle: null,
    }, biography, home, cv, '2026-04-21T00:00:00.000Z');

    expect(biography).toContain('Jane Example is a member of the European Parliament');
    expect(biography).toContain('Current parliamentary roles listed on the EP profile include Vice-Chair');
    expect(plan?.payload.birth_year).toBe(1993);
    expect(plan?.payload.twitter_handle).toBe('JaneExample');
    expect(plan?.payload.source_url).toBe('https://www.europarl.europa.eu/meps/en/12345/JANE_EXAMPLE/home');
    expect(plan?.payload.enriched_at).toBe('2026-04-21T00:00:00.000Z');
    expect(plan?.changedFields).toContain('source_attribution');
  });

  it('recognizes pages without a CV', () => {
    const html = `
      <html>
        <body>
          <h3 id="no_cv_available" class="es_title-h3">No curriculum vitae available</h3>
        </body>
      </html>
    `;

    expect(parseEuParliamentCvHtml(html)).toEqual({
      hasCv: false,
      sections: [],
      updatedAt: null,
    });
  });

  it('replaces a URL-shaped twitter_handle with the bare handle', () => {
    const home = parseEuParliamentHomeHtml(`
      <html>
        <head><link rel="canonical" href="https://www.europarl.europa.eu/meps/en/12345/JANE_EXAMPLE/home" /></head>
        <body>
          <h3 class="es_title-h3 mt-1 mb-1">Czechia - PIRÁTI (Czechia)</h3>
          <a class="link_twitt" href="https://twitter.com/JaneExample"></a>
        </body>
      </html>
    `);

    const plan = buildEuParliamentProfileUpdate({
      biography: 'Existing biography',
      birth_year: 1993,
      enriched_at: '2026-01-01T00:00:00.000Z',
      external_id: '12345',
      source_attribution: null,
      source_url: 'https://www.europarl.europa.eu/meps/en/12345',
      twitter_handle: 'https://twitter.com/JaneExample',
    }, 'Existing biography', home, { hasCv: false, sections: [], updatedAt: null }, '2026-04-21T00:00:00.000Z');

    expect(plan?.payload.twitter_handle).toBe('JaneExample');
  });
});
