import type { Tables } from '@/integrations/supabase/types';
import { slugifyPartyName } from '@/lib/party-summary';

export const COVERAGE_FIELDS = [
  { key: 'biography', label: 'Biography', shortLabel: 'BIO' },
  { key: 'photo', label: 'Photo', shortLabel: 'PHOTO' },
  { key: 'wikipedia', label: 'Wikipedia', shortLabel: 'WIKI' },
  { key: 'enriched', label: 'Enriched', shortLabel: 'ENR' },
  { key: 'finances', label: 'Finances', shortLabel: 'FIN' },
  { key: 'investments', label: 'Investments', shortLabel: 'INV' },
  { key: 'positions', label: 'Positions', shortLabel: 'POS' },
  { key: 'birthYear', label: 'Birth Year', shortLabel: 'BIRTH' },
  { key: 'twitter', label: 'Twitter / X', shortLabel: 'X' },
] as const;

export type CoverageFieldKey = typeof COVERAGE_FIELDS[number]['key'];

export type CoverageFieldMap = Record<CoverageFieldKey, boolean>;
export type CoverageFieldRates = Record<CoverageFieldKey, number>;

export type CoveragePoliticianRow = Pick<
  Tables<'politicians'>,
  | 'id'
  | 'name'
  | 'role'
  | 'country_code'
  | 'country_name'
  | 'party_name'
  | 'party_abbreviation'
  | 'biography'
  | 'photo_url'
  | 'wikipedia_url'
  | 'wikipedia_summary'
  | 'wikipedia_image_url'
  | 'enriched_at'
  | 'birth_year'
  | 'twitter_handle'
>;

export type CoveragePersonRow = {
  id: string;
  name: string;
  role: string;
  countryCode: string;
  countryName: string;
  partyName: string;
  partySlug: string;
  partyAbbreviation: string | null;
  entityLink: string;
  partyLink: string;
  countryLink: string;
  presentCount: number;
  missingCount: number;
  completeness: number;
  fieldStatus: CoverageFieldMap;
  presentFields: string[];
  missingFields: string[];
  searchText: string;
};

export type CoverageAggregateRow = {
  id: string;
  name: string;
  subtitle: string;
  entityLink: string;
  members: number;
  presentCount: number;
  missingCount: number;
  completeness: number;
  fullyCoveredMembers: number;
  membersWithGaps: number;
  fieldRates: CoverageFieldRates;
  biggestGaps: string[];
  searchText: string;
};

export type CoverageSummary = {
  totalPeople: number;
  trackedFields: number;
  fullyCoveredPeople: number;
  peopleWithGaps: number;
  criticalGaps: number;
  averageCompleteness: number;
  fieldCoverage: Array<{
    key: CoverageFieldKey;
    label: string;
    shortLabel: string;
    presentCount: number;
    missingCount: number;
    presentRate: number;
  }>;
};

export type CoverageModel = {
  summary: CoverageSummary;
  people: CoveragePersonRow[];
  parties: CoverageAggregateRow[];
  countries: CoverageAggregateRow[];
};

type AggregateBucket = {
  id: string;
  name: string;
  subtitle: string;
  entityLink: string;
  searchText: string;
  members: CoveragePersonRow[];
};

type BuildCoverageModelArgs = {
  politicians: CoveragePoliticianRow[];
  financeIds: Set<string>;
  investmentIds: Set<string>;
  positionIds: Set<string>;
};

function toPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function getPartyDisplayName(row: CoveragePoliticianRow) {
  return row.party_name?.trim() || row.party_abbreviation?.trim() || 'Independent / unaligned';
}

function buildFieldStatus(
  row: CoveragePoliticianRow,
  financeIds: Set<string>,
  investmentIds: Set<string>,
  positionIds: Set<string>,
): CoverageFieldMap {
  return {
    biography: Boolean(row.biography || row.wikipedia_summary),
    photo: Boolean(row.photo_url || row.wikipedia_image_url),
    wikipedia: Boolean(row.wikipedia_url),
    enriched: Boolean(row.enriched_at),
    finances: financeIds.has(row.id),
    investments: investmentIds.has(row.id),
    positions: positionIds.has(row.id),
    birthYear: Boolean(row.birth_year),
    twitter: Boolean(row.twitter_handle),
  };
}

function buildEmptyFieldRates(): CoverageFieldRates {
  return {
    biography: 0,
    photo: 0,
    wikipedia: 0,
    enriched: 0,
    finances: 0,
    investments: 0,
    positions: 0,
    birthYear: 0,
    twitter: 0,
  };
}

