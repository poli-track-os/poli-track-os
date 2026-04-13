import { useQuery } from '@tanstack/react-query';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_REST = 'https://en.wikipedia.org/api/rest_v1';

const PARTY_HINTS = [
  'political party',
  'party in',
  'party of',
  'party',
];

const LEADER_LABELS = [
  'leader',
  'leaders',
  'chairperson',
  'chairpersons',
  'chairman',
  'chairwoman',
  'president',
  'secretary-general',
  'general secretary',
  'co-leaders',
  'spokesperson',
];

const PARTY_METADATA_EXCLUSIONS = [
  'independent',
  'independent unaligned',
  'unaligned',
  'unknown',
  'non partisan',
  'nonpartisan',
];

interface WikidataSearchResult {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
  match?: {
    text?: string;
  };
}

interface WikidataClaim {
  rank?: 'preferred' | 'normal' | 'deprecated';
  mainsnak?: {
    snaktype?: string;
    datavalue?: {
      value?: unknown;
    };
  };
  qualifiers?: Record<
    string,
    Array<{
      datavalue?: {
        value?: unknown;
      };
    }>
  >;
}

interface WikidataEntity {
  labels?: {
    en?: {
      value?: string;
    };
  };
  descriptions?: {
    en?: {
      value?: string;
    };
  };
  sitelinks?: {
    enwiki?: {
      title?: string;
    };
  };
  claims?: Record<string, WikidataClaim[]>;
}

interface WikipediaSummaryResponse {
  description?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
}

interface WikipediaParseResponse {
  parse?: {
    text?: string;
  };
}

interface EntityBasic {
  label?: string;
  wikipediaUrl?: string;
}

export interface PartyPersonReference {
  entityId?: string;
  name: string;
  url?: string;
}

