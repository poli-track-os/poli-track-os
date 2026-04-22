import { describe, expect, it } from 'vitest';
import { EUROSTAT_GEO_NAMES, EUROSTAT_SUPPORTED_GEOS, toEurostatGeoCode } from '../lib/eurostat-geo';

describe('eurostat geo helpers', () => {
  it('keeps repo-facing geo codes on ISO values', () => {
    expect(EUROSTAT_SUPPORTED_GEOS).toContain('GR');
    expect(EUROSTAT_SUPPORTED_GEOS).toContain('EU27_2020');
    expect(EUROSTAT_SUPPORTED_GEOS).not.toContain('EL');
    expect(new Set(EUROSTAT_SUPPORTED_GEOS).size).toBe(EUROSTAT_SUPPORTED_GEOS.length);
    expect(EUROSTAT_SUPPORTED_GEOS).toHaveLength(28);
  });

  it('provides a display name for every supported geo', () => {
    expect(Object.keys(EUROSTAT_GEO_NAMES).sort()).toEqual([...EUROSTAT_SUPPORTED_GEOS].sort());
    expect(EUROSTAT_GEO_NAMES.GR).toBe('Greece');
    expect(EUROSTAT_GEO_NAMES.EU27_2020).toBe('European Union');
  });

  it('maps only the Eurostat-specific overrides at request time', () => {
    expect(toEurostatGeoCode('GR')).toBe('EL');
    expect(toEurostatGeoCode('DE')).toBe('DE');
    expect(toEurostatGeoCode('EU27_2020')).toBe('EU27_2020');
  });
});
