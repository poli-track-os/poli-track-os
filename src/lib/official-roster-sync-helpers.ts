// Pure helpers for sync-official-rosters. Lives in src/lib/ so the helpers
// can be unit-tested by vitest without TypeScript having to typecheck the
// CLI script (which imports the Supabase client and trips on overload
// inference). The CLI script imports from here.

import { normalizeNameForMatch, type OfficialRosterRecord } from './official-rosters.ts';

export const SYNC_SOURCE_TYPE = 'official_record';

export type ExistingPoliticianRow = {
  biography: string | null;
  birth_year: number | null;
  committees: string[] | null;
  id: string;
  country_code: string;
  country_name: string;
  data_source: string | null;
  enriched_at: string | null;
  external_id: string | null;
  in_office_since: string | null;
  jurisdiction: string | null;
  name: string;
  party_abbreviation: string | null;
  party_name: string | null;
  photo_url: string | null;
  role: string | null;
  source_attribution: Record<string, unknown> | null;
  source_url: string | null;
  twitter_handle: string | null;
};

export type MutationPlan = {
  action: 'insert' | 'update';
  politicianId: string | null;
  record: OfficialRosterRecord;
  payload: Record<string, unknown>;
  changedFields: string[];
  matchedBy: 'external_id' | 'source_attribution' | 'name' | 'none';
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getSourceRecordId(sourceAttribution: Record<string, unknown> | null | undefined) {
  const officialBlock = sourceAttribution?._official_record;
  if (!isRecord(officialBlock)) return null;
  return typeof officialBlock.record_id === 'string' ? officialBlock.record_id : null;
}

export function buildSourceAttribution(
  existing: Record<string, unknown> | null | undefined,
  record: OfficialRosterRecord,
  fieldNames: string[],
) {
  const next: Record<string, unknown> = isRecord(existing) ? structuredClone(existing) : {};
  const fetchedAt = new Date().toISOString();
  const sourceMeta = {
    source_type: SYNC_SOURCE_TYPE,
    source_label: record.sourceLabel,
    source_url: record.sourceUrl,
    dataset_url: record.datasetUrl,
    record_id: record.recordId,
    fetched_at: fetchedAt,
  };

  next._official_record = {
    ...sourceMeta,
    alternate_names: record.alternateNames,
    constituency: record.constituency,
    country_code: record.countryCode,
    country_name: record.countryName,
    role: record.role,
  };

  for (const fieldName of fieldNames) {
    next[fieldName] = sourceMeta;
  }

  return next;
}

export function buildNameIndexes(rows: ExistingPoliticianRow[]) {
  const byName = new Map<string, ExistingPoliticianRow[]>();
  for (const row of rows) {
    const key = normalizeNameForMatch(row.name);
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }
  return byName;
}

export type MatchIndexes = {
  byName: Map<string, ExistingPoliticianRow[]>;
  byExternalId: Map<string, ExistingPoliticianRow>;
  bySourceRecordId: Map<string, ExistingPoliticianRow>;
};

export function buildMatchIndexes(rows: ExistingPoliticianRow[]): MatchIndexes {
  const byName = buildNameIndexes(rows);
  const byExternalId = new Map<string, ExistingPoliticianRow>();
  const bySourceRecordId = new Map<string, ExistingPoliticianRow>();
  for (const row of rows) {
    if (row.external_id && !byExternalId.has(row.external_id)) {
      byExternalId.set(row.external_id, row);
    }
    const srid = getSourceRecordId(row.source_attribution);
    if (srid && !bySourceRecordId.has(srid)) {
      bySourceRecordId.set(srid, row);
    }
  }
  return { byName, byExternalId, bySourceRecordId };
}

export function getMatch(indexes: MatchIndexes, record: OfficialRosterRecord) {
  const byExternalId = indexes.byExternalId.get(record.recordId);
  if (byExternalId) return { row: byExternalId, matchedBy: 'external_id' as const };

  const bySourceAttribution = indexes.bySourceRecordId.get(record.recordId);
  if (bySourceAttribution) return { row: bySourceAttribution, matchedBy: 'source_attribution' as const };

  const candidateNames = [
    ...new Set(
      [record.name, ...record.alternateNames]
        .map((value) => normalizeNameForMatch(value))
        .filter(Boolean),
    ),
  ];
  const matchingRows = new Map<string, ExistingPoliticianRow>();
  for (const candidateName of candidateNames) {
    const matchesByName = indexes.byName.get(candidateName) || [];
    for (const match of matchesByName) {
      matchingRows.set(match.id, match);
    }
  }

  if (matchingRows.size === 1) {
    return { row: [...matchingRows.values()][0], matchedBy: 'name' as const };
  }

  return { row: null, matchedBy: 'none' as const };
}

export function buildMutationPlan(
  existing: ExistingPoliticianRow | null,
  record: OfficialRosterRecord,
  matchedBy: MutationPlan['matchedBy'],
): MutationPlan {
  const changedFields: string[] = [];
  const payload: Record<string, unknown> = {};

  const areEqual = (left: unknown, right: unknown) => {
    if (Array.isArray(left) || Array.isArray(right)) {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    }
    return left === right;
  };

  const assignIfDifferent = (field: string, nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = existing ? (existing as Record<string, unknown>)[field] ?? null : null;
    if (!areEqual(currentValue, nextValue)) {
      payload[field] = nextValue;
      changedFields.push(field);
    }
  };

  const assignIfMissing = (field: string, nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = existing ? (existing as Record<string, unknown>)[field] ?? null : null;
    const isMissing = currentValue === null
      || currentValue === undefined
      || currentValue === ''
      || (Array.isArray(currentValue) && currentValue.length === 0);
    if (!isMissing) return;
    payload[field] = nextValue;
    changedFields.push(field);
  };

  assignIfDifferent('name', record.name);
  assignIfDifferent('party_abbreviation', record.partyAbbreviation);
  assignIfDifferent('party_name', record.partyName);
  assignIfDifferent('role', record.role);
  assignIfDifferent('jurisdiction', record.jurisdiction);
  assignIfDifferent('source_url', record.sourceUrl);
  assignIfDifferent('data_source', SYNC_SOURCE_TYPE);
  assignIfDifferent('in_office_since', record.inOfficeSince);
  assignIfMissing('biography', record.biography);
  assignIfMissing('birth_year', record.birthYear);
  assignIfMissing('committees', record.committees.length > 0 ? record.committees : null);
  assignIfMissing('photo_url', record.photoUrl);
  assignIfMissing('twitter_handle', record.twitterHandle);

  // CRITICAL: only stamp `external_id` when we matched on a STRONG signal.
  // Name-only matches must not write the canonical recordId — a name
  // collision (e.g. two "Andreas Müller" in DE) would otherwise stamp the
  // wrong politician with the official ID and that error compounds on
  // every subsequent run.
  const allowExternalIdWrite =
    !existing?.external_id && (matchedBy === 'external_id' || matchedBy === 'source_attribution');
  if (allowExternalIdWrite) {
    payload.external_id = record.recordId;
    changedFields.push('external_id');
  }

  const hasEnrichmentSignal = Boolean(
    record.biography ||
    record.birthYear ||
    record.committees.length > 0 ||
    record.photoUrl ||
    record.twitterHandle,
  );
  if (!existing?.enriched_at && hasEnrichmentSignal) {
    payload.enriched_at = new Date().toISOString();
    changedFields.push('enriched_at');
  }

  const attributionFields = Object.keys(payload);

  payload.source_attribution = buildSourceAttribution(
    existing?.source_attribution,
    record,
    attributionFields,
  );
  changedFields.push('source_attribution');

  if (!existing) {
    return {
      action: 'insert',
      politicianId: null,
      record,
      payload: {
        continent: 'Europe',
        country_code: record.countryCode,
        country_name: record.countryName,
        data_source: SYNC_SOURCE_TYPE,
        biography: record.biography,
        birth_year: record.birthYear,
        committees: record.committees.length > 0 ? record.committees : null,
        external_id: record.recordId,
        enriched_at: hasEnrichmentSignal ? new Date().toISOString() : null,
        in_office_since: record.inOfficeSince,
        jurisdiction: record.jurisdiction,
        name: record.name,
        party_abbreviation: record.partyAbbreviation,
        party_name: record.partyName,
        photo_url: record.photoUrl,
        role: record.role,
        source_attribution: payload.source_attribution,
        source_url: record.sourceUrl,
        twitter_handle: record.twitterHandle,
      },
      changedFields,
      matchedBy,
    };
  }

  return {
    action: 'update',
    politicianId: existing.id,
    record,
    payload,
    changedFields,
    matchedBy,
  };
}
