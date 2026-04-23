import { getLeadershipPriority, normalizePersonName } from './country-leadership.ts';

export const COUNTRY_LEADERSHIP_SOURCE_TYPE = 'wikipedia';
const COUNTRY_LEADERSHIP_SOURCE_LABEL = 'Country leadership metadata';

export type CountryLeadershipOfficeholder = {
  office: string;
  personName: string;
  personEntityId?: string | null;
  personUrl?: string | null;
};

export type CountryLeadershipMetadataRow = {
  country_code: string;
  country_name: string;
  head_of_state: string | null;
  head_of_government: string | null;
  officeholders: CountryLeadershipOfficeholder[] | null;
};

export type ExistingLeadershipPoliticianRow = {
  id: string;
  country_code: string;
  name: string;
  role: string | null;
  data_source: string | null;
  external_id: string | null;
  source_attribution: Record<string, unknown> | null;
  source_url: string | null;
  wikipedia_url: string | null;
};

export type CountryLeadershipSeed = {
  countryCode: string;
  countryName: string;
  office: 'Head of State' | 'Head of Government';
  personName: string;
  personEntityId?: string;
  personUrl?: string;
  recordId: string;
};

export type CountryLeadershipMutationPlan = {
  action: 'insert' | 'update';
  politicianId: string | null;
  seed: CountryLeadershipSeed;
  payload: Record<string, unknown>;
  changedFields: string[];
  matchedBy: 'external_id' | 'source_attribution' | 'person_url' | 'name' | 'none';
};

type LeadershipMatchIndexes = {
  byExternalId: Map<string, ExistingLeadershipPoliticianRow>;
  byPersonUrl: Map<string, ExistingLeadershipPoliticianRow>;
  bySourceRecordId: Map<string, ExistingLeadershipPoliticianRow>;
  byCountryName: Map<string, ExistingLeadershipPoliticianRow[]>;
};

function getOfficialRecordAlternateNames(row: ExistingLeadershipPoliticianRow) {
  const officialBlock = row.source_attribution?._official_record;
  if (!isRecord(officialBlock) || !Array.isArray(officialBlock.alternate_names)) return [];
  return officialBlock.alternate_names
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizePersonName(value))
    .filter(Boolean);
}

function rowSupportsLeadershipIdentity(row: ExistingLeadershipPoliticianRow, seed: CountryLeadershipSeed) {
  const targetName = normalizePersonName(seed.personName);
  const officialNames = getOfficialRecordAlternateNames(row);
  if (officialNames.length > 0) {
    return officialNames.includes(targetName);
  }
  return normalizePersonName(row.name) === targetName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.trim() || null;
  }
}

function normalizeExternalId(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^wikidata:/i, '');
}

function buildCountryNameKey(countryCode: string, personName: string) {
  return `${countryCode.toUpperCase()}::${normalizePersonName(personName)}`;
}

function buildSeedRecordId(countryCode: string, office: CountryLeadershipSeed['office'], personEntityId: string | undefined, personName: string) {
  const officeKey = office.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `country_leadership:${countryCode.toUpperCase()}:${officeKey}:${personEntityId || normalizePersonName(personName)}`;
}

function findOfficeholder(
  officeholders: CountryLeadershipOfficeholder[],
  office: CountryLeadershipSeed['office'],
  fallbackName: string | null,
) {
  const exactOffice = officeholders.find((entry) => entry.office.trim().toLowerCase() === office.toLowerCase());
  if (exactOffice) return exactOffice;
  if (!fallbackName) return null;
  const normalizedFallback = normalizePersonName(fallbackName);
  return officeholders.find((entry) => normalizePersonName(entry.personName) === normalizedFallback) || null;
}

