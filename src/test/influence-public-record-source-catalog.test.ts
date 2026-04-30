import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const worldCatalogPath = path.join(repoRoot, 'data/source-catalog/world-country-data-sources.json');
const influenceCatalogPath = path.join(repoRoot, 'data/source-catalog/influence-public-record-sources.json');

function walkSources(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(walkSources);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const current = typeof record.url === 'string' || typeof record.api_url === 'string' || typeof record.api_url_template === 'string' ? [record] : [];
  return current.concat(Object.values(record).flatMap(walkSources));
}

describe('influence public-record source catalog', () => {
  it('covers every country from the world source catalog', () => {
    const world = JSON.parse(fs.readFileSync(worldCatalogPath, 'utf8'));
    const catalog = JSON.parse(fs.readFileSync(influenceCatalogPath, 'utf8'));
    const worldCodes = Object.keys(world.countries).sort();
    const influenceCodes = Object.keys(catalog.countries).sort();

    expect(influenceCodes).toEqual(worldCodes);
    expect(influenceCodes.length).toBeGreaterThan(190);
  });

  it('registers the requested US public-record families', () => {
    const catalog = JSON.parse(fs.readFileSync(influenceCatalogPath, 'utf8'));
    const us = catalog.countries.US;

    expect(us.coverage_level).toBe('us_federal_public_records');
    expect(us.source_keys).toEqual(expect.arrayContaining([
      'us_fec',
      'us_fec_committee',
      'us_fec_contribution',
      'us_fec_bulk_contribution',
      'us_lda',
      'us_fara',
      'sec_edgar',
      'sec_edgar_companyfacts',
      'usaspending',
      'us_foia',
      'us_foia_annual_report',
      'us_pcast',
    ]));
  });

  it('registers EU lobbying and advisory equivalents for every EU member state', () => {
    const catalog = JSON.parse(fs.readFileSync(influenceCatalogPath, 'utf8'));
    const euCodes = [
      'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
      'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
    ];

    for (const code of euCodes) {
      expect(catalog.countries[code].coverage_level, code).toBe('eu_institutional_public_records');
      expect(catalog.countries[code].source_keys, code).toEqual(expect.arrayContaining([
        'eu_transparency_register',
        'lobbyfacts',
        'eu_expert_groups',
        'eu_chief_scientific_advisors',
        'eu_ege',
      ]));
    }
  });

  it('marks China, Russia, and Middle East priorities as foreign-principal global-reference coverage', () => {
    const catalog = JSON.parse(fs.readFileSync(influenceCatalogPath, 'utf8'));
    for (const code of ['CN', 'RU', 'AE', 'IL', 'IR', 'SA', 'TR']) {
      expect(catalog.countries[code].coverage_level, code).toBe('priority_foreign_principal_global_references');
      expect(catalog.countries[code].source_keys, code).toEqual(expect.arrayContaining([
        'opencorporates',
        'opensanctions',
        'wikidata',
      ]));
    }
  });

  it('uses valid source URLs and existing local scripts', () => {
    const catalog = JSON.parse(fs.readFileSync(influenceCatalogPath, 'utf8'));
    const sources = walkSources(catalog.source_definitions);

    expect(sources.length).toBeGreaterThan(10);
    for (const source of sources) {
      for (const field of ['url', 'api_url', 'source_url', 'members_url']) {
        if (typeof source[field] === 'string') {
          expect(() => new URL(source[field] as string), `${field}: ${source[field]}`).not.toThrow();
        }
      }

      if (typeof source.api_url_template === 'string') {
        const concrete = (source.api_url_template as string)
          .replace('{cycle}', '2026')
          .replace('{cik10}', '0000320193')
          .replace('{group_id}', '3280');
        expect(() => new URL(concrete), `api_url_template: ${source.api_url_template}`).not.toThrow();
      }

      if (typeof source.existing_script === 'string') {
        expect(fs.existsSync(path.join(repoRoot, source.existing_script)), source.existing_script).toBe(true);
      }
    }
  });
});
