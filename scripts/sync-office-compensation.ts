#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getSupabaseClient, loadLocalEnv } from './influence-sync-helpers.ts';
import { buildEuropeanParliamentSalaryRecords } from '../src/lib/office-compensation.ts';

type Args = {
  apply: boolean;
  outDir: string;
  countries: Set<string> | null;
  limitCountries: number | null;
};

type IpuRecord = {
  id: string;
  type: string;
  attributes: Record<string, any>;
};

type CompensationRow = {
  country_code: string;
  country_name: string;
  jurisdiction: string;
  chamber_id: string | null;
  office_type: string;
  office_title: string;
  role_patterns: string[];
  year: number;
  effective_date: string;
  date_to: string | null;
  period: string;
  amount: number;
  annual_amount: number;
  currency: string;
  annual_amount_eur: number | null;
  source_url: string;
  source_label: string;
  source_type: string;
  trust_level: number;
  notes: string | null;
  raw_data: Record<string, unknown>;
};

type CountryProgress = {
  country_code: string;
  country_name: string;
  iso_alpha3: string | null;
  parliament_url: string;
  ipu_country_api_url: string;
  ipu_parliament_api_url: string;
  official_salary_links: Array<{ title: string | null; url: string }>;
  chambers: Array<{
    chamber_id: string;
    chamber_name: string;
    chamber_url: string;
    parliamentary_website_url: string | null;
    exports: Record<string, { status: 'collected' | 'missing'; rows: number; export_url: string }>;
  }>;
  records_found: number;
  record_counts: Record<string, number>;
  gaps: string[];
};

const IPU_API = 'https://api.data.ipu.org/v1';
const IPU_PUBLIC = 'https://data.ipu.org';
const MANUAL_OFFICE_COMPENSATION_PATH = path.join('data', 'office-compensation', 'curated', 'office-compensation-manual.json');
const MANUAL_OFFICE_COMPENSATION_DIR = path.join('data', 'office-compensation', 'curated', 'records');
const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'poli-track office-compensation-sync (https://github.com/poli-track-os/poli-track-os)';

const FIELD_CONFIG = {
  basic_salary: {
    label: 'IPU Parline basic salary',
    sourceLabel: 'IPU Parline basic salary history',
    period: 'annual',
  },
  speaker_annual_salary: {
    label: 'IPU Parline Speaker salary',
    sourceLabel: 'IPU Parline Speaker salary history',
    period: 'annual_or_reported',
  },
  allowance: {
    label: 'IPU Parline basic allowance',
    sourceLabel: 'IPU Parline basic allowance history',
    period: 'reported',
  },
} as const;

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    outDir: path.join('data', 'office-compensation', 'live', TODAY),
    countries: null,
    limitCountries: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
    } else if (token === '--out') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --out');
      args.outDir = value;
    } else if (token === '--countries') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --countries');
      args.countries = new Set(value.split(',').map((entry) => entry.trim().toUpperCase()).filter(Boolean));
    } else if (token === '--limit-countries') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --limit-countries');
      args.limitCountries = Number.parseInt(value, 10);
    } else if (token === '--help' || token === '-h') {
      console.log('scripts/sync-office-compensation.ts [--apply] [--out data/office-compensation/live/YYYY-MM-DD] [--countries PT,DE] [--limit-countries N]');
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
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function parseManualRowsFile(filePath: string): CompensationRow[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records?: CompensationRow[] } | CompensationRow[];
  return Array.isArray(parsed) ? parsed : parsed.records || [];
}

