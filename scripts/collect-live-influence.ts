#!/usr/bin/env node
// Live collection agent for the Global Influence Registry.
//
// It gathers official/structured source snapshots into data/influence/live/*,
// normalizes them to the existing influence ingester formats, and writes a
// combined bundle/report for review before applying to Supabase.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  mergeInfluenceBundles,
  parseEuTransparency,
  parseOpenSanctions,
  parseUsFara,
  parseUsLda,
  type InfluenceBundle,
} from '../src/lib/influence-ingest.ts';
import {
  parseLobbyfactsDatacard,
  parseLobbyfactsMeetingsCsv,
  parseLobbyfactsSearchPage,
} from '../src/lib/lobbyfacts-helpers.ts';

type Args = {
  out: string;
  ldaLimit: number;
  ldaForeignPerCountry: number;
  faraLimit: number;
  lobbyfactsLimit: number;
  opensanctionsLimit: number;
};

type CollectionReport = {
  generated_at: string;
  sources: Record<string, unknown>;
  summaries: Record<string, unknown>;
  artifacts: Record<string, string>;
  errors: Array<{ source: string; url?: string; message: string }>;
  notes: string[];
};

const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'poli-track live-influence-collector (https://github.com/poli-track-os/poli-track-os)';
const LDA_BASE = 'https://lda.senate.gov/api/v1/filings/';
const LOBBYFACTS_BASE = 'https://www.lobbyfacts.eu';
const OPENSANCTIONS_DATASET = 'https://data.opensanctions.org/datasets/latest/default/entities.ftm.json';
const FARA_BASE = 'https://efile.fara.gov/api/v1';

const TARGET_COUNTRIES = [
  'CN', 'RU', 'US',
  'BH', 'EG', 'IR', 'IQ', 'IL', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'AE', 'YE',
];

const MAJOR_LDA_TERMS = [
  'Meta', 'Google', 'Amazon', 'Apple', 'Microsoft', 'Boeing', 'Lockheed', 'Exxon', 'Chevron',
  'TikTok', 'ByteDance', 'Saudi', 'Qatar', 'Emirates', 'UAE', 'China', 'Russia', 'Israel', 'Turkey',
];

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  Austria: 'AT',
  Belgium: 'BE',
  Bulgaria: 'BG',
  Croatia: 'HR',
  Cyprus: 'CY',
  Czechia: 'CZ',
  Denmark: 'DK',
  Estonia: 'EE',
  Finland: 'FI',
  France: 'FR',
  Germany: 'DE',
  Greece: 'GR',
  Hungary: 'HU',
  Ireland: 'IE',
  Italy: 'IT',
  Latvia: 'LV',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Malta: 'MT',
  Netherlands: 'NL',
  Poland: 'PL',
  Portugal: 'PT',
  Romania: 'RO',
  Slovakia: 'SK',
  Slovenia: 'SI',
  Spain: 'ES',
  Sweden: 'SE',
  'United Kingdom': 'GB',
  'United States': 'US',
  'United States of America': 'US',
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    out: path.join('data', 'influence', 'live', TODAY),
    ldaLimit: 250,
    ldaForeignPerCountry: 12,
    faraLimit: 40,
    lobbyfactsLimit: 60,
    opensanctionsLimit: 400,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${token}`);
      return value;
    };
    if (token === '--out') args.out = next();
    else if (token === '--lda-limit') args.ldaLimit = Number.parseInt(next(), 10);
    else if (token === '--lda-foreign-per-country') args.ldaForeignPerCountry = Number.parseInt(next(), 10);
    else if (token === '--fara-limit') args.faraLimit = Number.parseInt(next(), 10);
    else if (token === '--lobbyfacts-limit') args.lobbyfactsLimit = Number.parseInt(next(), 10);
    else if (token === '--opensanctions-limit') args.opensanctionsLimit = Number.parseInt(next(), 10);
    else if (token === '--help' || token === '-h') {
      console.log('collect-live-influence.ts [--out dir] [--lda-limit N] [--lda-foreign-per-country N] [--fara-limit N] [--lobbyfacts-limit N] [--opensanctions-limit N]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, errors: CollectionReport['errors'], retries = 3): Promise<string | null> {
  let last: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/csv,text/html,*/*' },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        if (res.status === 429 && attempt < retries) {
          await sleep(5_000 * attempt);
          continue;
        }
        throw new Error(`${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (error) {
      last = error;
      await sleep(750 * attempt);
    }
  }
  errors.push({ source: sourceName(url), url, message: last instanceof Error ? last.message : String(last) });
  return null;
}

