import { decodeWikipediaTitle, deriveNameFromWikipediaUrl, resolvePersonName } from './person-display.ts';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_QUERY = 'https://query.wikidata.org/sparql';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_REST = 'https://en.wikipedia.org/api/rest_v1';
const WIKIDATA_LABEL_LANGUAGES = 'en|pt|fr|de|es|it|nl|pl|cs|ro|hu|sv|da|fi|el|hr|sk|sl|et|lv|lt|ga|mt|mul';

const COUNTRY_HINTS = [
  'country',
  'sovereign state',
  'kingdom',
  'republic',
  'federation',
  'constituent country',
  'union',
];

const LEADERSHIP_RULES = [
  { priority: 120, patterns: ['head of state', 'president', 'king', 'queen', 'monarch', 'emir'] },
  { priority: 115, patterns: ['head of government', 'prime minister', 'chancellor', 'premier'] },
  { priority: 108, patterns: ['vice chancellor', 'vice prime minister', 'deputy prime minister'] },
  { priority: 105, patterns: ['foreign', 'external affairs', 'international affairs', 'foreign relations'] },
  { priority: 104, patterns: ['finance', 'treasury', 'budget', 'fiscal'] },
  { priority: 103, patterns: ['defence', 'defense', 'war', 'national security'] },
  { priority: 102, patterns: ['interior', 'internal affairs', 'home affairs', 'domestic affairs'] },
  { priority: 101, patterns: ['justice', 'attorney general', 'prosecutor general'] },
  { priority: 100, patterns: ['health', 'healthcare', 'public health', 'medical', 'public welfare'] },
  { priority: 99, patterns: ['education', 'schools', 'research', 'science', 'higher education', 'public instruction'] },
  { priority: 98, patterns: ['labour', 'labor', 'employment', 'workforce'] },
  { priority: 97, patterns: ['social affairs', 'family', 'children'] },
  { priority: 96, patterns: ['environment', 'climate'] },
  { priority: 95, patterns: ['energy'] },
  { priority: 94, patterns: ['transport', 'infrastructure'] },
  { priority: 93, patterns: ['agriculture', 'food'] },
  { priority: 92, patterns: ['economy', 'economic', 'trade', 'industry', 'commerce', 'enterprise'] },
  { priority: 91, patterns: ['digital', 'technology', 'communications'] },
  { priority: 90, patterns: ['secretary of state', 'state secretary', 'secretary for'] },
  { priority: 89, patterns: ['chief of defence', 'chief of defense', 'chief of staff', 'armed forces', 'military', 'general staff', 'commander', 'defence staff', 'defense staff'] },
  { priority: 70, patterns: ['minister'] },
];

export interface CountryOfficeholder {
  office: string;
  personName: string;
  personEntityId?: string;
  personUrl?: string;
}

export interface CountryMetadata {
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  entityId?: string;
  wikipediaTitle?: string;
  wikipediaUrl?: string;
  description?: string;
  summary?: string;
  capital?: string;
  headOfState?: string;
  headOfGovernment?: string;
  population?: number;
  areaKm2?: number;
  coordinates?: {
    lat: number;
    lon: number;
  };
  flagImageUrl?: string;
  locatorMapUrl?: string;
  officeholders?: CountryOfficeholder[];
  sourceUpdatedAt?: string;
  databaseUpdatedAt?: string;
  dataSource?: 'supabase' | 'live';
}

interface WikidataSearchResult {
  id: string;
  label?: string;
  description?: string;
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
  labels?: Record<string, { value?: string }>;
  sitelinks?: Record<string, { title?: string }>;
  claims?: Record<string, WikidataClaim[]>;
}

interface WikipediaSummaryResponse {
  description?: string;
  extract?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
}

interface WikipediaPageResponse {
  query?: {
    pages?: Record<
      string,
      {
        extract?: string;
        fullurl?: string;
        coordinates?: Array<{
          lat: number;
          lon: number;
        }>;
      }
    >;
  };
}