function loadManualRows(countries: IpuRecord[]): CompensationRow[] {
  const countryCodes = new Set(countries.map((country) => country.id));
  const manualFiles = [
    fs.existsSync(MANUAL_OFFICE_COMPENSATION_PATH) ? MANUAL_OFFICE_COMPENSATION_PATH : null,
    fs.existsSync(MANUAL_OFFICE_COMPENSATION_DIR)
      ? fs.readdirSync(MANUAL_OFFICE_COMPENSATION_DIR)
        .filter((entry) => entry.endsWith('.json'))
        .sort()
        .map((entry) => path.join(MANUAL_OFFICE_COMPENSATION_DIR, entry))
      : [],
  ].flat().filter((entry): entry is string => Boolean(entry));
  const records = manualFiles.flatMap(parseManualRowsFile);

  return records
    .filter((row) => countryCodes.has(String(row.country_code).toUpperCase()))
    .map((row) => ({
      ...row,
      country_code: String(row.country_code).toUpperCase(),
      chamber_id: row.chamber_id || null,
      date_to: row.date_to || null,
      amount: Number(row.amount),
      annual_amount: Number(row.annual_amount || row.amount),
      annual_amount_eur: row.annual_amount_eur === null || row.annual_amount_eur === undefined ? null : Number(row.annual_amount_eur),
      role_patterns: Array.isArray(row.role_patterns) ? row.role_patterns : [],
      trust_level: Number(row.trust_level || 2),
      notes: row.notes || null,
      raw_data: row.raw_data || {},
    }));
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function localized(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.en === 'string') return value.en;
  if (typeof value.fr === 'string') return value.fr;
  return null;
}

function latestListValue(attribute: any): any {
  if (Array.isArray(attribute)) return attribute.at(-1)?.value ?? null;
  if (attribute && typeof attribute === 'object' && 'value' in attribute) return attribute.value;
  return attribute ?? null;
}

function latestLocalizedListValue(attribute: any): string | null {
  if (Array.isArray(attribute)) return localized(attribute.at(-1)?.value);
  return localized(attribute?.value ?? attribute);
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseAmount(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const normalized = String(value).replace(/\u00a0/g, ' ').replace(/[,\s]/g, '').trim();
  if (!normalized || /noinformation/i.test(normalized)) return null;
  const amount = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function moneyParts(value: any): { amount: number; currency: string } | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && typeof candidate === 'object') {
    const amount = parseAmount(candidate.value);
    const currency = typeof candidate.type === 'string' ? candidate.type.toUpperCase() : null;
    if (amount !== null && currency) return { amount, currency };
  }
  const amount = parseAmount(candidate);
  return amount === null ? null : { amount, currency: 'UNKNOWN' };
}