async function fetchJson(url: string, errors: CollectionReport['errors'], retries = 3): Promise<Record<string, unknown> | null> {
  const text = await fetchText(url, errors, retries);
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    errors.push({ source: sourceName(url), url, message: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

function sourceName(url: string) {
  if (url.includes('lda.senate.gov')) return 'us_lda';
  if (url.includes('efile.fara.gov')) return 'us_fara';
  if (url.includes('lobbyfacts.eu')) return 'eu_transparency_register';
  if (url.includes('opensanctions.org')) return 'opensanctions';
  return 'unknown';
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

function quarterFromPeriod(value: unknown): number | null {
  const text = String(value || '').toLowerCase();
  if (text.includes('first')) return 1;
  if (text.includes('second')) return 2;
  if (text.includes('third')) return 3;
  if (text.includes('fourth')) return 4;
  return null;
}

function compactJoin(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].join(';');
}

function nestedName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return value ? String(value) : null;
  const row = value as Record<string, unknown>;
  return String(row.name || row.display_name || row.government_entity_name || row.code || '').trim() || null;
}

export function flattenLdaFiling(row: Record<string, unknown>) {
  const registrant = (row.registrant || {}) as Record<string, unknown>;
  const client = (row.client || {}) as Record<string, unknown>;
  const activities = Array.isArray(row.lobbying_activities) ? row.lobbying_activities as Record<string, unknown>[] : [];
  const foreignEntities = Array.isArray(row.foreign_entities) ? row.foreign_entities as Record<string, unknown>[] : [];
  const issues = activities.flatMap((activity) => [
    String(activity.general_issue_code_display || '').trim(),
    String(activity.general_issue_code || '').trim(),
  ]);
  const descriptions = activities.map((activity) => String(activity.description || '').trim());
  const targets = activities.flatMap((activity) => {
    const entities = Array.isArray(activity.government_entities) ? activity.government_entities : [];
    return entities.map(nestedName);
  });
  const foreignCountry = foreignEntities
    .map((entity) => String(entity.country || entity.country_code || '').trim())
    .find(Boolean);
  const clientCountry = String(client.country || '').trim() || null;
  const amount = row.income ?? row.expenses ?? null;
  const year = Number(row.filing_year || 0) || null;
  return {
    filing_uuid: row.filing_uuid,
    registrant_name: registrant.name || row.registrant_name,
    registrant_id: registrant.id,
    client_name: client.name,
    client_id: client.id || client.client_id,
    client_country: clientCountry,
    principal_country_code: foreignCountry || (clientCountry && clientCountry !== 'US' ? clientCountry : null),
    amount,
    year,
    quarter: quarterFromPeriod(row.filing_period),
    period_start: year ? `${year}-01-01` : null,
    period_end: year ? `${year}-12-31` : null,
    issue_area: compactJoin(issues),
    target_institution: compactJoin(targets),
    description: compactJoin(descriptions),
    source_url: row.filing_document_url || row.url,
    raw_data: row,
  };
}

async function collectLda(args: Args, dirs: { raw: string; normalized: string }, report: CollectionReport) {
  const seen = new Map<string, Record<string, unknown>>();
  const requests: Array<{ label: string; params: Record<string, string>; limit: number }> = [
    { label: '2026 latest filings', params: { filing_year: '2026', ordering: '-dt_posted' }, limit: args.ldaLimit },
    { label: '2025 latest filings', params: { filing_year: '2025', ordering: '-dt_posted' }, limit: Math.ceil(args.ldaLimit / 2) },
  ];
  for (const country of TARGET_COUNTRIES) {
    requests.push({
      label: `foreign entity ${country}`,
      params: { filing_year: '2026', foreign_entity_country: country, ordering: '-dt_posted' },
      limit: args.ldaForeignPerCountry,
    });
    requests.push({
      label: `client country ${country}`,
      params: { filing_year: '2026', client_country: country, ordering: '-dt_posted' },
      limit: args.ldaForeignPerCountry,
    });
  }
  for (const term of MAJOR_LDA_TERMS) {
    requests.push({ label: `client search ${term}`, params: { client_name: term, ordering: '-dt_posted' }, limit: 10 });
  }

  for (const request of requests) {
    let page = 1;
    let fetchedForRequest = 0;
    while (fetchedForRequest < request.limit) {
      const params = new URLSearchParams({ ...request.params, page: String(page), page_size: '25' });
      const url = `${LDA_BASE}?${params.toString()}`;
      const json = await fetchJson(url, report.errors);
      if (!json) break;
      const rows = Array.isArray(json.results) ? json.results as Record<string, unknown>[] : [];
      for (const row of rows) {
        const uuid = String(row.filing_uuid || '');
        if (!uuid || seen.has(uuid)) continue;
        seen.set(uuid, row);
        fetchedForRequest += 1;
        if (fetchedForRequest >= request.limit) break;
      }
      if (!json.next || rows.length === 0) break;
      page += 1;
      await sleep(800);
    }
    report.sources[`lda:${request.label}`] = { fetched: fetchedForRequest, params: request.params };
  }

  const rawRows = [...seen.values()];
  const flatRows = rawRows.map(flattenLdaFiling).filter((row) => row.filing_uuid && row.client_name);
  const rawPath = path.join(dirs.raw, 'us-lda-api-filings.json');
  const normalizedPath = path.join(dirs.normalized, 'us-lda.json');
  writeJson(rawPath, rawRows);
  writeJson(normalizedPath, flatRows);
  report.artifacts.us_lda_raw = rawPath;
  report.artifacts.us_lda_normalized = normalizedPath;
  return parseUsLda(JSON.stringify(flatRows));
}

function faraRows(root: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const container = root[key] as Record<string, unknown> | undefined;
  const rows = container?.ROW;
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  if (rows && typeof rows === 'object') return [rows as Record<string, unknown>];
  return [];
}

function flattenFaraPrincipal(registrant: Record<string, unknown>, principal: Record<string, unknown>) {
  const registration = String(registrant.Registration_Number || principal.Registration_Number || '');
  const principalName = String(principal.Name || principal.Foreign_Principal || principal.Principal_Name || '').trim();
  const country = String(principal.Country || principal.Foreign_Principal_Country || principal.Country_Location_Represented || '').trim();
  return {
    registration_number: registration,
    registrant_name: registrant.Name,
    foreign_principal: principalName,
    foreign_principal_country: country,
    foreign_principal_country_name: country,
    source_url: `https://efile.fara.gov/api/v1/ForeignPrincipals/json/Active/${registration}`,
    raw_data: { registrant, principal },
  };
}

async function collectFara(args: Args, dirs: { raw: string; normalized: string }, report: CollectionReport) {
  const activeUrl = `${FARA_BASE}/Registrants/json/Active`;
  const active = await fetchJson(activeUrl, report.errors, 4);
  const registrants = active ? faraRows(active, 'REGISTRANTS_ACTIVE').slice(0, args.faraLimit) : [];
  const raw: Array<{ registrant: Record<string, unknown>; principals: Record<string, unknown>[] }> = [];
  const flat: Record<string, unknown>[] = [];

  for (const registrant of registrants) {
    const registration = String(registrant.Registration_Number || '');
    if (!registration) continue;
    await sleep(2200);
    const principalUrl = `${FARA_BASE}/ForeignPrincipals/json/Active/${registration}`;
    const principalsJson = await fetchJson(principalUrl, report.errors, 2);
    const principals = principalsJson ? faraRows(principalsJson, 'FOREIGN_PRINCIPALS_ACTIVE') : [];
    raw.push({ registrant, principals });
    for (const principal of principals) {
      const row = flattenFaraPrincipal(registrant, principal);
      if (row.foreign_principal) flat.push(row);
    }
  }

  const rawPath = path.join(dirs.raw, 'us-fara-api.json');
  const normalizedPath = path.join(dirs.normalized, 'us-fara.json');
  writeJson(rawPath, raw);
  writeJson(normalizedPath, flat);
  report.artifacts.us_fara_raw = rawPath;
  report.artifacts.us_fara_normalized = normalizedPath;
  report.sources.us_fara = { registrants: registrants.length, principals: flat.length, endpoint: activeUrl };
  return parseUsFara(JSON.stringify(flat));
}

function opensanctionsCountries(row: Record<string, unknown>): string[] {
  const properties = (row.properties || {}) as Record<string, unknown>;
  return [
    ...arrayValue(properties.country),
    ...arrayValue(properties.nationality),
    ...arrayValue(properties.jurisdiction),
    ...arrayValue(properties.registrationCountry),
    ...arrayValue(properties.mainCountry),
  ].map((country) => country.toUpperCase());
}

export function keepOpenSanctionsRow(row: Record<string, unknown>) {
  const schema = String(row.schema || '');
  if (!['Person', 'Organization', 'Company', 'LegalEntity', 'PublicBody'].includes(schema)) return false;
  const countries = opensanctionsCountries(row);
  if (!countries.some((country) => TARGET_COUNTRIES.includes(country))) return false;
  const properties = (row.properties || {}) as Record<string, unknown>;
  const topics = arrayValue(properties.topics).join(' ').toLowerCase();
  const datasets = arrayValue(row.datasets).join(' ').toLowerCase();
  return (
    topics.includes('sanction') ||
    topics.includes('pep') ||
    datasets.includes('sanction') ||
    datasets.includes('pep')
  );
}

async function collectOpenSanctions(args: Args, dirs: { raw: string; normalized: string }, report: CollectionReport) {
  const rows: Record<string, unknown>[] = [];
  const res = await fetch(OPENSANCTIONS_DATASET, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) {
    report.errors.push({ source: 'opensanctions', url: OPENSANCTIONS_DATASET, message: `${res.status} ${res.statusText}` });
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let scanned = 0;
    while (rows.length < args.opensanctionsLimit) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        scanned += 1;
        try {
          const row = JSON.parse(line) as Record<string, unknown>;
          if (keepOpenSanctionsRow(row)) rows.push(row);
        } catch {
          // Ignore malformed partial lines; the source is newline JSON.
        }
        if (rows.length >= args.opensanctionsLimit) break;
      }
    }
    await reader.cancel();
    report.sources.opensanctions = { scanned, kept: rows.length, endpoint: OPENSANCTIONS_DATASET };
  }

  const rawPath = path.join(dirs.raw, 'opensanctions-entities.json');
  const normalizedPath = path.join(dirs.normalized, 'opensanctions.json');
  writeJson(rawPath, rows);
  writeJson(normalizedPath, rows);
  report.artifacts.opensanctions_raw = rawPath;
  report.artifacts.opensanctions_normalized = normalizedPath;
  return parseOpenSanctions(JSON.stringify(rows));
}

