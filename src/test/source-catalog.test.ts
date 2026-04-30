import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogPath = path.join(repoRoot, 'data/source-catalog/country-data-sources.json');

const EU_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
];

function walkSources(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(walkSources);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const current = typeof record.url === 'string' || typeof record.export_url === 'string' ? [record] : [];
  return current.concat(Object.values(record).flatMap(walkSources));
}

describe('country data source catalog', () => {
  it('covers every EU country with primary and pay sources', () => {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (const code of EU_COUNTRY_CODES) {
      expect(catalog.countries[code], `missing ${code}`).toBeTruthy();
      expect(catalog.countries[code].primary_sources?.length, `missing primary sources for ${code}`).toBeGreaterThan(0);
      expect(catalog.countries[code].pay_sources?.length, `missing pay sources for ${code}`).toBeGreaterThan(0);
    }
  });

  it('uses valid URLs and existing local script references', () => {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const sources = walkSources(catalog);

    expect(sources.length).toBeGreaterThan(50);
    for (const source of sources) {
      for (const field of ['url', 'export_url', 'dataset_url', 'docs_url', 'notes_url', 'open_data_url']) {
        if (typeof source[field] === 'string') {
          expect(() => new URL(source[field] as string), `${field}: ${source[field]}`).not.toThrow();
        }
      }

      if (typeof source.existing_script === 'string') {
        expect(fs.existsSync(path.join(repoRoot, source.existing_script)), source.existing_script).toBe(true);
      }
    }
  });
});