function yearFromDate(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function cleanDate(value: string | null | undefined) {
  if (!value || value.trim() === '') return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function markdownLink(value: string | undefined) {
  const match = value?.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) return { label: value || 'PoliticalSalaries', url: 'https://politicalsalaries.com/about-the-data/' };
  return { label: match[1], url: match[2] };
}

function parseLooseDateYear(value: string | undefined) {
  if (!value) return null;
  const iso = value.match(/\b(20\d{2}|19\d{2})\b/);
  if (!iso) return null;
  return Number(iso[1]);
}

function parseLooseDate(value: string | undefined) {
  const year = parseLooseDateYear(value);
  if (!year) return null;
  const monthMatch = value?.toLowerCase().match(/(?:^|[-\s])([a-z]{3,9})(?:[-\s]|$)/);
  const month = monthMatch ? MONTHS[monthMatch[1]] || '01' : '01';
  const dayMatch = value?.match(/\b([0-3]?\d)[-\s][A-Za-z]{3}/);
  const day = dayMatch ? dayMatch[1].padStart(2, '0') : '01';
  return `${year}-${month}-${day}`;
}

function chamberKind(chamberId: string) {
  return chamberId.includes('-UC') ? 'upper' : 'lower';
}

function memberOfficeType(chamberId: string) {
  return chamberKind(chamberId) === 'upper' ? 'senator' : 'member_of_parliament';
}

function memberRolePatterns(chamberId: string, chamberName: string, countryCode: string) {
  if (chamberKind(chamberId) === 'upper') {
    return ['Senator', 'Member of Senate', `Member of ${chamberName}`];
  }
  if (countryCode === 'DE') return ['Member of Bundestag', 'Member of Parliament', `Member of ${chamberName}`];
  return ['Member of Parliament', 'Deputy', `Member of ${chamberName}`];
}

function fieldOffice(field: keyof typeof FIELD_CONFIG, chamberId: string, chamberName: string, countryName: string, countryCode: string) {
  if (field === 'speaker_annual_salary') {
    return {
      office_type: 'speaker',
      office_title: `${countryName} ${chamberName} speaker`,
      role_patterns: ['Speaker', 'President', `Speaker of ${chamberName}`, `President of ${chamberName}`],
    };
  }
  if (field === 'allowance') {
    return {
      office_type: 'basic_allowance',
      office_title: `${countryName} ${chamberName} basic allowance`,
      role_patterns: memberRolePatterns(chamberId, chamberName, countryCode),
    };
  }
  return {
    office_type: memberOfficeType(chamberId),
    office_title: `${countryName} ${chamberName} member`,
    role_patterns: memberRolePatterns(chamberId, chamberName, countryCode),
  };
}

function sourceFromAnnotation(entry: any) {
  return localized(entry?.annotation?.source) || '';
}

function notesFromAnnotation(entry: any) {
  return localized(entry?.annotation?.notes) || null;
}

function ipuRowsForField(
  field: keyof typeof FIELD_CONFIG,
  country: IpuRecord,
  chamber: IpuRecord,
): CompensationRow[] {
  const values = chamber.attributes[field];
  if (!Array.isArray(values)) return [];

  const countryCode = country.id;
  const countryName = latestLocalizedListValue(country.attributes.country_name) || country.id;
  const chamberName = latestLocalizedListValue(chamber.attributes.chamber_name) || chamber.id;
  const config = FIELD_CONFIG[field];
  const office = fieldOffice(field, chamber.id, chamberName, countryName, countryCode);
  const exportUrl = `${IPU_PUBLIC}/export-historical/${field}/${chamber.id}/csv`;

  return values.flatMap((entry: any): CompensationRow[] => {
    const money = moneyParts(entry.value);
    const effectiveDate = cleanDate(entry.date_from);
    const year = yearFromDate(effectiveDate);
    if (!money || !effectiveDate || !year) return [];
    const sourceNote = sourceFromAnnotation(entry);
    const note = [
      notesFromAnnotation(entry),
      sourceNote ? `IPU field source note: ${sourceNote}` : null,
    ].filter(Boolean).join('\n\n') || null;

    return [{
      country_code: countryCode,
      country_name: countryName,
      jurisdiction: 'federal',
      chamber_id: chamber.id,
      office_type: office.office_type,
      office_title: office.office_title,
      role_patterns: office.role_patterns,
      year,
      effective_date: effectiveDate,
      date_to: cleanDate(entry.date_to),
      period: config.period,
      amount: money.amount,
      annual_amount: money.amount,
      currency: money.currency,
      annual_amount_eur: money.currency === 'EUR' ? money.amount : null,
      source_url: exportUrl,
      source_label: config.sourceLabel,
      source_type: 'official',
      trust_level: 1,
      notes: note,
      raw_data: {
        source: 'ipu_parline_api',
        field,
        chamber_id: chamber.id,
        chamber_name: chamberName,
        ipu_public_url: `${IPU_PUBLIC}/parliament/${countryCode}/${chamber.id}/parliamentary-mandate/parliamentary-mandate/`,
        ipu_export_url: exportUrl,
        entry,
      },
    }];
  });
}

function parseDelimitedRows(text: string, delimiter = '\t') {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim()));
}