async function collectLobbyFacts(args: Args, dirs: { raw: string; normalized: string }, report: CollectionReport) {
  const cards: Record<string, unknown>[] = [];
  const flat: Record<string, unknown>[] = [];
  let page = 0;
  while (cards.length < args.lobbyfactsLimit) {
    const html = await fetchText(`${LOBBYFACTS_BASE}/search-all?page=${page}`, report.errors);
    if (!html) break;
    const entries = parseLobbyfactsSearchPage(html);
    if (entries.length === 0) break;
    for (const entry of entries) {
      if (cards.length >= args.lobbyfactsLimit) break;
      await sleep(200);
      const cardHtml = await fetchText(`${LOBBYFACTS_BASE}${entry.datacardPath}`, report.errors);
      if (!cardHtml) continue;
      const card = parseLobbyfactsDatacard(cardHtml, entry.transparencyId);
      if (card.name === 'Unknown organisation') card.name = entry.name;
      cards.push({ ...card, datacardPath: entry.datacardPath });
      const countryCode = card.countryOfHq ? COUNTRY_NAME_TO_CODE[card.countryOfHq] || null : null;
      const spendRows = card.spendByYear.length > 0 ? card.spendByYear : [{ year: null, amountEur: null }];
      for (const spend of spendRows) {
        flat.push({
          transparency_id: card.transparencyId,
          name: card.name,
          country_code: countryCode,
          country_of_hq: card.countryOfHq,
          category: card.category,
          year: spend.year,
          declared_amount_eur_low: spend.amountEur,
          declared_amount_eur_high: spend.amountEur,
          source_url: `${LOBBYFACTS_BASE}${entry.datacardPath}`,
        });
      }

      const meetingsUrl = `${LOBBYFACTS_BASE}/csv_export_meetings/${encodeURIComponent(card.transparencyId)}`;
      const meetingsCsv = await fetchText(meetingsUrl, report.errors, 1);
      if (meetingsCsv?.includes(',')) {
        for (const meeting of parseLobbyfactsMeetingsCsv(meetingsCsv).slice(0, 25)) {
          flat.push({
            transparency_id: card.transparencyId,
            name: card.name,
            country_code: countryCode,
            category: card.category,
            target_name: meeting.attendingFromCommission,
            target_institution: meeting.commissionerOrg || meeting.cabinet || 'European Commission',
            meeting_date: meeting.meetingDate,
            subject: meeting.subject,
            location: meeting.location,
            source_url: meetingsUrl,
          });
        }
      }
    }
    page += 1;
  }

  const rawPath = path.join(dirs.raw, 'lobbyfacts-datacards.json');
  const normalizedPath = path.join(dirs.normalized, 'eu-transparency.json');
  writeJson(rawPath, cards);
  writeJson(normalizedPath, flat);
  report.artifacts.eu_transparency_raw = rawPath;
  report.artifacts.eu_transparency_normalized = normalizedPath;
  report.sources.eu_transparency_register = { cards: cards.length, rows: flat.length, source: LOBBYFACTS_BASE };
  return parseEuTransparency(JSON.stringify(flat));
}

