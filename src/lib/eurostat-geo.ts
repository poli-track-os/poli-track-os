export const EUROSTAT_EU27_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
] as const;

export const EUROSTAT_SUPPORTED_GEOS = [
  ...EUROSTAT_EU27_COUNTRY_CODES,
  'EU27_2020',
] as const;

export type EurostatSupportedGeo = (typeof EUROSTAT_SUPPORTED_GEOS)[number];

export const EUROSTAT_GEO_NAMES: Record<EurostatSupportedGeo, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GR: 'Greece',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
  EU27_2020: 'European Union',
};

const EUROSTAT_GEO_OVERRIDES: Record<string, string> = {
  GR: 'EL',
};

export function toEurostatGeoCode(geo: string): string {
  return EUROSTAT_GEO_OVERRIDES[geo] || geo;
}