function buildCountryNameMap(countries: IpuRecord[]) {
  const entries = new Map<string, IpuRecord>();
  for (const country of countries) {
    const names = [
      latestLocalizedListValue(country.attributes.country_name),
      localized(country.attributes.official_name?.value),
    ].filter(Boolean) as string[];
    for (const name of names) entries.set(normalizeName(name), country);
  }
  const aliases: Record<string, string> = {
    'united states of america': 'US',
    'united states': 'US',
    'usa': 'US',
    'uk': 'GB',
    'united kingdom': 'GB',
    'south korea': 'KR',
    'north korea': 'KP',
    'russia': 'RU',
    'czech republic': 'CZ',
    'democratic republic of congo': 'CD',
    'republic of congo': 'CG',
    'ivory coast': 'CI',
    'cape verde': 'CV',
    'eswatini': 'SZ',
    'swaziland': 'SZ',
    'turkey': 'TR',
    'vietnam': 'VN',
    'laos': 'LA',
    'syria': 'SY',
    'bolivia': 'BO',
    'venezuela': 'VE',
    'tanzania': 'TZ',
    'moldova': 'MD',
    'iran': 'IR',
    'palestine': 'PS',
  };
  for (const [name, code] of Object.entries(aliases)) {
    const country = countries.find((candidate) => candidate.id === code);
    if (country) entries.set(name, country);
  }
  return entries;
}

function politicalSalariesTrust(confidence: string | undefined) {
  const normalized = (confidence || '').toLowerCase();
  if (normalized === 'high') return 2;
  if (normalized === 'medium') return 3;
  return 3;
}

async function collectPoliticalSalariesLeaders(countries: IpuRecord[], outDir: string) {
  const text = await fetchText('https://datawrapper.dwcdn.net/CpDI9/1/dataset.csv');
  writeJson(path.join(outDir, 'raw', 'politicalsalaries-leaders-metadata.json'), {
    source_url: 'https://datawrapper.dwcdn.net/CpDI9/1/dataset.csv',
    notes_url: 'https://politicalsalaries.com/about-the-data/',
    fetched_at: new Date().toISOString(),
  });

  const rows = parseDelimitedRows(text, '\t');
  const [header, ...body] = rows;
  const byName = buildCountryNameMap(countries);
  const parsed: CompensationRow[] = [];
  const unmatched: string[] = [];

  for (const row of body) {
    const record = Object.fromEntries(header.map((field, index) => [field, row[index] || '']));
    const countryName = record['Country name'];
    const country = byName.get(normalizeName(countryName));
    const amount = parseAmount(record['Salary (local)']);
    if (!country || amount === null) {
      if (countryName) unmatched.push(countryName);
      continue;
    }
    const source = markdownLink(record.Source);
    const currency = (record['Currency letters'] || 'UNKNOWN').toUpperCase();
    const effectiveDate = parseLooseDate(record['Last updated']) || `${TODAY.slice(0, 4)}-01-01`;
    const year = yearFromDate(effectiveDate) || Number(TODAY.slice(0, 4));
    const resolvedCountryName = latestLocalizedListValue(country.attributes.country_name) || countryName;
    const leaderType = (record['Leader type'] || '').toLowerCase();
    const isPresident = leaderType.includes('president') || leaderType.includes('head of state');
    const officeType = isPresident ? 'head_of_state' : 'head_of_government';

    parsed.push({
      country_code: country.id,
      country_name: resolvedCountryName,
      jurisdiction: 'federal',
      chamber_id: null,
      office_type: officeType,
      office_title: `${resolvedCountryName} ${isPresident ? 'head of state' : 'head of government'}`,
      role_patterns: isPresident ? ['Head of State', 'President'] : ['Head of Government', 'Prime Minister'],
      year,
      effective_date: effectiveDate,
      date_to: null,
      period: 'annual',
      amount,
      annual_amount: amount,
      currency,
      annual_amount_eur: currency === 'EUR' ? amount : null,
      source_url: source.url,
      source_label: `PoliticalSalaries leaders: ${source.label}`,
      source_type: 'curated_secondary',
      trust_level: politicalSalariesTrust(record['Data confidence']),
      notes: 'Curated secondary leader salary row; verify against linked primary source before high-stakes use.',
      raw_data: {
        source: 'politicalsalaries_datawrapper_leaders',
        source_dataset_url: 'https://datawrapper.dwcdn.net/CpDI9/1/dataset.csv',
        notes_url: 'https://politicalsalaries.com/about-the-data/',
        row: record,
      },
    });
  }

  return { rows: parsed, unmatched: [...new Set(unmatched)].sort() };
}