function summarizeBundle(bundle: InfluenceBundle) {
  return {
    actors: bundle.actors.length,
    companies: bundle.companies.length,
    officers: bundle.officers.length,
    ownership: bundle.ownership.length,
    clients: bundle.clients.length,
    filings: bundle.filings.length,
    contacts: bundle.contacts.length,
    money: bundle.money.length,
    affiliations: bundle.affiliations.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = {
    raw: path.join(args.out, 'raw'),
    normalized: path.join(args.out, 'normalized'),
    summaries: path.join(args.out, 'summaries'),
  };
  ensureDir(dirs.raw);
  ensureDir(dirs.normalized);
  ensureDir(dirs.summaries);

  const report: CollectionReport = {
    generated_at: new Date().toISOString(),
    sources: {},
    summaries: {},
    artifacts: {},
    errors: [],
    notes: [
      'Religion/sect affiliation claims are not inferred. This collector writes no visible affiliation rows; reviewed claims must come from a curated review queue.',
      'FARA endpoints are rate-limited and may reset connections; failed FARA requests are recorded in this report rather than silently ignored.',
      'OpenCorporates public API requires credentials in this environment, so company enrichment is deferred to authenticated OpenCorporates runs.',
    ],
  };

  const bundles = await Promise.all([
    collectLda(args, dirs, report),
    collectFara(args, dirs, report),
    collectOpenSanctions(args, dirs, report),
    collectLobbyFacts(args, dirs, report),
  ]);
  const combined = mergeInfluenceBundles(...bundles);
  report.summaries = {
    us_lda: summarizeBundle(bundles[0]),
    us_fara: summarizeBundle(bundles[1]),
    opensanctions: summarizeBundle(bundles[2]),
    eu_transparency_register: summarizeBundle(bundles[3]),
    combined: summarizeBundle(combined),
  };

  const combinedPath = path.join(dirs.normalized, 'combined-bundle.json');
  const affiliationQueuePath = path.join(dirs.normalized, 'public-affiliations-review-queue.json');
  const reportPath = path.join(dirs.summaries, 'collection-report.json');
  writeJson(combinedPath, combined);
  writeJson(affiliationQueuePath, []);
  report.artifacts.combined_bundle = combinedPath;
  report.artifacts.public_affiliations_review_queue = affiliationQueuePath;
  writeJson(reportPath, report);
  console.log(JSON.stringify({ out: args.out, report: reportPath, summaries: report.summaries, errors: report.errors.length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