function buildPeopleCoverage({
  politicians,
  financeIds,
  investmentIds,
  positionIds,
}: BuildCoverageModelArgs): CoveragePersonRow[] {
  return politicians
    .map((row) => {
      const fieldStatus = buildFieldStatus(row, financeIds, investmentIds, positionIds);
      const presentFields = COVERAGE_FIELDS.filter((field) => fieldStatus[field.key]).map((field) => field.label);
      const missingFields = COVERAGE_FIELDS.filter((field) => !fieldStatus[field.key]).map((field) => field.label);
      const presentCount = presentFields.length;
      const missingCount = missingFields.length;
      const completeness = toPercent(presentCount, COVERAGE_FIELDS.length);
      const countryCode = row.country_code.toUpperCase();
      const countryName = row.country_name || countryCode;
      const partyName = getPartyDisplayName(row);
      const partySlug = slugifyPartyName(partyName);
      const role = row.role?.trim() || 'Role unavailable';
      const countryRouteId = row.country_code.toLowerCase();

      return {
        id: row.id,
        name: row.name,
        role,
        countryCode,
        countryName,
        partyName,
        partySlug,
        partyAbbreviation: row.party_abbreviation,
        entityLink: `/actors/${row.id}`,
        partyLink: `/country/${countryRouteId}/party/${partySlug}`,
        countryLink: `/country/${countryRouteId}`,
        presentCount,
        missingCount,
        completeness,
        fieldStatus,
        presentFields,
        missingFields,
        searchText: [
          row.name,
          role,
          countryCode,
          countryName,
          partyName,
          row.party_abbreviation || '',
        ]
          .join(' ')
          .toLowerCase(),
      };
    })
    .sort(
      (left, right) =>
        left.completeness - right.completeness ||
        right.missingCount - left.missingCount ||
        left.name.localeCompare(right.name),
    );
}

function buildAggregateCoverage(
  buckets: Map<string, AggregateBucket>,
): CoverageAggregateRow[] {
  return [...buckets.values()]
    .map((bucket) => {
      const fieldCounts = buildEmptyFieldRates();
      let presentCount = 0;
      let fullyCoveredMembers = 0;

      for (const member of bucket.members) {
        presentCount += member.presentCount;
        if (member.missingCount === 0) fullyCoveredMembers += 1;
        for (const field of COVERAGE_FIELDS) {
          if (member.fieldStatus[field.key]) {
            fieldCounts[field.key] += 1;
          }
        }
      }

      const members = bucket.members.length;
      const totalSlots = members * COVERAGE_FIELDS.length;
      const fieldRates = buildEmptyFieldRates();
      for (const field of COVERAGE_FIELDS) {
        fieldRates[field.key] = toPercent(fieldCounts[field.key], members);
      }

      const biggestGaps = COVERAGE_FIELDS
        .map((field) => ({
          label: field.label,
          rate: fieldRates[field.key],
        }))
        .sort((left, right) => left.rate - right.rate || left.label.localeCompare(right.label))
        .slice(0, 3)
        .map((field) => `${field.label} ${field.rate}%`);

      return {
        id: bucket.id,
        name: bucket.name,
        subtitle: bucket.subtitle,
        entityLink: bucket.entityLink,
        members,
        presentCount,
        missingCount: totalSlots - presentCount,
        completeness: toPercent(presentCount, totalSlots),
        fullyCoveredMembers,
        membersWithGaps: members - fullyCoveredMembers,
        fieldRates,
        biggestGaps,
        searchText: bucket.searchText,
      };
    })
    .sort(
      (left, right) =>
        left.completeness - right.completeness ||
        right.membersWithGaps - left.membersWithGaps ||
        right.members - left.members ||
        left.name.localeCompare(right.name),
    );
}

export function buildCoverageModel({
  politicians,
  financeIds,
  investmentIds,
  positionIds,
}: BuildCoverageModelArgs): CoverageModel {
  const people = buildPeopleCoverage({
    politicians,
    financeIds,
    investmentIds,
    positionIds,
  });

  const countryBuckets = new Map<string, AggregateBucket>();
  const partyBuckets = new Map<string, AggregateBucket>();

  for (const person of people) {
    if (!countryBuckets.has(person.countryCode)) {
      countryBuckets.set(person.countryCode, {
        id: person.countryCode,
        name: person.countryName,
        subtitle: person.countryCode,
        entityLink: person.countryLink,
        searchText: `${person.countryCode} ${person.countryName}`.toLowerCase(),
        members: [],
      });
    }
    countryBuckets.get(person.countryCode)?.members.push(person);

    const partyKey = `${person.countryCode}::${person.partySlug}`;
    if (!partyBuckets.has(partyKey)) {
      partyBuckets.set(partyKey, {
        id: partyKey,
        name: person.partyName,
        subtitle: `${person.countryName} (${person.countryCode})`,
        entityLink: person.partyLink,
        searchText: `${person.partyName} ${person.partyAbbreviation || ''} ${person.countryName} ${person.countryCode}`.toLowerCase(),
        members: [],
      });
    }
    partyBuckets.get(partyKey)?.members.push(person);
  }

  const parties = buildAggregateCoverage(partyBuckets);
  const countries = buildAggregateCoverage(countryBuckets);
  const fullyCoveredPeople = people.filter((person) => person.missingCount === 0).length;
  const fieldCoverage = COVERAGE_FIELDS.map((field) => {
    const presentCount = people.filter((person) => person.fieldStatus[field.key]).length;
    return {
      key: field.key,
      label: field.label,
      shortLabel: field.shortLabel,
      presentCount,
      missingCount: people.length - presentCount,
      presentRate: toPercent(presentCount, people.length),
    };
  }).sort((left, right) => left.presentRate - right.presentRate || left.label.localeCompare(right.label));

  return {
    summary: {
      totalPeople: people.length,
      trackedFields: COVERAGE_FIELDS.length,
      fullyCoveredPeople,
      peopleWithGaps: people.length - fullyCoveredPeople,
      criticalGaps: people.filter((person) => person.presentCount <= 3).length,
      averageCompleteness: toPercent(
        people.reduce((sum, person) => sum + person.presentCount, 0),
        people.length * COVERAGE_FIELDS.length,
      ),
      fieldCoverage,
    },
    people,
    parties,
    countries,
  };
}