async function collectPoliticalSalariesLegislatorFallback(countries: IpuRecord[], countriesWithOfficialMemberPay: Set<string>, outDir: string) {
  const text = await fetchText('https://datawrapper.dwcdn.net/hY5bQ/1/dataset.csv');
  writeJson(path.join(outDir, 'raw', 'politicalsalaries-legislators-metadata.json'), {
    source_url: 'https://datawrapper.dwcdn.net/hY5bQ/1/dataset.csv',
    notes_url: 'https://politicalsalaries.com/about-the-data/',
    fetched_at: new Date().toISOString(),
  });

  const rows = parseDelimitedRows(text, '\t');
  const [header, ...body] = rows;
  const byName = buildCountryNameMap(countries);
  const parsed: CompensationRow[] = [];
  const unmatched: string[] = [];

  for (const row of body) {
    const record = Object.fromEntries(header.map((field, index) => [field, row[index] || '']));
    const countryName = record.Country;
    const country = byName.get(normalizeName(countryName));
    const amount = parseAmount(record['Salary (local currency)']);
    if (!country || amount === null) {
      if (countryName) unmatched.push(countryName);
      continue;
    }
    if (countriesWithOfficialMemberPay.has(country.id)) continue;

    const sourceUrl = record.Link || 'https://politicalsalaries.com/legislators/';
    const currency = (record.Currency || 'UNKNOWN').toUpperCase();
    const effectiveDate = parseLooseDate(record['Last updated (MP)']) || `${TODAY.slice(0, 4)}-01-01`;
    const year = yearFromDate(effectiveDate) || Number(TODAY.slice(0, 4));
    const resolvedCountryName = latestLocalizedListValue(country.attributes.country_name) || countryName;

    parsed.push({
      country_code: country.id,
      country_name: resolvedCountryName,
      jurisdiction: 'federal',
      chamber_id: null,
      office_type: 'member_of_parliament',
      office_title: `${resolvedCountryName} national legislator`,
      role_patterns: ['Member of Parliament', 'Deputy', 'National legislator'],
      year,
      effective_date: effectiveDate,
      date_to: null,
      period: 'annual',
      amount,
      annual_amount: amount,
      currency,
      annual_amount_eur: currency === 'EUR' ? amount : null,
      source_url: sourceUrl,
      source_label: `PoliticalSalaries legislators: ${record.Source || 'dataset'}`,
      source_type: 'curated_secondary',
      trust_level: politicalSalariesTrust(record['Confidence (MP)']),
      notes: 'Curated secondary fallback because no official IPU basic-salary row was collected for this country.',
      raw_data: {
        source: 'politicalsalaries_datawrapper_legislators',
        source_dataset_url: 'https://datawrapper.dwcdn.net/hY5bQ/1/dataset.csv',
        notes_url: 'https://politicalsalaries.com/about-the-data/',
        row: record,
      },
    });
  }

  return { rows: parsed, unmatched: [...new Set(unmatched)].sort() };
}

function officialSalaryLinks(parliament: IpuRecord | undefined) {
  const raw = parliament?.attributes.info_salary_links?.value;
  if (!Array.isArray(raw)) return [] as Array<{ title: string | null; url: string }>;
  return raw
    .filter((entry) => typeof entry?.url === 'string' && entry.url.startsWith('http'))
    .map((entry) => ({ title: typeof entry.title === 'string' ? entry.title : null, url: entry.url }));
}

function chamberWebsite(chamber: IpuRecord) {
  const raw = latestListValue(chamber.attributes.parliamentary_website_url);
  if (typeof raw === 'string') return raw || null;
  if (raw && typeof raw === 'object') return raw.url || localized(raw) || null;
  return null;
}

