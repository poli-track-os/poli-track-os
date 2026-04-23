import {
  candidateMatchesPolitician,
  extractWikipediaTitleFromUrl,
} from '../../supabase/functions/enrich-wikipedia/parsers.ts';

export type WikipediaIdentityRow = {
  id: string;
  name: string;
  country_code?: string | null;
  country_name: string;
  wikipedia_url: string | null;
  wikipedia_data: Record<string, unknown> | null;
  source_attribution: Record<string, unknown> | null;
  photo_url?: string | null;
  data_source?: string | null;
  external_id?: string | null;
  source_url?: string | null;
};

export type WikipediaIdentityMismatch = {
  id: string;
  name: string;
  countryCode: string | null;
  wikipediaUrl: string;
  wikiTitle: string;
  candidateNames: string[];
};

export type DuplicateWikipediaUrlConflict = {
  wikipediaUrl: string;
  wikiTitle: string | null;
  surnames: string[];
  matchedRows: WikipediaIdentityRow[];
  mismatchedRows: WikipediaIdentityRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSurname(value: string) {
  const tokens = fold(value).split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] || null;
}

function getWikipediaCategories(wikipediaData: Record<string, unknown> | null) {
  const raw = wikipediaData?.categories;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string');
}

function getSourceAttributionAlternateNames(sourceAttribution: Record<string, unknown> | null) {
  if (!isRecord(sourceAttribution)) return [];
  const names: string[] = [];

  for (const value of Object.values(sourceAttribution)) {
    if (!isRecord(value) || !Array.isArray(value.alternate_names)) continue;
    for (const entry of value.alternate_names) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed) names.push(trimmed);
    }
  }

  return [...new Set(names)];
}

export function getCandidateNamesForWikipediaIdentity(row: WikipediaIdentityRow) {
  return [...new Set([row.name, ...getSourceAttributionAlternateNames(row.source_attribution)].map((value) => value.trim()).filter(Boolean))];
}

export function matchesStoredWikipediaIdentity(row: WikipediaIdentityRow) {
  const wikiTitle = extractWikipediaTitleFromUrl(row.wikipedia_url);
  if (!wikiTitle) return true;
  const categories = getWikipediaCategories(row.wikipedia_data);
  const candidateNames = getCandidateNamesForWikipediaIdentity(row);
  return candidateNames.some((name) =>
    candidateMatchesPolitician(wikiTitle, categories, name, row.country_name),
  );
}

export function findWikipediaIdentityMismatches(rows: WikipediaIdentityRow[]) {
  return rows
    .map((row) => {
      const wikiTitle = extractWikipediaTitleFromUrl(row.wikipedia_url);
      if (!wikiTitle) return null;
      if (matchesStoredWikipediaIdentity(row)) return null;
      return {
        id: row.id,
        name: row.name,
        countryCode: row.country_code || null,
        wikipediaUrl: row.wikipedia_url!,
        wikiTitle,
        candidateNames: getCandidateNamesForWikipediaIdentity(row),
      } satisfies WikipediaIdentityMismatch;
    })
    .filter((row): row is WikipediaIdentityMismatch => Boolean(row));
}

export function findDuplicateWikipediaUrlConflicts(rows: WikipediaIdentityRow[]) {
  const byWikipediaUrl = new Map<string, WikipediaIdentityRow[]>();

  for (const row of rows) {
    const wikipediaUrl = row.wikipedia_url?.trim();
    if (!wikipediaUrl) continue;
    const group = byWikipediaUrl.get(wikipediaUrl);
    if (group) {
      group.push(row);
    } else {
      byWikipediaUrl.set(wikipediaUrl, [row]);
    }
  }

  const conflicts: DuplicateWikipediaUrlConflict[] = [];
  for (const [wikipediaUrl, group] of byWikipediaUrl.entries()) {
    if (group.length < 2) continue;

    const uniqueNames = new Set(group.map((row) => fold(row.name)).filter(Boolean));
    if (uniqueNames.size < 2) continue;

    const surnames = [...new Set(group.map((row) => getSurname(row.name)).filter((value): value is string => Boolean(value)))];
    if (surnames.length < 2) continue;

    const matchedRows = group.filter((row) => matchesStoredWikipediaIdentity(row));
    const mismatchedRows = group.filter((row) => !matchesStoredWikipediaIdentity(row));
    if (mismatchedRows.length === 0) continue;

    conflicts.push({
      wikipediaUrl,
      wikiTitle: extractWikipediaTitleFromUrl(wikipediaUrl),
      surnames,
      matchedRows,
      mismatchedRows,
    });
  }

  return conflicts.sort((left, right) => left.wikipediaUrl.localeCompare(right.wikipediaUrl));
}

export function getDuplicateWikipediaRowsToClear(conflicts: DuplicateWikipediaUrlConflict[]) {
  return conflicts
    .filter((conflict) => conflict.matchedRows.length === 1 && conflict.mismatchedRows.length >= 1)
    .flatMap((conflict) => conflict.mismatchedRows);
}

export function isWikipediaHostedImage(url: string | null | undefined) {
  if (!url) return false;
  return /wikipedia\.org|wikimedia\.org/i.test(url);
}