export interface PartyMetadata {
  countryName: string;
  description?: string;
  entityId?: string;
  foundedYear?: number;
  ideologies: string[];
  leaders: PartyPersonReference[];
  officialWebsite?: string;
  partyName: string;
  politicalPosition?: string;
  summary?: string;
  wikipediaTitle?: string;
  wikipediaUrl?: string;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function shouldFetchPartyMetadata(partyName: string) {
  const normalized = normalizeText(partyName);
  if (!normalized || normalized.length < 2) return false;
  return !PARTY_METADATA_EXCLUSIONS.includes(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildApiUrl(base: string, params: Record<string, string>) {
  return `${base}?${new URLSearchParams(params).toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function buildWikipediaUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function scorePartyResult(result: WikidataSearchResult, partyName: string, countryName: string) {
  const label = normalizeText(result.label || '');
  const target = normalizeText(partyName);
  const countryTarget = normalizeText(countryName);
  const description = normalizeText(result.description || '');
  const aliases = (result.aliases || []).map(normalizeText);
  const matchText = normalizeText(result.match?.text || '');

  let score = 0;

  if (label === target) score += 110;
  else if (aliases.includes(target)) score += 100;
  else if (matchText === target) score += 85;
  else if (label.startsWith(target) || target.startsWith(label)) score += 45;
  else if (label.includes(target) || target.includes(label)) score += 25;

  if (PARTY_HINTS.some((hint) => description.includes(normalizeText(hint)))) score += 45;
  if (countryTarget && description.includes(countryTarget)) score += 40;
  if (description.includes('disambiguation')) score -= 100;

  return score;
}

function sortClaims(claims: WikidataClaim[] | undefined, onlyCurrent = false) {
  if (!claims?.length) return [];

  return [...claims]
    .filter((claim) => claim.mainsnak?.snaktype === 'value' && claim.mainsnak?.datavalue?.value)
    .filter((claim) => !onlyCurrent || !claim.qualifiers?.P582?.length)
    .sort((left, right) => {
      const leftRank = left.rank === 'preferred' ? 0 : left.rank === 'normal' ? 1 : 2;
      const rightRank = right.rank === 'preferred' ? 0 : right.rank === 'normal' ? 1 : 2;
      return leftRank - rightRank;
    });
}

function getItemIds(entity: WikidataEntity, property: string, options?: { limit?: number; onlyCurrent?: boolean }) {
  const ids = sortClaims(entity.claims?.[property], options?.onlyCurrent)
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .map((value) => (isRecord(value) && typeof value.id === 'string' ? value.id : undefined))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(ids)).slice(0, options?.limit ?? ids.length);
}

function getStringValue(entity: WikidataEntity, property: string) {
  const value = sortClaims(entity.claims?.[property])[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : undefined;
}

function getYearValue(entity: WikidataEntity, property: string) {
  const value = sortClaims(entity.claims?.[property])[0]?.mainsnak?.datavalue?.value;
  if (!isRecord(value) || typeof value.time !== 'string') return undefined;

  const match = value.time.match(/([+-]\d{4})-/);
  if (!match) return undefined;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? Math.abs(parsed) : undefined;
}

async function searchPartyEntity(partyName: string, countryName: string) {
  const searchUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbsearchentities',
    search: partyName,
    language: 'en',
    type: 'item',
    limit: '8',
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson<{ search?: WikidataSearchResult[] }>(searchUrl);
  const results = data.search || [];

  const best = results.sort((left, right) => scorePartyResult(right, partyName, countryName) - scorePartyResult(left, partyName, countryName))[0];
  if (!best) return null;

  return scorePartyResult(best, partyName, countryName) >= 45 ? best : null;
}

async function fetchEntity(entityId: string) {
  const entityUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    ids: entityId,
    props: 'labels|descriptions|claims|sitelinks',
    languages: 'en',
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(entityUrl);
  return data.entities?.[entityId];
}

async function fetchEntityBasics(entityIds: string[]) {
  if (!entityIds.length) return {};

  const labelsUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    ids: entityIds.join('|'),
    props: 'labels|sitelinks',
    languages: 'en',
    format: 'json',
    origin: '*',
  });

  try {
    const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(labelsUrl);
    const entities: Record<string, EntityBasic> = {};

    for (const entityId of entityIds) {
      const entity = data.entities?.[entityId];
      const title = entity?.sitelinks?.enwiki?.title;
      entities[entityId] = {
        label: entity?.labels?.en?.value,
        wikipediaUrl: title ? buildWikipediaUrl(title) : undefined,
      };
    }

    return entities;
  } catch {
    return {};
  }
}

async function fetchWikipediaSummary(title: string) {
  const summaryUrl = `${WIKIPEDIA_REST}/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;

  try {
    return await fetchJson<WikipediaSummaryResponse>(summaryUrl);
  } catch {
    return null;
  }
}

function extractInfoboxLeaders(html: string) {
  if (!html || typeof DOMParser === 'undefined') return [];

  const document = new DOMParser().parseFromString(html, 'text/html');
  const infoboxRows = Array.from(document.querySelectorAll('.infobox tr'));

  const leaderRow = infoboxRows.find((row) => {
    const header = row.querySelector('th');
    const label = header?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
    return LEADER_LABELS.some((candidate) => label === candidate || label.includes(candidate));
  });

  if (!leaderRow) return [];

  const anchors = Array.from(leaderRow.querySelectorAll('td a'))
    .map((anchor) => {
      const name = anchor.textContent?.replace(/\s+/g, ' ').trim();
      const href = anchor.getAttribute('href');
      if (!name) return null;

      return {
        name,
        url: href?.startsWith('/wiki/') ? `https://en.wikipedia.org${href}` : href || undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.name));

  const seen = new Set<string>();
  return anchors.filter((entry) => {
    const key = normalizeText(entry.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

async function fetchWikipediaLeaderFallback(title: string) {
  const parseUrl = buildApiUrl(WIKIPEDIA_API, {
    action: 'parse',
    page: title,
    prop: 'text',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });

  try {
    const data = await fetchJson<WikipediaParseResponse>(parseUrl);
    return extractInfoboxLeaders(data.parse?.text || '');
  } catch {
    return [];
  }
}

export async function loadPartyMetadata(partyName: string, countryName: string): Promise<PartyMetadata> {
  const fallback: PartyMetadata = {
    countryName,
    ideologies: [],
    leaders: [],
    partyName,
  };

  const match = await searchPartyEntity(partyName, countryName);
  if (!match?.id) return fallback;

  const entity = await fetchEntity(match.id);
  if (!entity) return fallback;

  const wikipediaTitle = entity.sitelinks?.enwiki?.title || match.label;
  const leaderIds = getItemIds(entity, 'P488', { onlyCurrent: true, limit: 3 });
  const ideologyIds = getItemIds(entity, 'P1142', { limit: 4 });
  const positionIds = getItemIds(entity, 'P1387', { limit: 1 });
  const basics = await fetchEntityBasics([...leaderIds, ...ideologyIds, ...positionIds]);
  const summaryData = wikipediaTitle ? await fetchWikipediaSummary(wikipediaTitle) : null;

  const leadersFromWikidata = leaderIds
    .map((entityId) => ({
      entityId,
      name: basics[entityId]?.label || '',
      url: basics[entityId]?.wikipediaUrl,
    }))
    .filter((entry) => entry.name);

  const leaders = leadersFromWikidata.length > 0 || !wikipediaTitle
    ? leadersFromWikidata
    : await fetchWikipediaLeaderFallback(wikipediaTitle);

  return {
    ...fallback,
    description: summaryData?.description || entity.descriptions?.en?.value || match.description,
    entityId: match.id,
    foundedYear: getYearValue(entity, 'P571'),
    ideologies: ideologyIds.map((entityId) => basics[entityId]?.label).filter((value): value is string => Boolean(value)),
    leaders,
    officialWebsite: getStringValue(entity, 'P856'),
    politicalPosition: positionIds[0] ? basics[positionIds[0]]?.label : undefined,
    summary: summaryData?.extract,
    wikipediaTitle,
    wikipediaUrl: summaryData?.content_urls?.desktop?.page || (wikipediaTitle ? buildWikipediaUrl(wikipediaTitle) : undefined),
  };
}

export function usePartyMetadata(partyName: string | undefined, countryName: string | undefined) {
  return useQuery({
    queryKey: ['party-metadata', countryName || '', partyName || ''],
    enabled: Boolean(partyName && countryName && shouldFetchPartyMetadata(partyName)),
    queryFn: () => loadPartyMetadata(partyName!, countryName!),
    staleTime: 1000 * 60 * 60 * 12,
  });
}

export function usePartiesMetadata(countryName: string | undefined, partyNames: string[]) {
  const enrichablePartyNames = partyNames.filter(shouldFetchPartyMetadata);

  return useQuery({
    queryKey: ['party-metadata-list', countryName || '', ...enrichablePartyNames],
    enabled: Boolean(countryName && enrichablePartyNames.length > 0),
    queryFn: async () => {
      const metadataList = await Promise.all(enrichablePartyNames.map((partyName) => loadPartyMetadata(partyName, countryName!)));
      return Object.fromEntries(metadataList.map((entry) => [entry.partyName, entry]));
    },
    staleTime: 1000 * 60 * 60 * 12,
  });
}