function buildWorldSourceCatalog(countries: IpuRecord[], parliaments: IpuRecord[], chambers: IpuRecord[], progress: CountryProgress[]) {
  const parliamentByCode = new Map(parliaments.map((parliament) => [parliament.id, parliament]));
  const chambersByCountry = new Map<string, IpuRecord[]>();
  for (const chamber of chambers) {
    const code = chamber.id.slice(0, 2);
    if (!chambersByCountry.has(code)) chambersByCountry.set(code, []);
    chambersByCountry.get(code)!.push(chamber);
  }

  const progressByCode = new Map(progress.map((entry) => [entry.country_code, entry]));
  return {
    schema_version: 1,
    updated_at: TODAY,
    generated_from: [
      `${IPU_API}/countries?page[size]=300`,
      `${IPU_API}/parliaments?page[size]=300`,
      `${IPU_API}/chambers?page[size]=300`,
      'https://datawrapper.dwcdn.net/CpDI9/1/dataset.csv',
      'https://datawrapper.dwcdn.net/hY5bQ/1/dataset.csv',
    ],
    countries: Object.fromEntries(countries.map((country) => {
      const code = country.id;
      const parliament = parliamentByCode.get(code);
      const countryChambers = chambersByCountry.get(code) || [];
      const countryName = latestLocalizedListValue(country.attributes.country_name) || code;
      const progressEntry = progressByCode.get(code);
      return [code, {
        name: countryName,
        official_name: localized(country.attributes.official_name?.value),
        iso_alpha3: country.attributes.iso_alpha3?.value || null,
        ipu_country_api_url: `${IPU_API}/countries?filter=id:eq:${code}`,
        ipu_parliament_api_url: `${IPU_API}/parliaments?filter=id:eq:${code}`,
        ipu_public_url: `${IPU_PUBLIC}/parliament/${code}/`,
        official_salary_links: progressEntry?.official_salary_links || officialSalaryLinks(parliament),
        chambers: countryChambers.map((chamber) => {
          const chamberName = latestLocalizedListValue(chamber.attributes.chamber_name) || chamber.id;
          return {
            chamber_id: chamber.id,
            chamber_name: chamberName,
            chamber_url: `${IPU_PUBLIC}/parliament/${code}/${chamber.id}/parliamentary-mandate/parliamentary-mandate/`,
            parliamentary_website_url: chamberWebsite(chamber),
            pay_exports: Object.fromEntries(Object.keys(FIELD_CONFIG).map((field) => [
              field,
              `${IPU_PUBLIC}/export-historical/${field}/${chamber.id}/csv`,
            ])),
          };
        }),
        collection_status: progressEntry ? {
          records_found: progressEntry.records_found,
          record_counts: progressEntry.record_counts,
          gaps: progressEntry.gaps,
        } : null,
      }];
    })),
  };
}

