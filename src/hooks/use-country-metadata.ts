import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import { countryCodeToFlagEmoji, loadCountryMetadata, type CountryMetadata, type CountryOfficeholder } from '@/lib/country-metadata-live';

type CountryMetadataRow = Tables<'country_metadata'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCountryOfficeholder(value: unknown): value is CountryOfficeholder {
  return (
    isRecord(value) &&
    typeof value.office === 'string' &&
    typeof value.personName === 'string' &&
    (value.personEntityId === undefined || typeof value.personEntityId === 'string') &&
    (value.personUrl === undefined || typeof value.personUrl === 'string')
  );
}

function parseOfficeholders(value: Json | null) {
  if (!Array.isArray(value)) return [];
  return value.reduce<CountryOfficeholder[]>((acc, entry) => {
    if (isCountryOfficeholder(entry)) {
      acc.push(entry);
    }
    return acc;
  }, []);
}

function parseCoordinates(value: Json | null): CountryMetadata['coordinates'] {
  if (!isRecord(value) || typeof value.lat !== 'number' || typeof value.lon !== 'number') {
    return undefined;
  }

  return {
    lat: value.lat,
    lon: value.lon,
  };
}

function mapStoredCountryMetadata(row: CountryMetadataRow): CountryMetadata {
  return {
    countryCode: row.country_code,
    countryName: row.country_name,
    flagEmoji: row.flag_emoji,
    entityId: row.entity_id || undefined,
    wikipediaTitle: row.wikipedia_title || undefined,
    wikipediaUrl: row.wikipedia_url || undefined,
    description: row.description || undefined,
    summary: row.summary || undefined,
    capital: row.capital || undefined,
    headOfState: row.head_of_state || undefined,
    headOfGovernment: row.head_of_government || undefined,
    population: row.population ?? undefined,
    areaKm2: row.area_km2 ?? undefined,
    coordinates: parseCoordinates(row.coordinates),
    flagImageUrl: row.flag_image_url || undefined,
    locatorMapUrl: row.locator_map_url || undefined,
    officeholders: parseOfficeholders(row.officeholders),
    sourceUpdatedAt: row.source_updated_at,
    databaseUpdatedAt: row.updated_at,
    dataSource: 'supabase',
  };
}

async function loadStoredCountryMetadata(countryCode: string) {
  const { data, error } = await supabase
    .from('country_metadata')
    .select('*')
    .eq('country_code', countryCode)
    .maybeSingle();

  if (error) throw error;
  return data ? mapStoredCountryMetadata(data) : null;
}

export type { CountryMetadata };

export function useCountryMetadata(countryCode: string | undefined, countryName: string | undefined) {
  return useQuery({
    queryKey: ['country-metadata', countryCode, countryName],
    queryFn: async () => {
      if (!countryCode || !countryName) return null;

      const normalizedCountryCode = countryCode.toUpperCase();
      let stored: CountryMetadata | null = null;

      try {
        stored = await loadStoredCountryMetadata(normalizedCountryCode);
      } catch {
        stored = null;
      }

      if (stored) return stored;

      try {
        const live = await loadCountryMetadata(normalizedCountryCode, countryName);
        return {
          ...live,
          dataSource: 'live',
        } satisfies CountryMetadata;
      } catch {
        return {
          countryCode: normalizedCountryCode,
          countryName,
          flagEmoji: countryCodeToFlagEmoji(normalizedCountryCode),
          dataSource: 'live',
        } satisfies CountryMetadata;
      }
    },
    enabled: Boolean(countryCode && countryName),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