export interface CountryMetadataRequestOptions {
  headers?: HeadersInit;
  timeoutMs?: number;
}

type CountryOfficeholderCandidate = CountryOfficeholder | {
  office?: string | null;
  personName?: string | null;
  personEntityId?: string;
  personUrl?: string;
};

function createTimeoutSignal(timeoutMs: number | undefined) {
  if (!timeoutMs || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toCountryOfficeholder(
  entry: CountryOfficeholderCandidate | null | undefined,
): CountryOfficeholder | null {
  if (!entry) return null;

  const office = typeof entry.office === 'string' ? entry.office.trim() : '';
  const personName = typeof entry.personName === 'string' ? entry.personName.trim() : '';
  if (!office || !personName) return null;

  return {
    office,
    personName,
    personEntityId: entry.personEntityId,
    personUrl: entry.personUrl,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildApiUrl(base: string, params: Record<string, string>) {
  return `${base}?${new URLSearchParams(params).toString()}`;
}

function buildWikipediaUrlFromSitelink(siteKey: string | undefined, title: string | undefined) {
  if (!siteKey || !title || !siteKey.endsWith('wiki')) return undefined;
  const project = siteKey.slice(0, -4);
  if (!project) return undefined;

  return `https://${project}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

async function fetchJson<T>(url: string, options?: CountryMetadataRequestOptions): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options?.headers || {}),
    },
    signal: createTimeoutSignal(options?.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function countryCodeToFlagEmoji(countryCode: string) {
  if (!/^[a-z]{2}$/i.test(countryCode)) return countryCode.toUpperCase();
  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

function scoreCountryResult(result: WikidataSearchResult, countryName: string) {
  const label = normalizeText(result.label || '');
  const target = normalizeText(countryName);
  const description = (result.description || '').toLowerCase();

  let score = 0;

  if (label === target) score += 100;
  else if (label.startsWith(target)) score += 50;
  else if (target.includes(label) || label.includes(target)) score += 20;

  if (COUNTRY_HINTS.some((hint) => description.includes(hint))) score += 25;
  if (description.includes('disambiguation')) score -= 100;
  if (description.includes('state of') || description.includes('province')) score -= 25;

  return score;
}

function getLeadershipPriority(label: string) {
  const lower = label.toLowerCase();
  return LEADERSHIP_RULES.find((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))?.priority ?? -1;
}

function getValueClaim(claims: WikidataClaim[] | undefined) {
  if (!claims?.length) return undefined;

  return [...claims]
    .filter((claim) => claim.mainsnak?.snaktype === 'value' && claim.mainsnak?.datavalue?.value)
    .sort((left, right) => {
      const leftRank = left.rank === 'preferred' ? 0 : left.rank === 'normal' ? 1 : 2;
      const rightRank = right.rank === 'preferred' ? 0 : right.rank === 'normal' ? 1 : 2;
      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftEnded = left.qualifiers?.P582?.length ? 1 : 0;
      const rightEnded = right.qualifiers?.P582?.length ? 1 : 0;
      if (leftEnded !== rightEnded) return leftEnded - rightEnded;

      const leftValue = left.qualifiers?.P585?.[0]?.datavalue?.value;
      const rightValue = right.qualifiers?.P585?.[0]?.datavalue?.value;
      const leftPointInTime = isRecord(leftValue) && typeof leftValue.time === 'string' ? leftValue.time : '';
      const rightPointInTime = isRecord(rightValue) && typeof rightValue.time === 'string' ? rightValue.time : '';
      return rightPointInTime.localeCompare(leftPointInTime);
    })[0];
}

function getItemId(entity: WikidataEntity, property: string) {
  const value = getValueClaim(entity.claims?.[property])?.mainsnak?.datavalue?.value;
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}

function getQuantity(entity: WikidataEntity, property: string) {
  const value = getValueClaim(entity.claims?.[property])?.mainsnak?.datavalue?.value;
  if (!isRecord(value) || typeof value.amount !== 'string') return undefined;

  const parsed = Number.parseFloat(value.amount);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getCoordinateValue(entity: WikidataEntity) {
  const value = getValueClaim(entity.claims?.P625)?.mainsnak?.datavalue?.value;
  if (!isRecord(value) || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') {
    return undefined;
  }

  return {
    lat: value.latitude,
    lon: value.longitude,
  };
}

function getCommonsFileUrl(entity: WikidataEntity, property: string) {
  const value = getValueClaim(entity.claims?.[property])?.mainsnak?.datavalue?.value;
  if (typeof value !== 'string' || !value) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}`;
}

async function searchCountryEntity(countryName: string, options?: CountryMetadataRequestOptions) {
  const searchUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbsearchentities',
    search: countryName,
    language: 'en',
    type: 'item',
    limit: '8',
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson<{ search?: WikidataSearchResult[] }>(searchUrl, options);
  const results = data.search || [];

  return results.sort((left, right) => scoreCountryResult(right, countryName) - scoreCountryResult(left, countryName))[0] || null;
}

async function fetchEntity(entityId: string, options?: CountryMetadataRequestOptions) {
  const entityUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    ids: entityId,
    props: 'labels|claims|sitelinks',
    languages: WIKIDATA_LABEL_LANGUAGES,
    format: 'json',
    origin: '*',
  });

  const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(entityUrl, options);
  return data.entities?.[entityId];
}

async function fetchEntityBasics(entityIds: string[], options?: CountryMetadataRequestOptions) {
  if (!entityIds.length) return {};

  const labelsUrl = buildApiUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    ids: entityIds.join('|'),
    props: 'labels|sitelinks',
    languages: WIKIDATA_LABEL_LANGUAGES,
    format: 'json',
    origin: '*',
  });

  try {
    const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(labelsUrl, options);
    const entities: Record<string, { label?: string; wikipediaUrl?: string }> = {};

    for (const entityId of entityIds) {
      const entity = data.entities?.[entityId];
      const label =
        entity?.labels?.en?.value ||
        Object.values(entity?.labels || {}).find((candidate) => candidate?.value)?.value;
      const sitelinkEntry: [string, { title?: string }] | undefined =
        entity?.sitelinks?.enwiki
          ? ['enwiki', entity.sitelinks.enwiki]
          : Object.entries(entity?.sitelinks || {}).find(
              (candidate): candidate is [string, { title?: string }] => Boolean(candidate[1]?.title),
            );
      const siteKey = sitelinkEntry?.[0];
      const title = sitelinkEntry?.[1]?.title;
      entities[entityId] = {
        label: label || decodeWikipediaTitle(title),
        wikipediaUrl: buildWikipediaUrlFromSitelink(siteKey, title),
      };
    }

    return entities;
  } catch {
    return {};
  }
}

function escapeSparqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeOfficeLabel(label: string) {
  return label.replace(/\s+of\s+[A-Z][A-Za-z .'-]+$/g, '').trim();
}

function extractEntityId(uri: string) {
  const match = uri.match(/\/(Q\d+)$/);
  return match?.[1];
}

function shouldIncludeOffice(label: string) {
  const lower = label.toLowerCase();
  if (
    lower.includes('vice president of') ||
    lower.includes('speaker') ||
    lower.includes('member of parliament') ||
    lower.includes('member of the') ||
    lower.includes('senate') ||
    lower.includes('court') ||
    lower.includes('judge') ||
    lower.includes('ambassador') ||
    lower.includes('mayor') ||
    lower.includes('governor')
  ) {
    return false;
  }

  return getLeadershipPriority(lower) >= 0;
}

async function fetchCountryOfficeholders(countryEntityId: string, options?: CountryMetadataRequestOptions) {
  const query = `
    SELECT ?position ?positionLabel ?holder ?holderLabel ?article WHERE {
      VALUES ?country { wd:${escapeSparqlString(countryEntityId)} }
      ?position wdt:P1001 ?country ;
                p:P1308 ?holderStmt .
      ?holderStmt ps:P1308 ?holder .
      FILTER(NOT EXISTS { ?holderStmt pq:P582 ?end })
      OPTIONAL {
        ?article schema:about ?holder ;
                 schema:isPartOf <https://en.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 200
  `;

  try {
    const data = await fetchJson<{
      results?: {
        bindings?: Array<{
          position?: { value?: string };
          positionLabel?: { value?: string };
          holder?: { value?: string };
          holderLabel?: { value?: string };
          article?: { value?: string };
        }>;
      };
    }>(`${WIKIDATA_QUERY}?format=json&query=${encodeURIComponent(query)}`, options);

    const seen = new Set<string>();

    const rawEntries = (data.results?.bindings || [])
      .map((binding) => {
        const office = binding.positionLabel?.value;
        const personEntityId = binding.holder?.value ? extractEntityId(binding.holder.value) : undefined;
        const personUrl = binding.article?.value;
        const personName = resolvePersonName(binding.holderLabel?.value, personUrl);
        if (!office || !shouldIncludeOffice(office)) return null;

        const normalizedOffice = normalizeOfficeLabel(office);
        const personKey = personName?.toLowerCase() || personEntityId || personUrl || 'unknown-person';
        const key = `${normalizedOffice.toLowerCase()}::${personKey}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
          office: normalizedOffice,
          personName,
          personEntityId,
          personUrl,
          priority: getLeadershipPriority(normalizedOffice),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const unresolvedIds = (data.results?.bindings || [])
      .map((binding) => {
        const personEntityId = binding.holder?.value ? extractEntityId(binding.holder.value) : undefined;
        const resolvedName = resolvePersonName(binding.holderLabel?.value, binding.article?.value);
        return !resolvedName && personEntityId ? personEntityId : null;
      })
      .filter((value): value is string => Boolean(value));

    const unresolvedBasics = await fetchEntityBasics(Array.from(new Set(unresolvedIds)), options);

    return rawEntries
      .map((entry) => {
        if (entry.personName) return entry;

        const fallback = entry.personEntityId ? unresolvedBasics[entry.personEntityId] : undefined;
        const personUrl = entry.personUrl || fallback?.wikipediaUrl;
        const personName = fallback?.label || deriveNameFromWikipediaUrl(personUrl);
        if (!personName) return null;

        return {
          ...entry,
          personName,
          personUrl,
        };
      })
      .map((entry) => (entry ? { ...entry, office: entry.office?.trim(), personName: entry.personName?.trim() } : null))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.office && entry?.personName))
      .sort((left, right) => right.priority - left.priority || left.office.localeCompare(right.office))
      .map(({ priority: _priority, ...entry }) => entry);
  } catch {
    return [];
  }
}

async function fetchWikipediaArticle(title: string, options?: CountryMetadataRequestOptions) {
  const articleUrl = buildApiUrl(WIKIPEDIA_API, {
    action: 'query',
    titles: title,
    prop: 'extracts|coordinates|info',
    exintro: 'true',
    explaintext: 'true',
    inprop: 'url',
    format: 'json',
    origin: '*',
  });

  try {
    const pageData = await fetchJson<WikipediaPageResponse>(articleUrl, options);
    const page = Object.values(pageData.query?.pages || {})[0];

    return {
      summary: page?.extract,
      coordinates: page?.coordinates?.[0]
        ? {
            lat: page.coordinates[0].lat,
            lon: page.coordinates[0].lon,
          }
        : undefined,
      wikipediaUrl: page?.fullurl,
    };
  } catch {
    return {
      summary: undefined,
      coordinates: undefined,
      wikipediaUrl: undefined,
    };
  }
}

async function fetchWikipediaSummary(title: string, options?: CountryMetadataRequestOptions) {
  const summaryUrl = `${WIKIPEDIA_REST}/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;

  try {
    return await fetchJson<WikipediaSummaryResponse>(summaryUrl, options);
  } catch {
    return null;
  }
}

export async function loadCountryMetadata(
  countryCode: string,
  countryName: string,
  options?: CountryMetadataRequestOptions,
): Promise<CountryMetadata> {
  const fallback: CountryMetadata = {
    countryCode,
    countryName,
    flagEmoji: countryCodeToFlagEmoji(countryCode),
  };

  const match = await searchCountryEntity(countryName, options);
  if (!match?.id) return fallback;

  const entity = await fetchEntity(match.id, options);
  if (!entity) return fallback;

  const wikipediaTitle = entity.sitelinks?.enwiki?.title || match.label || countryName;
  const [summaryData, articleData] = await Promise.all([
    fetchWikipediaSummary(wikipediaTitle, options),
    fetchWikipediaArticle(wikipediaTitle, options),
  ]);

  const capitalId = getItemId(entity, 'P36');
  const headOfStateId = getItemId(entity, 'P35');
  const headOfGovernmentId = getItemId(entity, 'P6');
  const basics = await fetchEntityBasics(
    [capitalId, headOfStateId, headOfGovernmentId].filter((value): value is string => Boolean(value)),
    options,
  );
  const officeholders = await fetchCountryOfficeholders(match.id, options);

  const directOfficeholders = [
    headOfStateId
      ? {
          office: 'Head of State',
          personName: basics[headOfStateId]?.label || deriveNameFromWikipediaUrl(basics[headOfStateId]?.wikipediaUrl) || '',
          personEntityId: headOfStateId,
          personUrl: basics[headOfStateId]?.wikipediaUrl,
        }
      : null,
    headOfGovernmentId
      ? {
          office: 'Head of Government',
          personName: basics[headOfGovernmentId]?.label || deriveNameFromWikipediaUrl(basics[headOfGovernmentId]?.wikipediaUrl) || '',
          personEntityId: headOfGovernmentId,
          personUrl: basics[headOfGovernmentId]?.wikipediaUrl,
        }
      : null,
  ]
    .map((entry) => toCountryOfficeholder(entry))
    .filter((entry): entry is CountryOfficeholder => Boolean(entry));

  const combinedOfficeholders = [...directOfficeholders, ...officeholders]
    .map((entry) => toCountryOfficeholder(entry))
    .filter((entry): entry is CountryOfficeholder => Boolean(entry))
    .reduce<CountryOfficeholder[]>((acc, entry) => {
    if (
      acc.some(
        (candidate) =>
          candidate.office.toLowerCase() === entry.office.toLowerCase() &&
          candidate.personName.toLowerCase() === entry.personName.toLowerCase(),
      )
    ) {
      return acc;
    }
    acc.push(entry);
    return acc;
  }, []);

  return {
    ...fallback,
    entityId: match.id,
    wikipediaTitle,
    wikipediaUrl: summaryData?.content_urls?.desktop?.page || articleData.wikipediaUrl,
    description: summaryData?.description,
    summary: summaryData?.extract || articleData.summary,
    capital: capitalId ? basics[capitalId]?.label : undefined,
    headOfState: headOfStateId ? basics[headOfStateId]?.label || deriveNameFromWikipediaUrl(basics[headOfStateId]?.wikipediaUrl) : undefined,
    headOfGovernment: headOfGovernmentId ? basics[headOfGovernmentId]?.label || deriveNameFromWikipediaUrl(basics[headOfGovernmentId]?.wikipediaUrl) : undefined,
    population: getQuantity(entity, 'P1082'),
    areaKm2: getQuantity(entity, 'P2046'),
    coordinates: summaryData?.coordinates || articleData.coordinates || getCoordinateValue(entity),
    flagImageUrl: getCommonsFileUrl(entity, 'P41'),
    locatorMapUrl: getCommonsFileUrl(entity, 'P242'),
    officeholders: combinedOfficeholders,
  };
}