function buildProgress(countries: IpuRecord[], parliaments: IpuRecord[], chambers: IpuRecord[], rows: CompensationRow[]) {
  const parliamentByCode = new Map(parliaments.map((parliament) => [parliament.id, parliament]));
  const rowsByCountry = new Map<string, CompensationRow[]>();
  for (const row of rows) {
    if (!rowsByCountry.has(row.country_code)) rowsByCountry.set(row.country_code, []);
    rowsByCountry.get(row.country_code)!.push(row);
  }
  const chambersByCountry = new Map<string, IpuRecord[]>();
  for (const chamber of chambers) {
    const code = chamber.id.slice(0, 2);
    if (!chambersByCountry.has(code)) chambersByCountry.set(code, []);
    chambersByCountry.get(code)!.push(chamber);
  }

  return countries.map((country): CountryProgress => {
    const code = country.id;
    const countryRows = rowsByCountry.get(code) || [];
    const countryName = latestLocalizedListValue(country.attributes.country_name) || code;
    const counts = countryRows.reduce<Record<string, number>>((acc, row) => {
      const key = `${row.source_type}:${row.office_type}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const hasOfficialBasicPay = countryRows.some((row) => row.source_type === 'official' && ['member_of_parliament', 'senator'].includes(row.office_type));
    const hasLeaderPay = countryRows.some((row) => row.office_type === 'head_of_government');
    const gaps = [
      hasOfficialBasicPay ? null : 'No official member/senator salary row collected.',
      hasLeaderPay ? null : 'No leader/head-of-government salary row collected from PoliticalSalaries.',
    ].filter(Boolean) as string[];

    const rowSourceLinks = [...countryRows.reduce((acc, row) => {
      if (row.source_url) acc.set(row.source_url, { title: row.source_label || null, url: row.source_url });
      return acc;
    }, new Map<string, { title: string | null; url: string }>()).values()];
    const salaryLinks = [...officialSalaryLinks(parliamentByCode.get(code)), ...rowSourceLinks].reduce((acc, link) => {
      acc.set(link.url, link);
      return acc;
    }, new Map<string, { title: string | null; url: string }>());

    return {
      country_code: code,
      country_name: countryName,
      iso_alpha3: country.attributes.iso_alpha3?.value || null,
      parliament_url: `${IPU_PUBLIC}/parliament/${code}/`,
      ipu_country_api_url: `${IPU_API}/countries?filter=id:eq:${code}`,
      ipu_parliament_api_url: `${IPU_API}/parliaments?filter=id:eq:${code}`,
      official_salary_links: [...salaryLinks.values()],
      chambers: (chambersByCountry.get(code) || []).map((chamber) => {
        const chamberName = latestLocalizedListValue(chamber.attributes.chamber_name) || chamber.id;
        return {
          chamber_id: chamber.id,
          chamber_name: chamberName,
          chamber_url: `${IPU_PUBLIC}/parliament/${code}/${chamber.id}/parliamentary-mandate/parliamentary-mandate/`,
          parliamentary_website_url: chamberWebsite(chamber),
          exports: Object.fromEntries(Object.keys(FIELD_CONFIG).map((field) => {
            const fieldRows = countryRows.filter((row) => row.chamber_id === chamber.id && row.raw_data.field === field);
            return [field, {
              status: fieldRows.length > 0 ? 'collected' : 'missing',
              rows: fieldRows.length,
              export_url: `${IPU_PUBLIC}/export-historical/${field}/${chamber.id}/csv`,
            }];
          })),
        };
      }),
      records_found: countryRows.length,
      record_counts: counts,
      gaps,
    };
  });
}

function dedupeRows(rows: CompensationRow[]) {
  return [...rows.reduce((acc, row) => {
    const key = [
      row.country_code,
      row.jurisdiction,
      row.office_type,
      row.office_title,
      row.year,
      row.effective_date,
      row.source_url,
    ].join('\u0000');
    acc.set(key, row);
    return acc;
  }, new Map<string, CompensationRow>()).values()];
}

async function upsertRows(rows: CompensationRow[]) {
  const supabase = getSupabaseClient(true);
  let applied = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const { error } = await (supabase as any)
      .from('public_office_compensation')
      .upsert(chunk, {
        onConflict: 'country_code,jurisdiction,office_type,office_title,year,effective_date,source_url',
      });
    if (error) throw error;
    applied += chunk.length;
  }
  return applied;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadLocalEnv();
  ensureDir(args.outDir);

  const [countriesPayload, parliamentsPayload, chambersPayload] = await Promise.all([
    fetchJson(`${IPU_API}/countries?page[size]=300`),
    fetchJson(`${IPU_API}/parliaments?page[size]=300`),
    fetchJson(`${IPU_API}/chambers?page[size]=300`),
  ]);

  let countries = (countriesPayload.data || []) as IpuRecord[];
  let parliaments = (parliamentsPayload.data || []) as IpuRecord[];
  let chambers = (chambersPayload.data || []) as IpuRecord[];

  if (args.countries) {
    countries = countries.filter((country) => args.countries!.has(country.id));
    parliaments = parliaments.filter((parliament) => args.countries!.has(parliament.id));
    chambers = chambers.filter((chamber) => args.countries!.has(chamber.id.slice(0, 2)));
  }
  if (args.limitCountries) {
    const limited = new Set(countries.slice(0, args.limitCountries).map((country) => country.id));
    countries = countries.filter((country) => limited.has(country.id));
    parliaments = parliaments.filter((parliament) => limited.has(parliament.id));
    chambers = chambers.filter((chamber) => limited.has(chamber.id.slice(0, 2)));
  }

  writeJson(path.join(args.outDir, 'raw', 'ipu-countries.json'), countriesPayload);
  writeJson(path.join(args.outDir, 'raw', 'ipu-parliaments.json'), parliamentsPayload);
  writeJson(path.join(args.outDir, 'raw', 'ipu-chambers.json'), chambersPayload);

  const ipuRows = chambers.flatMap((chamber) => {
    const country = countries.find((candidate) => candidate.id === chamber.id.slice(0, 2));
    if (!country) return [];
    return [
      ...ipuRowsForField('basic_salary', country, chamber),
      ...ipuRowsForField('speaker_annual_salary', country, chamber),
      ...ipuRowsForField('allowance', country, chamber),
    ];
  });
  const manualRows = loadManualRows(countries);
  const countriesWithOfficialMemberPay = new Set(
    [...ipuRows, ...manualRows]
      .filter((row) => row.source_type === 'official' && ['member_of_parliament', 'senator'].includes(row.office_type))
      .map((row) => row.country_code),
  );
  const leaderRows = await collectPoliticalSalariesLeaders(countries, args.outDir);
  const legislatorRows = await collectPoliticalSalariesLegislatorFallback(countries, countriesWithOfficialMemberPay, args.outDir);
  const europeanParliamentRows = buildEuropeanParliamentSalaryRecords().map((row) => ({
    ...row,
    chamber_id: row.chamber_id || null,
    date_to: row.date_to || null,
    notes: row.notes || null,
  })) as CompensationRow[];
  const rows = dedupeRows([...ipuRows, ...manualRows, ...europeanParliamentRows, ...leaderRows.rows, ...legislatorRows.rows])
    .sort((left, right) =>
      left.country_code.localeCompare(right.country_code) ||
      left.office_type.localeCompare(right.office_type) ||
      right.year - left.year ||
      right.effective_date.localeCompare(left.effective_date),
    );

  const progress = buildProgress(countries, parliaments, chambers, rows);
  const worldCatalog = buildWorldSourceCatalog(countries, parliaments, chambers, progress);
  const report = {
    apply: args.apply,
    collected_at: new Date().toISOString(),
    countries: countries.length,
    parliaments: parliaments.length,
    chambers: chambers.length,
    rows: rows.length,
    official_ipu_rows: ipuRows.length,
    manual_curated_rows: manualRows.length,
    european_parliament_rows: europeanParliamentRows.length,
    political_salaries_leader_rows: leaderRows.rows.length,
    political_salaries_legislator_fallback_rows: legislatorRows.rows.length,
    countries_with_any_rows: new Set(rows.map((row) => row.country_code)).size,
    countries_with_official_member_pay: countriesWithOfficialMemberPay.size,
    countries_with_no_rows: progress.filter((country) => country.records_found === 0).map((country) => country.country_code),
    unmatched_political_salaries_leaders: leaderRows.unmatched,
    unmatched_political_salaries_legislators: legislatorRows.unmatched,
  };

  writeJson(path.join(args.outDir, 'normalized', 'office-compensation-records.json'), rows);
  writeJson(path.join(args.outDir, 'summaries', 'country-progress.json'), progress);
  writeJson(path.join(args.outDir, 'summaries', 'collection-report.json'), report);
  writeJson(path.join('data', 'source-catalog', 'world-country-data-sources.json'), worldCatalog);

  let applied = 0;
  if (args.apply) applied = await upsertRows(rows);

  console.log(JSON.stringify({ ...report, applied, outDir: args.outDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