function toSeed(
  countryCode: string,
  countryName: string,
  office: CountryLeadershipSeed['office'],
  personName: string | null,
  officeholders: CountryLeadershipOfficeholder[],
) {
  const resolvedName = personName?.trim();
  if (!resolvedName) return null;
  const officeholder = findOfficeholder(officeholders, office, resolvedName);
  const finalName = officeholder?.personName?.trim() || resolvedName;
  const personEntityId = officeholder?.personEntityId?.trim() || undefined;
  const personUrl = normalizeUrl(officeholder?.personUrl || undefined) || undefined;
  return {
    countryCode,
    countryName,
    office,
    personName: finalName,
    personEntityId,
    personUrl,
    recordId: buildSeedRecordId(countryCode, office, personEntityId, finalName),
  } satisfies CountryLeadershipSeed;
}

export function buildCountryLeadershipSeeds(row: CountryLeadershipMetadataRow) {
  const officeholders = Array.isArray(row.officeholders) ? row.officeholders : [];
  const seeds: CountryLeadershipSeed[] = [];

  for (const seed of [
    toSeed(row.country_code, row.country_name, 'Head of State', row.head_of_state, officeholders),
    toSeed(row.country_code, row.country_name, 'Head of Government', row.head_of_government, officeholders),
  ]) {
    if (seed) seeds.push(seed);
  }

  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = buildCountryNameKey(seed.countryCode, seed.personName);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getCountryLeadershipSourceRecordId(sourceAttribution: Record<string, unknown> | null | undefined) {
  const block = sourceAttribution?._country_leadership;
  if (!isRecord(block)) return null;
  return typeof block.record_id === 'string' ? block.record_id : null;
}

export function buildCountryLeadershipMatchIndexes(rows: ExistingLeadershipPoliticianRow[]): LeadershipMatchIndexes {
  const byExternalId = new Map<string, ExistingLeadershipPoliticianRow>();
  const byPersonUrl = new Map<string, ExistingLeadershipPoliticianRow>();
  const bySourceRecordId = new Map<string, ExistingLeadershipPoliticianRow>();
  const byCountryName = new Map<string, ExistingLeadershipPoliticianRow[]>();

  for (const row of rows) {
    const externalId = normalizeExternalId(row.external_id);
    if (externalId && !byExternalId.has(externalId)) {
      byExternalId.set(externalId, row);
    }

    for (const url of [normalizeUrl(row.wikipedia_url), normalizeUrl(row.source_url)]) {
      if (url && !byPersonUrl.has(url)) {
        byPersonUrl.set(url, row);
      }
    }

    const sourceRecordId = getCountryLeadershipSourceRecordId(row.source_attribution);
    if (sourceRecordId && !bySourceRecordId.has(sourceRecordId)) {
      bySourceRecordId.set(sourceRecordId, row);
    }

    const nameKey = buildCountryNameKey(row.country_code, row.name);
    const bucket = byCountryName.get(nameKey);
    if (bucket) bucket.push(row);
    else byCountryName.set(nameKey, [row]);
  }

  return {
    byExternalId,
    byPersonUrl,
    bySourceRecordId,
    byCountryName,
  };
}

export function getCountryLeadershipMatch(indexes: LeadershipMatchIndexes, seed: CountryLeadershipSeed) {
  const externalId = normalizeExternalId(seed.personEntityId);
  if (externalId) {
    const byExternalId = indexes.byExternalId.get(externalId);
    if (byExternalId) return { row: byExternalId, matchedBy: 'external_id' as const };
  }

  const bySourceRecordId = indexes.bySourceRecordId.get(seed.recordId);
  if (bySourceRecordId && rowSupportsLeadershipIdentity(bySourceRecordId, seed)) {
    return { row: bySourceRecordId, matchedBy: 'source_attribution' as const };
  }

  const personUrl = normalizeUrl(seed.personUrl);
  if (personUrl) {
    const byPersonUrl = indexes.byPersonUrl.get(personUrl);
    if (byPersonUrl && rowSupportsLeadershipIdentity(byPersonUrl, seed)) {
      return { row: byPersonUrl, matchedBy: 'person_url' as const };
    }
  }

  const byName = (indexes.byCountryName.get(buildCountryNameKey(seed.countryCode, seed.personName)) || [])
    .filter((row) => rowSupportsLeadershipIdentity(row, seed));
  if (byName.length === 1) return { row: byName[0], matchedBy: 'name' as const };

  return { row: null, matchedBy: 'none' as const };
}

function buildSourceAttribution(
  existing: Record<string, unknown> | null | undefined,
  seed: CountryLeadershipSeed,
  fieldNames: string[],
) {
  const next: Record<string, unknown> = isRecord(existing) ? structuredClone(existing) : {};
  const fetchedAt = new Date().toISOString();
  const sourceMeta = {
    source_type: COUNTRY_LEADERSHIP_SOURCE_TYPE,
    source_label: COUNTRY_LEADERSHIP_SOURCE_LABEL,
    source_url: seed.personUrl || null,
    record_id: seed.recordId,
    fetched_at: fetchedAt,
  };

  next._country_leadership = {
    ...sourceMeta,
    country_code: seed.countryCode,
    country_name: seed.countryName,
    office: seed.office,
    person_entity_id: seed.personEntityId || null,
    person_name: seed.personName,
  };

  for (const fieldName of fieldNames) {
    next[fieldName] = sourceMeta;
  }

  return next;
}

function shouldPreferLeadershipRole(existingRole: string | null | undefined, incomingRole: string) {
  if (!existingRole) return true;
  const normalizedExisting = existingRole.trim().toLowerCase();
  if (!normalizedExisting) return true;
  if (normalizedExisting === incomingRole.toLowerCase()) return false;
  if (normalizedExisting === 'politician' || normalizedExisting === 'member of parliament' || normalizedExisting === 'member of the european parliament') {
    return true;
  }
  return getLeadershipPriority(incomingRole) > getLeadershipPriority(existingRole);
}

export function buildCountryLeadershipMutationPlan(
  existing: ExistingLeadershipPoliticianRow | null,
  seed: CountryLeadershipSeed,
  matchedBy: CountryLeadershipMutationPlan['matchedBy'],
): CountryLeadershipMutationPlan {
  const changedFields: string[] = [];
  const payload: Record<string, unknown> = {};

  const assignIfDifferent = (field: string, nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = existing ? (existing as Record<string, unknown>)[field] ?? null : null;
    if (currentValue !== nextValue) {
      payload[field] = nextValue;
      changedFields.push(field);
    }
  };

  const assignIfMissing = (field: string, nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = existing ? (existing as Record<string, unknown>)[field] ?? null : null;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      payload[field] = nextValue;
      changedFields.push(field);
    }
  };

  assignIfDifferent('name', seed.personName);
  assignIfDifferent('country_code', seed.countryCode);
  assignIfDifferent('country_name', seed.countryName);
  assignIfMissing('data_source', COUNTRY_LEADERSHIP_SOURCE_TYPE);
  assignIfMissing('source_url', seed.personUrl || null);
  assignIfMissing('wikipedia_url', seed.personUrl || null);
  assignIfDifferent('jurisdiction', 'federal');
  assignIfDifferent('continent', 'Europe');
  assignIfMissing('external_id', seed.personEntityId || null);

  if (!existing || shouldPreferLeadershipRole(existing.role, seed.office)) {
    assignIfDifferent('role', seed.office);
  }

  const attributionFields = Object.keys(payload);
  payload.source_attribution = buildSourceAttribution(existing?.source_attribution, seed, attributionFields);
  changedFields.push('source_attribution');

  if (!existing) {
    return {
      action: 'insert',
      politicianId: null,
      seed,
      payload: {
        continent: 'Europe',
        country_code: seed.countryCode,
        country_name: seed.countryName,
        data_source: COUNTRY_LEADERSHIP_SOURCE_TYPE,
        external_id: seed.personEntityId || null,
        jurisdiction: 'federal',
        name: seed.personName,
        role: seed.office,
        source_attribution: payload.source_attribution,
        source_url: seed.personUrl || null,
        wikipedia_url: seed.personUrl || null,
      },
      changedFields,
      matchedBy,
    };
  }

  return {
    action: 'update',
    politicianId: existing.id,
    seed,
    payload,
    changedFields,
    matchedBy,
  };
}
