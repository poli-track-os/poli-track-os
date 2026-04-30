#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  companyExternalKey,
  emptyInfluenceBundle,
  normalizeInfluenceName,
  type CompanyInput,
  type InfluenceActorInput,
  type InfluenceBundle,
  type InfluenceClientInput,
  type InfluenceContactInput,
  type InfluenceFilingInput,
  type InfluenceMoneyInput,
} from '../src/lib/influence-ingest.ts';
import {
  EU_GCSA_FALLBACK_NAMES,
  isConservativeFecOrganizationReceipt,
  normalizePublicRecordDate,
  parseEgeMembers,
  parsePcastNames,
  parseStrongNames,
  selectLatestSecCompanyFacts,
  summarizeFoiaAnnualReportXml,
  yearFromPublicRecordDate,
} from '../src/lib/public-record-influence-parser.ts';
import {
  applyInfluenceBundle,
  getSupabaseClient,
  loadLocalEnv,
  summarizeBundle,
} from './influence-sync-helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_OUTPUT_DIR = path.join('data', 'influence', 'public-records', 'live', TODAY);
const USER_AGENT = 'poli-track-os public-record collector (contact: research@poli-track-os.local)';

const SEC_COMPANY_SEEDS = [
  { cik: '0000012927', name: 'Boeing Co' },
  { cik: '0000936468', name: 'Lockheed Martin Corp' },
  { cik: '0000101829', name: 'RTX Corp' },
  { cik: '0000040533', name: 'General Dynamics Corp' },
  { cik: '0001133421', name: 'Northrop Grumman Corp' },
  { cik: '0000320193', name: 'Apple Inc' },
  { cik: '0000789019', name: 'Microsoft Corp' },
  { cik: '0001018724', name: 'Amazon.com Inc' },
  { cik: '0001652044', name: 'Alphabet Inc' },
  { cik: '0001326801', name: 'Meta Platforms Inc' },
  { cik: '0001045810', name: 'NVIDIA Corp' },
  { cik: '0001341439', name: 'Oracle Corp' },
  { cik: '0001318605', name: 'Tesla Inc' },
  { cik: '0001067983', name: 'Berkshire Hathaway Inc' },
];

const USASPENDING_KEYWORDS = [
  'LOCKHEED MARTIN',
  'BOEING',
  'RTX',
  'GENERAL DYNAMICS',
  'NORTHROP GRUMMAN',
  'PALANTIR',
  'SPACEX',
  'MICROSOFT',
  'AMAZON WEB SERVICES',
  'ORACLE',
  'ANDURIL',
  'NVIDIA',
];

const FOIA_ANNUAL_REPORT_SOURCES = [
  { code: 'DOJ', xmlUrl: 'https://www.justice.gov/oip/media/1392426/dl?inline=' },
  { code: 'EPA', xmlUrl: 'https://www.epa.gov/system/files/other-files/2025-04/2024-annual-report-xml-format.xml' },
  { code: 'SEC', xmlUrl: 'https://www.sec.gov/files/sec-fy24-final.xml' },
  { code: 'DOI', xmlUrl: 'https://www.doi.gov/sites/default/files/data/fy2024-doi-annual-report-xml.xml' },
  { code: 'CFPB', xmlUrl: 'https://files.consumerfinance.gov/f/documents/cfpb_fy2024-foia-annual-report.xml' },
  { code: 'USTR', xmlUrl: 'https://ustr.gov/sites/default/files/foia/USTR%20FY24%20FINAL.xml' },
  { code: 'FEC', xmlUrl: 'https://www.fec.gov/resources/cms-content/documents/FOIA_annual_report_fiscal_year_2024.xml' },
  { code: 'NARA', xmlUrl: 'https://www.archives.gov/files/foia/nara-fy24-final-final.xml' },
  { code: 'HHS', xmlUrl: 'https://www.hhs.gov/sites/default/files/foia-hhs-fy24.xml' },
  { code: 'USDA', xmlUrl: 'https://www.usda.gov/sites/default/files/documents/usda-foia-annual-report-fy2024.xml' },
  { code: 'DOT', xmlUrl: 'https://www.transportation.gov/sites/dot.gov/files/2025-02/DOT%20-%20FY%202024%20-%20Annual%20FOIA%20Report%20-%20FINAL.xml' },
];

const EU_EXPERT_GROUP_IDS = [
  3820, 3822, 3823, 3824, 3826, 3828, 3829, 3831, 3832, 3833, 3834, 3835,
  3836, 3837, 3838, 3839, 3840, 3280, 3282, 3287,
];

type Args = {
  apply: boolean;
  outputDir: string;
  fecCycle: number;
  fecLimit: number;
  fecCommitteeLimit: number;
  fecContributionLimit: number;
  secCompanies: number;
  secFilingsPerCompany: number;
  secFactsPerCompany: number;
  usaspendingLimit: number;
  foiaLimit: number;
  foiaAnnualYear: number;
  foiaAnnualLimit: number;
  euExpertGroupLimit: number;
  skipFec: boolean;
  skipSec: boolean;
  skipUsaspending: boolean;
  skipFoia: boolean;
  skipAdvisory: boolean;
  skipEuExpertGroups: boolean;
  allowSourceErrors: boolean;
};

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/collect-public-record-influence.ts [--apply]

Options:
  --output-dir DIR             Artifact directory. Default: ${DEFAULT_OUTPUT_DIR}
  --fec-cycle YEAR             FEC cycle/election year. Default: 2026
  --fec-limit N                FEC candidate totals to collect. Default: 40
  --fec-committee-limit N      FEC committees to collect. Default: 40
  --fec-contribution-limit N   Non-individual itemized FEC receipts to collect. Default: 40
  --sec-companies N            SEC seeded companies to collect. Default: 12
  --sec-filings-per-company N  Recent EDGAR filings per company. Default: 6
  --sec-facts-per-company N    Latest SEC XBRL company facts per company. Default: 6
  --usaspending-limit N        Top USAspending contract awards per keyword. Default: 3
  --foia-limit N               FOIA agency components to collect. Default: 75
  --foia-annual-year YEAR      FOIA annual-report fiscal year. Default: 2024
  --foia-annual-limit N        FOIA annual-report agencies to collect. Default: 8
  --eu-expert-group-limit N    EU expert groups to collect. Default: 20
  --skip-fec | --skip-sec | --skip-usaspending | --skip-foia | --skip-advisory | --skip-eu-expert-groups
  --allow-source-errors       Write/apply partial bundles even when a source fails after retries.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    fecCycle: 2026,
    fecLimit: 40,
    fecCommitteeLimit: 40,
    fecContributionLimit: 40,
    secCompanies: 12,
    secFilingsPerCompany: 6,
    secFactsPerCompany: 6,
    usaspendingLimit: 3,
    foiaLimit: 75,
    foiaAnnualYear: 2024,
    foiaAnnualLimit: FOIA_ANNUAL_REPORT_SOURCES.length,
    euExpertGroupLimit: EU_EXPERT_GROUP_IDS.length,
    skipFec: false,
    skipSec: false,
    skipUsaspending: false,
    skipFoia: false,
    skipAdvisory: false,
    skipEuExpertGroups: false,
    allowSourceErrors: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${token}`);
      return value;
    };

    if (token === '--apply') args.apply = true;
    else if (token === '--output-dir') args.outputDir = next();
    else if (token === '--fec-cycle') args.fecCycle = Number.parseInt(next(), 10);
    else if (token === '--fec-limit') args.fecLimit = Number.parseInt(next(), 10);
    else if (token === '--fec-committee-limit') args.fecCommitteeLimit = Number.parseInt(next(), 10);
    else if (token === '--fec-contribution-limit') args.fecContributionLimit = Number.parseInt(next(), 10);
    else if (token === '--sec-companies') args.secCompanies = Number.parseInt(next(), 10);
    else if (token === '--sec-filings-per-company') args.secFilingsPerCompany = Number.parseInt(next(), 10);
    else if (token === '--sec-facts-per-company') args.secFactsPerCompany = Number.parseInt(next(), 10);
    else if (token === '--usaspending-limit') args.usaspendingLimit = Number.parseInt(next(), 10);
    else if (token === '--foia-limit') args.foiaLimit = Number.parseInt(next(), 10);
    else if (token === '--foia-annual-year') args.foiaAnnualYear = Number.parseInt(next(), 10);
    else if (token === '--foia-annual-limit') args.foiaAnnualLimit = Number.parseInt(next(), 10);
    else if (token === '--eu-expert-group-limit') args.euExpertGroupLimit = Number.parseInt(next(), 10);
    else if (token === '--skip-fec') args.skipFec = true;
    else if (token === '--skip-sec') args.skipSec = true;
    else if (token === '--skip-usaspending') args.skipUsaspending = true;
    else if (token === '--skip-foia') args.skipFoia = true;
    else if (token === '--skip-advisory') args.skipAdvisory = true;
    else if (token === '--skip-eu-expert-groups') args.skipEuExpertGroups = true;
    else if (token === '--allow-source-errors') args.allowSourceErrors = true;
    else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid numeric argument ${key}: ${value}`);
    }
  }

  return args;
}

function mergeBundle(target: InfluenceBundle, source: InfluenceBundle) {
  target.actors.push(...source.actors);
  target.companies.push(...source.companies);
  target.officers.push(...source.officers);
  target.ownership.push(...source.ownership);
  target.clients.push(...source.clients);
  target.filings.push(...source.filings);
  target.contacts.push(...source.contacts);
  target.money.push(...source.money);
  target.affiliations.push(...source.affiliations);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function withRetries<T>(label: string, action: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * attempt);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${errorMessage(lastError)}`);
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  return withRetries(url, async () => {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}: ${detail.slice(0, 300)}`);
    }
    return response.json() as Promise<T>;
  });
}

async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  return withRetries(url, async () => {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  });
}

function actorExternal(source: string, name: string) {
  return `${source}:actor:${normalizeInfluenceName(name)}`;
}

function addUniqueActor(bundle: InfluenceBundle, actor: InfluenceActorInput) {
  const external = actor.external_id || `${actor.data_source}:${normalizeInfluenceName(actor.name)}`;
  if (bundle.actors.some((row) => (row.external_id || `${row.data_source}:${normalizeInfluenceName(row.name)}`) === external && row.data_source === actor.data_source)) return;
  bundle.actors.push({ ...actor, external_id: external });
}

function sourceFileUrl(dataSource: string, id: string, fallback: string) {
  if (dataSource === 'sec_edgar') return fallback;
  return fallback || `${dataSource}:${id}`;
}

function stableId(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

type FecCandidateTotal = {
  candidate_id: string;
  name: string;
  party_full?: string | null;
  office_full?: string | null;
  election_year?: number;
  coverage_start_date?: string | null;
  coverage_end_date?: string | null;
  receipts?: number | string | null;
  disbursements?: number | string | null;
  cash_on_hand_end_period?: number | string | null;
  individual_itemized_contributions?: number | string | null;
  address_state?: string | null;
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type FecCommittee = {
  committee_id: string;
  name: string;
  committee_type_full?: string | null;
  designation_full?: string | null;
  organization_type_full?: string | null;
  party_full?: string | null;
  state?: string | null;
  first_file_date?: string | null;
  last_file_date?: string | null;
};

async function collectFecCommittees(cycle: number, limit: number) {
  const bundle = emptyInfluenceBundle();
  if (limit === 0) return { bundle, raw: { results: [] } };
  const apiKey = process.env.FEC_API_KEY || process.env.API_DATA_GOV_KEY || 'DEMO_KEY';
  const url = new URL('https://api.open.fec.gov/v1/committees/');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('cycle', String(cycle));
  url.searchParams.set('sort', 'name');
  url.searchParams.set('per_page', String(limit));
  const payload = await fetchJson<{ results: FecCommittee[]; pagination?: unknown }>(url.toString());

  for (const row of payload.results || []) {
    if (!row.committee_id || !row.name) continue;
    const externalId = `fec:committee:${row.committee_id}`;
    const sourceUrl = `https://www.fec.gov/data/committee/${row.committee_id}/?cycle=${cycle}`;
    addUniqueActor(bundle, {
      actor_kind: 'organisation',
      name: row.name,
      country_code: 'US',
      jurisdiction: 'US federal elections',
      sector: row.committee_type_full || row.organization_type_full || null,
      description: [row.designation_full, row.party_full, row.state].filter(Boolean).join(' · ') || null,
      external_id: externalId,
      data_source: 'us_fec_committee',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    bundle.filings.push({
      filing_id: `fec:committee:${row.committee_id}:${cycle}`,
      filing_type: 'other',
      registrant_actor_external_id: externalId,
      registrant_name: row.name,
      principal_country_code: 'US',
      year: cycle,
      period_start: row.first_file_date || null,
      period_end: row.last_file_date || null,
      issue_areas: ['campaign_finance_committee'],
      target_institutions: ['Federal Election Commission'],
      description: `FEC committee registry entry for ${row.name}`,
      source_url: sourceUrl,
      data_source: 'us_fec_committee',
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
  }

  return { bundle, raw: payload };
}

async function collectFecCandidateTotals(cycle: number, limit: number) {
  const bundle = emptyInfluenceBundle();
  if (limit === 0) return { bundle, raw: { results: [] } };
  const apiKey = process.env.FEC_API_KEY || process.env.API_DATA_GOV_KEY || 'DEMO_KEY';
  const url = new URL('https://api.open.fec.gov/v1/candidates/totals/');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('election_year', String(cycle));
  url.searchParams.set('sort', '-receipts');
  url.searchParams.set('per_page', String(limit));
  const payload = await fetchJson<{ results: FecCandidateTotal[]; pagination?: unknown }>(url.toString());

  for (const row of payload.results || []) {
    if (!row.candidate_id || !row.name) continue;
    const externalId = `fec:candidate:${row.candidate_id}`;
    const receipts = asNumber(row.receipts);
    const disbursements = asNumber(row.disbursements);
    const sourceUrl = `https://www.fec.gov/data/candidate/${row.candidate_id}/?cycle=${cycle}`;
    addUniqueActor(bundle, {
      actor_kind: 'person',
      name: row.name,
      country_code: 'US',
      jurisdiction: 'US federal elections',
      sector: row.office_full || null,
      description: [row.party_full, row.office_full, row.address_state].filter(Boolean).join(' · ') || null,
      external_id: externalId,
      data_source: 'us_fec',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    const filingId = `fec:candidate_totals:${row.candidate_id}:${cycle}`;
    bundle.filings.push({
      filing_id: filingId,
      filing_type: 'other',
      registrant_actor_external_id: externalId,
      registrant_name: row.name,
      year: cycle,
      issue_areas: ['campaign_finance'],
      target_institutions: [row.office_full || 'Federal election'],
      amount_reported: receipts,
      amount_low: receipts,
      amount_high: receipts,
      currency: 'USD',
      period_start: row.coverage_start_date || null,
      period_end: row.coverage_end_date || null,
      description: `FEC candidate committee totals for ${row.name} in the ${cycle} cycle`,
      source_url: sourceUrl,
      data_source: 'us_fec',
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    if (receipts !== null) {
      bundle.money.push({
        filing_external_id: filingId,
        recipient_actor_external_id: externalId,
        money_type: 'donation',
        amount_exact: receipts,
        currency: 'USD',
        period_start: row.coverage_start_date || null,
        period_end: row.coverage_end_date || null,
        description: `FEC total receipts reported by ${row.name}`,
        source_url: sourceUrl,
        data_source: 'us_fec',
        trust_level: 1,
        raw_data: row as Record<string, unknown>,
      });
    }
    if (disbursements !== null) {
      bundle.money.push({
        filing_external_id: filingId,
        recipient_actor_external_id: externalId,
        money_type: 'expense',
        amount_exact: disbursements,
        currency: 'USD',
        period_start: row.coverage_start_date || null,
        period_end: row.coverage_end_date || null,
        description: `FEC total disbursements reported by ${row.name}`,
        source_url: sourceUrl,
        data_source: 'us_fec',
        trust_level: 1,
        raw_data: row as Record<string, unknown>,
      });
    }
  }

  return { bundle, raw: payload };
}

type FecScheduleAReceipt = {
  committee_id?: string | null;
  committee_name?: string | null;
  contributor_name?: string | null;
  contributor_state?: string | null;
  contributor_city?: string | null;
  contributor_employer?: string | null;
  contributor_occupation?: string | null;
  contribution_receipt_amount?: number | string | null;
  contribution_receipt_date?: string | null;
  entity_type?: string | null;
  entity_type_desc?: string | null;
  transaction_id?: string | null;
  sub_id?: string | number | null;
  report_year?: number | null;
  two_year_transaction_period?: number | null;
  committee?: { name?: string | null };
};

async function collectFecOrganizationContributions(cycle: number, limit: number) {
  const bundle = emptyInfluenceBundle();
  if (limit === 0) return { bundle, raw: { results: [] } };
  const apiKey = process.env.FEC_API_KEY || process.env.API_DATA_GOV_KEY || 'DEMO_KEY';
  const url = new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('two_year_transaction_period', String(cycle));
  url.searchParams.set('sort', '-contribution_receipt_amount');
  url.searchParams.set('per_page', String(Math.min(Math.max(limit * 4, limit), 100)));
  const payload = await fetchJson<{ results: FecScheduleAReceipt[]; pagination?: unknown }>(url.toString());
  const selected = (payload.results || [])
    .filter(isConservativeFecOrganizationReceipt)
    .slice(0, limit) as FecScheduleAReceipt[];

  for (const row of selected) {
    const contributorName = row.contributor_name?.trim();
    const committeeId = row.committee_id?.trim();
    const amount = asNumber(row.contribution_receipt_amount);
    if (!contributorName || !committeeId || amount === null) continue;

    const committeeName = row.committee?.name || row.committee_name || committeeId;
    const sourceUrl = `https://www.fec.gov/data/receipts/?two_year_transaction_period=${cycle}&committee_id=${encodeURIComponent(committeeId)}`;
    const committeeExternal = `fec:committee:${committeeId}`;
    const contributorExternal = `fec:contributor:${String(row.entity_type || 'ORG').toLowerCase()}:${normalizeInfluenceName(contributorName)}`;
    const contributorKind = row.entity_type === 'COM' ? 'company' : 'organisation';
    const filingId = `fec:schedule_a:${committeeId}:${row.transaction_id || row.sub_id || stableId(row)}`;

    addUniqueActor(bundle, {
      actor_kind: 'organisation',
      name: committeeName,
      country_code: 'US',
      jurisdiction: 'US federal elections',
      sector: 'campaign_committee',
      external_id: committeeExternal,
      data_source: 'us_fec_contribution',
      source_url: `https://www.fec.gov/data/committee/${committeeId}/?cycle=${cycle}`,
      trust_level: 1,
      raw_data: { committee_id: committeeId, committee_name: committeeName },
    });
    addUniqueActor(bundle, {
      actor_kind: contributorKind,
      name: contributorName,
      country_code: row.contributor_state ? 'US' : null,
      jurisdiction: row.contributor_state || 'US campaign finance disclosure',
      sector: row.entity_type_desc || row.entity_type || null,
      external_id: contributorExternal,
      data_source: 'us_fec_contribution',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    bundle.clients.push({
      external_client_id: contributorExternal,
      name: contributorName,
      client_kind: contributorKind,
      country_code: row.contributor_state ? 'US' : null,
      sector: row.entity_type_desc || row.entity_type || null,
      data_source: 'us_fec_contribution',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    bundle.filings.push({
      filing_id: filingId,
      filing_type: 'other',
      registrant_actor_external_id: committeeExternal,
      registrant_name: committeeName,
      client_external_id: contributorExternal,
      client_name: contributorName,
      principal_country_code: 'US',
      year: row.report_year || row.two_year_transaction_period || cycle,
      period_start: row.contribution_receipt_date || null,
      period_end: row.contribution_receipt_date || null,
      issue_areas: ['campaign_finance_itemized_receipt', row.entity_type || 'organisation'],
      target_institutions: ['Federal Election Commission'],
      amount_reported: amount,
      amount_low: amount,
      amount_high: amount,
      currency: 'USD',
      description: `FEC itemized non-individual receipt from ${contributorName} to ${committeeName}`,
      source_url: sourceUrl,
      data_source: 'us_fec_contribution',
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    bundle.money.push({
      filing_external_id: filingId,
      payer_client_external_id: contributorExternal,
      recipient_actor_external_id: committeeExternal,
      money_type: 'donation',
      amount_exact: amount,
      currency: 'USD',
      period_start: row.contribution_receipt_date || null,
      period_end: row.contribution_receipt_date || null,
      description: `FEC non-individual contribution from ${contributorName} to ${committeeName}`,
      source_url: sourceUrl,
      data_source: 'us_fec_contribution',
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
  }

  return { bundle, raw: { ...payload, selected_count: selected.length } };
}

type SecSubmissions = {
  cik: string;
  name: string;
  tickers?: string[];
  exchanges?: string[];
  sicDescription?: string;
  stateOfIncorporation?: string | null;
  website?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
};

function secFilingUrl(cik: string, accession: string) {
  const cikInt = String(Number.parseInt(cik, 10));
  const compact = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${compact}/${accession}-index.html`;
}

async function collectSecSubmissions(companyLimit: number, filingsPerCompany: number) {
  const bundle = emptyInfluenceBundle();
  const raw: SecSubmissions[] = [];
  for (const seed of SEC_COMPANY_SEEDS.slice(0, companyLimit)) {
    const cik10 = seed.cik.padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const row = await fetchJson<SecSubmissions>(url);
    raw.push(row);
    const sourceUrl = `https://www.sec.gov/edgar/browse/?CIK=${Number.parseInt(cik10, 10)}`;
    const actorId = `sec_edgar:cik:${cik10}`;
    addUniqueActor(bundle, {
      actor_kind: 'company',
      name: row.name || seed.name,
      country_code: 'US',
      jurisdiction: row.stateOfIncorporation || 'US',
      sector: row.sicDescription || null,
      external_id: actorId,
      data_source: 'sec_edgar',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row as Record<string, unknown>,
    });
    bundle.companies.push({
      name: row.name || seed.name,
      registry: 'sec_edgar',
      jurisdiction_code: 'US',
      company_number: cik10,
      legal_form: row.exchanges?.[0] || null,
      sector: row.sicDescription || null,
      website: row.website || null,
      source_url: sourceUrl,
      data_source: 'sec_edgar',
      raw_data: row as Record<string, unknown>,
    });

    const recent = row.filings?.recent;
    const accessions = recent?.accessionNumber || [];
    let included = 0;
    for (let index = 0; index < accessions.length && included < filingsPerCompany; index += 1) {
      const accession = accessions[index];
      const form = recent?.form?.[index] || '';
      if (!accession || !['10-K', '10-Q', '8-K', 'DEF 14A', 'SCHEDULE 13G', 'SCHEDULE 13G/A'].includes(form)) continue;
      included += 1;
      bundle.filings.push({
        filing_id: `sec_edgar:${cik10}:${accession}`,
        filing_type: 'other',
        registrant_actor_external_id: actorId,
        registrant_name: row.name || seed.name,
        principal_country_code: 'US',
        year: Number.parseInt((recent?.filingDate?.[index] || '').slice(0, 4), 10) || null,
        period_start: recent?.reportDate?.[index] || null,
        period_end: recent?.filingDate?.[index] || null,
        issue_areas: ['securities_filing', form],
        target_institutions: ['SEC EDGAR'],
        currency: 'USD',
        description: `${form} filing for ${row.name || seed.name}${recent?.primaryDocDescription?.[index] ? `: ${recent.primaryDocDescription[index]}` : ''}`,
        source_url: secFilingUrl(cik10, accession),
        data_source: 'sec_edgar',
        trust_level: 1,
        raw_data: {
          accession,
          form,
          filingDate: recent?.filingDate?.[index] || null,
          reportDate: recent?.reportDate?.[index] || null,
          primaryDocument: recent?.primaryDocument?.[index] || null,
          primaryDocDescription: recent?.primaryDocDescription?.[index] || null,
          ticker: row.tickers?.[0] || null,
          exchange: row.exchanges?.[0] || null,
        },
      });
    }
  }
  return { bundle, raw };
}

type SecCompanyFacts = {
  cik?: number;
  entityName?: string;
  facts?: Record<string, unknown>;
};

async function collectSecCompanyFacts(companyLimit: number, factsPerCompany: number) {
  const bundle = emptyInfluenceBundle();
  const raw: SecCompanyFacts[] = [];
  for (const seed of SEC_COMPANY_SEEDS.slice(0, companyLimit)) {
    if (factsPerCompany === 0) break;
    const cik10 = seed.cik.padStart(10, '0');
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
    const row = await fetchJson<SecCompanyFacts>(url);
    raw.push(row);
    const name = row.entityName || seed.name;
    const sourceUrl = `https://www.sec.gov/edgar/browse/?CIK=${Number.parseInt(cik10, 10)}`;
    const actorId = `sec_edgar:cik:${cik10}`;
    const company: CompanyInput = {
      name,
      registry: 'sec_edgar',
      jurisdiction_code: 'US',
      company_number: cik10,
      source_url: sourceUrl,
      data_source: 'sec_edgar_companyfacts',
      raw_data: { cik: row.cik, entityName: row.entityName },
    };
    const companyKey = companyExternalKey(company);

    addUniqueActor(bundle, {
      actor_kind: 'company',
      name,
      country_code: 'US',
      jurisdiction: 'US',
      external_id: actorId,
      data_source: 'sec_edgar_companyfacts',
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: { cik: row.cik, entityName: row.entityName },
    });
    bundle.companies.push(company);

    for (const fact of selectLatestSecCompanyFacts(row, factsPerCompany)) {
      const factId = `sec_edgar_companyfacts:${cik10}:${fact.fact_key}:${fact.filed_date || 'unknown'}:${fact.fiscal_year || 'unknown'}:${fact.fiscal_period || 'unknown'}`;
      bundle.filings.push({
        filing_id: factId,
        filing_type: 'other',
        registrant_actor_external_id: actorId,
        registrant_name: name,
        principal_country_code: 'US',
        year: fact.fiscal_year,
        period_start: null,
        period_end: fact.end_date || fact.filed_date,
        issue_areas: ['securities_companyfacts', fact.fact_key, fact.form || 'SEC filing'],
        target_institutions: ['SEC EDGAR'],
        amount_reported: fact.value,
        amount_low: fact.value,
        amount_high: fact.value,
        currency: 'USD',
        description: `${fact.label} reported by ${name} in SEC company facts`,
        source_url: url,
        data_source: 'sec_edgar_companyfacts',
        trust_level: 1,
        raw_data: fact as unknown as Record<string, unknown>,
      });
      bundle.money.push({
        filing_external_id: factId,
        recipient_company_external_key: companyKey,
        money_type: fact.money_type,
        amount_exact: fact.value,
        currency: 'USD',
        period_start: null,
        period_end: fact.end_date || fact.filed_date,
        description: `${fact.label} reported by ${name} in SEC company facts`,
        source_url: url,
        data_source: 'sec_edgar_companyfacts',
        trust_level: 1,
        raw_data: fact as unknown as Record<string, unknown>,
      });
    }
  }
  return { bundle, raw };
}

type UsaSpendingAward = {
  'Award ID'?: string;
  'Recipient Name'?: string;
  'Recipient UEI'?: string;
  'Recipient DUNS Number'?: string;
  'Start Date'?: string;
  'End Date'?: string;
  'Award Amount'?: number;
  'Awarding Agency'?: string;
  'Award Type'?: string | null;
  Description?: string;
  generated_internal_id?: string;
  agency_slug?: string;
  awarding_agency_id?: number;
};

async function collectUsaSpendingAwards(limitPerKeyword: number) {
  const bundle = emptyInfluenceBundle();
  const raw: Record<string, unknown>[] = [];
  const endpoint = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

  for (const keyword of USASPENDING_KEYWORDS) {
    if (limitPerKeyword === 0) break;
    const payload = {
      filters: {
        time_period: [{ start_date: '2024-01-01', end_date: TODAY }],
        recipient_search_text: [keyword],
        award_type_codes: ['A', 'B', 'C', 'D'],
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Recipient UEI',
        'Recipient DUNS Number',
        'Start Date',
        'End Date',
        'Award Amount',
        'Awarding Agency',
        'Award Type',
        'Description',
      ],
      page: 1,
      limit: limitPerKeyword,
      sort: 'Award Amount',
      order: 'desc',
    };
    const response = await fetchJson<{ results: UsaSpendingAward[] }>(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    raw.push({ keyword, response });
    for (const award of response.results || []) {
      const awardId = award['Award ID'] || award.generated_internal_id;
      const recipientName = award['Recipient Name'];
      if (!awardId || !recipientName) continue;
      const company: CompanyInput = {
        name: recipientName,
        registry: 'usaspending',
        jurisdiction_code: 'US',
        company_number: award['Recipient UEI'] || award['Recipient DUNS Number'] || normalizeInfluenceName(recipientName),
        sector: 'government_contractor',
        source_url: `https://www.usaspending.gov/award/${encodeURIComponent(award.generated_internal_id || awardId)}`,
        data_source: 'usaspending',
        raw_data: award as Record<string, unknown>,
      };
      const companyKey = companyExternalKey(company);
      bundle.companies.push(company);
      const agencyName = award['Awarding Agency'] || 'US federal government';
      const agencyExternal = `usaspending:agency:${award.awarding_agency_id || normalizeInfluenceName(agencyName)}`;
      addUniqueActor(bundle, {
        actor_kind: 'state_body',
        name: agencyName,
        country_code: 'US',
        jurisdiction: 'US federal government',
        external_id: agencyExternal,
        data_source: 'usaspending',
        source_url: 'https://api.usaspending.gov/',
        trust_level: 1,
        raw_data: award as Record<string, unknown>,
      });
      const payerClientExternal = `usaspending:payer:${award.awarding_agency_id || normalizeInfluenceName(agencyName)}`;
      const client: InfluenceClientInput = {
        external_client_id: payerClientExternal,
        name: agencyName,
        client_kind: 'state_body',
        country_code: 'US',
        data_source: 'usaspending',
        source_url: 'https://api.usaspending.gov/',
        trust_level: 1,
        raw_data: award as Record<string, unknown>,
      };
      bundle.clients.push(client);
      const filingId = `usaspending:award:${awardId}`;
      const sourceUrl = sourceFileUrl('usaspending', awardId, company.source_url || 'https://www.usaspending.gov/');
      const amount = asNumber(award['Award Amount']);
      bundle.filings.push({
        filing_id: filingId,
        filing_type: 'other',
        registrant_actor_external_id: agencyExternal,
        registrant_name: agencyName,
        client_name: recipientName,
        principal_country_code: 'US',
        year: Number.parseInt((award['Start Date'] || '').slice(0, 4), 10) || null,
        period_start: award['Start Date'] || null,
        period_end: award['End Date'] || null,
        issue_areas: ['public_contract', keyword],
        target_institutions: [agencyName],
        amount_reported: amount,
        amount_low: amount,
        amount_high: amount,
        currency: 'USD',
        description: award.Description || `USAspending award ${awardId} to ${recipientName}`,
        source_url: sourceUrl,
        data_source: 'usaspending',
        trust_level: 1,
        raw_data: award as Record<string, unknown>,
      });
      if (amount !== null) {
        const money: InfluenceMoneyInput = {
          filing_external_id: filingId,
          payer_client_external_id: payerClientExternal,
          recipient_company_external_key: companyKey,
          money_type: 'contract',
          amount_exact: amount,
          currency: 'USD',
          period_start: award['Start Date'] || null,
          period_end: award['End Date'] || null,
          description: `${agencyName} award to ${recipientName}`,
          source_url: sourceUrl,
          data_source: 'usaspending',
          trust_level: 1,
          raw_data: award as Record<string, unknown>,
        };
        bundle.money.push(money);
      }
    }
  }
  return { bundle, raw };
}

type FoiaComponent = {
  type: string;
  id: string;
  links?: { self?: { href?: string } };
  attributes?: { title?: string; abbreviation?: string };
  relationships?: { agency?: { data?: { id?: string } } };
};

type FoiaAgency = {
  type: string;
  id: string;
  attributes?: { name?: string; abbreviation?: string };
};

async function collectFoiaComponents(limit: number) {
  const bundle = emptyInfluenceBundle();
  if (limit === 0) return { bundle, raw: { data: [], included: [] } };
  const apiKey = process.env.FOIA_API_KEY || process.env.API_DATA_GOV_KEY || 'DEMO_KEY';
  const url = 'https://api.foia.gov/api/agency_components?include=agency&fields[agency]=name,abbreviation&fields[agency_component]=title,abbreviation,agency&page[limit]=' + encodeURIComponent(String(limit));
  const payload = await fetchJson<{ data: FoiaComponent[]; included?: FoiaAgency[] }>(url, {
    headers: { 'X-API-Key': apiKey },
  });
  const agencies = new Map((payload.included || []).filter((row) => row.type === 'agency').map((row) => [row.id, row]));
  for (const component of payload.data || []) {
    const title = component.attributes?.title;
    if (!title) continue;
    const agencyId = component.relationships?.agency?.data?.id || null;
    const agency = agencyId ? agencies.get(agencyId) : null;
    if (agency?.attributes?.name) {
      addUniqueActor(bundle, {
        actor_kind: 'state_body',
        name: agency.attributes.name,
        country_code: 'US',
        jurisdiction: 'US federal government',
        external_id: `foia:agency:${agency.id}`,
        data_source: 'us_foia',
        source_url: 'https://www.foia.gov/',
        trust_level: 1,
        raw_data: agency as unknown as Record<string, unknown>,
      });
    }
    const external = `foia:component:${component.id}`;
    addUniqueActor(bundle, {
      actor_kind: 'state_body',
      name: title,
      country_code: 'US',
      jurisdiction: agency?.attributes?.name || 'US federal government',
      description: component.attributes?.abbreviation || null,
      external_id: external,
      data_source: 'us_foia',
      source_url: component.links?.self?.href || 'https://www.foia.gov/',
      trust_level: 1,
      raw_data: component as unknown as Record<string, unknown>,
    });
    bundle.filings.push({
      filing_id: `foia:agency_component:${component.id}`,
      filing_type: 'other',
      registrant_actor_external_id: external,
      registrant_name: title,
      principal_country_code: 'US',
      year: Number.parseInt(TODAY.slice(0, 4), 10),
      issue_areas: ['foia_registry'],
      target_institutions: [agency?.attributes?.name || 'FOIA.gov'],
      description: `FOIA.gov agency component registry entry for ${title}`,
      source_url: component.links?.self?.href || 'https://www.foia.gov/developer/',
      data_source: 'us_foia',
      trust_level: 1,
      raw_data: component as unknown as Record<string, unknown>,
    });
  }
  return { bundle, raw: payload };
}

async function collectFoiaAnnualReports(year: number, limit: number) {
  const bundle = emptyInfluenceBundle();
  const apiKey = process.env.FOIA_API_KEY || process.env.API_DATA_GOV_KEY || 'DEMO_KEY';
  const raw: Record<string, unknown> = {};
  let collected = 0;
  for (const source of FOIA_ANNUAL_REPORT_SOURCES.slice(0, limit)) {
    const agencyCode = source.code;
    const apiUrl = `https://api.foia.gov/api/annual-report-xml/${encodeURIComponent(agencyCode)}/${encodeURIComponent(String(year))}`;
    const candidateUrls = [source.xmlUrl, apiUrl];
    let xml: string | null = null;
    let usedUrl: string | null = null;
    const errors: string[] = [];
    for (const url of candidateUrls) {
      try {
        xml = await fetchText(url, {
          headers: {
            Accept: 'application/xml,text/xml,*/*',
            ...(url === apiUrl
              ? { 'X-API-Key': apiKey }
              : { 'User-Agent': 'Mozilla/5.0 (compatible; poli-track-os public-record collector; +https://example.local)' }),
          },
        });
        usedUrl = url;
        break;
      } catch (error) {
        errors.push(`${url}: ${errorMessage(error)}`);
      }
    }
    if (!xml || !usedUrl) {
      raw[agencyCode] = { skipped: true, errors };
      continue;
    }
    collected += 1;
    const summary = summarizeFoiaAnnualReportXml(xml);
    raw[agencyCode] = { url: usedUrl, xml_length: xml.length, summary };
    const agencyName = summary.agency_name || agencyCode;
    const external = `foia:annual_report_agency:${agencyCode}:${year}`;
    addUniqueActor(bundle, {
      actor_kind: 'state_body',
      name: agencyName,
      country_code: 'US',
      jurisdiction: 'US federal government',
      description: `${agencyCode} FOIA annual report agency`,
      external_id: external,
      data_source: 'us_foia_annual_report',
      source_url: usedUrl,
      trust_level: 1,
      raw_data: summary,
    });
    bundle.filings.push({
      filing_id: `foia:annual_report:${agencyCode}:${year}`,
      filing_type: 'other',
      registrant_actor_external_id: external,
      registrant_name: agencyName,
      principal_country_code: 'US',
      year,
      period_start: `${year}-01-01`,
      period_end: `${year}-12-31`,
      issue_areas: ['foia_annual_report'],
      target_institutions: [agencyName],
      amount_reported: summary.total_cost_amount,
      amount_low: summary.total_cost_amount,
      amount_high: summary.total_cost_amount,
      currency: 'USD',
      description: `FOIA annual report for ${agencyName}: ${summary.request_received_current_year ?? 'unknown'} requests received, ${summary.request_processed_current_year ?? 'unknown'} processed`,
      source_url: usedUrl,
      data_source: 'us_foia_annual_report',
      trust_level: 1,
      raw_data: summary,
    });
  }

  if (limit > 0 && collected === 0) {
    throw new Error('No FOIA annual report XML records collected from direct agency sources or FOIA.gov API fallback');
  }

  return { bundle, raw };
}

function addAdvisoryBody(bundle: InfluenceBundle, source: string, bodyExternal: string, bodyName: string, jurisdiction: string, sourceUrl: string, description: string) {
  addUniqueActor(bundle, {
    actor_kind: 'state_body',
    name: bodyName,
    country_code: jurisdiction,
    jurisdiction,
    description,
    external_id: bodyExternal,
    data_source: source,
    source_url: sourceUrl,
    trust_level: 1,
  });
}

function addAdvisoryMembers(
  bundle: InfluenceBundle,
  options: {
    source: string;
    bodyExternal: string;
    bodyName: string;
    countryCode: string;
    filingId: string;
    sourceUrl: string;
    date: string;
    members: Array<{ name: string; role?: string | null; description?: string | null }>;
  },
) {
  bundle.filings.push({
    filing_id: options.filingId,
    filing_type: 'other',
    registrant_actor_external_id: options.bodyExternal,
    registrant_name: options.bodyName,
    principal_country_code: options.countryCode,
    year: Number.parseInt(options.date.slice(0, 4), 10),
    period_start: options.date,
    issue_areas: ['science_advisory_appointments'],
    target_institutions: [options.bodyName],
    description: `${options.bodyName} membership or appointment record`,
    source_url: options.sourceUrl,
    data_source: options.source,
    trust_level: 1,
  });

  for (const member of options.members) {
    const personExternal = actorExternal(options.source, member.name);
    addUniqueActor(bundle, {
      actor_kind: 'person',
      name: member.name,
      country_code: options.countryCode,
      jurisdiction: options.bodyName,
      sector: 'science_advisory',
      description: [member.role, member.description].filter(Boolean).join(' · ') || null,
      external_id: personExternal,
      data_source: options.source,
      source_url: options.sourceUrl,
      trust_level: 1,
    });
    const contact: InfluenceContactInput = {
      filing_external_id: options.filingId,
      lobby_actor_external_id: personExternal,
      target_name: options.bodyName,
      target_institution: options.bodyName,
      target_country_code: options.countryCode,
      contact_date: options.date,
      contact_type: 'advisory_appointment',
      subject: member.role ? `${member.role} of ${options.bodyName}` : `Member of ${options.bodyName}`,
      source_url: options.sourceUrl,
      data_source: options.source,
      trust_level: 1,
      raw_data: member as Record<string, unknown>,
    };
    bundle.contacts.push(contact);
  }
}

async function collectAdvisoryAppointments() {
  const bundle = emptyInfluenceBundle();
  const raw: Record<string, unknown> = {};

  const pcastUrl = 'https://www.whitehouse.gov/releases/2026/03/president-trump-announces-appointments-to-presidents-council-of-advisors-on-science-and-technology/';
  const pcastHtml = await fetchText(pcastUrl);
  raw.pcast = { url: pcastUrl, html_length: pcastHtml.length };
  addAdvisoryBody(
    bundle,
    'us_pcast',
    'us_pcast:body:2026',
    "President's Council of Advisors on Science and Technology",
    'US',
    pcastUrl,
    'White House science and technology advisory council',
  );
  addAdvisoryMembers(bundle, {
    source: 'us_pcast',
    bodyExternal: 'us_pcast:body:2026',
    bodyName: "President's Council of Advisors on Science and Technology",
    countryCode: 'US',
    filingId: 'us_pcast:appointments:2026-03-25',
    sourceUrl: pcastUrl,
    date: '2026-03-25',
    members: parsePcastNames(pcastHtml).map((name) => ({ name })),
  });

  const gcsaUrl = 'https://research-and-innovation.ec.europa.eu/news/all-research-and-innovation-news/renewal-group-chief-scientific-advisors-2025-05-23_en';
  const gcsaHtml = await fetchText(gcsaUrl);
  raw.euChiefScientificAdvisors = { url: gcsaUrl, html_length: gcsaHtml.length };
  addAdvisoryBody(
    bundle,
    'eu_chief_scientific_advisors',
    'eu_gcsa:body:2025',
    'European Commission Group of Chief Scientific Advisors',
    'EU',
    gcsaUrl,
    'European Commission Scientific Advice Mechanism advisory group',
  );
  addAdvisoryMembers(bundle, {
    source: 'eu_chief_scientific_advisors',
    bodyExternal: 'eu_gcsa:body:2025',
    bodyName: 'European Commission Group of Chief Scientific Advisors',
    countryCode: 'EU',
    filingId: 'eu_gcsa:renewal:2025-05-23',
    sourceUrl: gcsaUrl,
    date: '2025-05-16',
    members: parseStrongNames(gcsaHtml, EU_GCSA_FALLBACK_NAMES).map((name) => ({ name })),
  });

  const egeMembersUrl = 'https://research-and-innovation.ec.europa.eu/strategy/support-policy-making/scientific-support-eu-policies/european-group-ethics/members_en';
  const egeHtml = await fetchText(egeMembersUrl);
  raw.euEge = { url: egeMembersUrl, html_length: egeHtml.length };
  addAdvisoryBody(
    bundle,
    'eu_ege',
    'eu_ege:body:2025',
    'European Group on Ethics in Science and New Technologies',
    'EU',
    egeMembersUrl,
    'European Commission ethics advisory body for science and new technologies',
  );
  addAdvisoryMembers(bundle, {
    source: 'eu_ege',
    bodyExternal: 'eu_ege:body:2025',
    bodyName: 'European Group on Ethics in Science and New Technologies',
    countryCode: 'EU',
    filingId: 'eu_ege:members:2025-01-26',
    sourceUrl: egeMembersUrl,
    date: '2025-01-26',
    members: parseEgeMembers(egeHtml),
  });

  return { bundle, raw };
}

type EuExpertGroupDetail = {
  codeGroup?: string;
  title?: string;
  status?: { code?: string | null; label?: string | null } | string | null;
  abbreviation?: string | null;
  policyAreas?: Array<{ label?: string | null; code?: string | null }>;
  leadDgs?: Array<{ label?: string | null; code?: string | null }>;
  associatedDgs?: Array<{ label?: string | null; code?: string | null }>;
  mission?: string | null;
  tasks?: Array<{ label?: string | null; code?: string | null }>;
  contact?: string | null;
  publicationDate?: string | null;
  updateDate?: string | null;
  type?: unknown;
};

function labels(rows: Array<{ label?: string | null; code?: string | null }> | undefined) {
  return (rows || []).map((row) => row.label || row.code).filter((value): value is string => Boolean(value));
}

async function collectEuExpertGroups(limit: number) {
  const bundle = emptyInfluenceBundle();
  const raw: Record<string, unknown> = {};
  for (const groupId of EU_EXPERT_GROUP_IDS.slice(0, limit)) {
    const apiUrl = `https://ec.europa.eu/transparency/expert-groups-register/core/api/front/expertGroups/${groupId}`;
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 404 || response.status === 204) {
      raw[groupId] = { status: response.status, skipped: true };
      continue;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${apiUrl} ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`);
    }
    const text = await response.text();
    if (!text.trim()) {
      raw[groupId] = { status: response.status, skipped: true };
      continue;
    }
    const detail = JSON.parse(text) as EuExpertGroupDetail;
    raw[groupId] = detail;
    const code = (detail.codeGroup || String(groupId)).trim();
    const title = detail.title?.trim();
    if (!title) continue;
    const sourceUrl = `https://ec.europa.eu/transparency/expert-groups-register/core/api/front/expertGroups/${groupId}`;
    const screenUrl = `https://ec.europa.eu/transparency/expert-groups-register/screen/expert-groups/consult?lang=en&groupID=${groupId}`;
    const bodyExternal = `eu_expert_groups:group:${code || groupId}`;
    const policyAreas = labels(detail.policyAreas);
    const leadDgs = labels(detail.leadDgs);
    const associatedDgs = labels(detail.associatedDgs);
    const tasks = labels(detail.tasks);
    const status = typeof detail.status === 'string' ? detail.status : detail.status?.label || detail.status?.code || null;
    const publicationDate = normalizePublicRecordDate(detail.publicationDate);
    const updateDate = normalizePublicRecordDate(detail.updateDate);

    addUniqueActor(bundle, {
      actor_kind: 'state_body',
      name: title,
      country_code: 'EU',
      jurisdiction: 'European Commission',
      sector: policyAreas.join('; ') || null,
      description: [code, status, detail.abbreviation].filter(Boolean).join(' · ') || null,
      external_id: bodyExternal,
      data_source: 'eu_expert_groups',
      source_url: screenUrl,
      trust_level: 1,
      raw_data: detail as unknown as Record<string, unknown>,
    });
    bundle.filings.push({
      filing_id: `eu_expert_groups:${code || groupId}`,
      filing_type: 'other',
      registrant_actor_external_id: bodyExternal,
      registrant_name: title,
      principal_country_code: 'EU',
      year: yearFromPublicRecordDate(detail.publicationDate || detail.updateDate),
      period_start: publicationDate,
      period_end: updateDate,
      issue_areas: ['expert_group_registry', ...policyAreas, ...tasks],
      target_institutions: [...new Set([...leadDgs, ...associatedDgs, 'European Commission'])],
      description: detail.mission || `${title} expert group metadata from the European Commission Register of Expert Groups`,
      source_url: sourceUrl,
      data_source: 'eu_expert_groups',
      trust_level: 1,
      raw_data: detail as unknown as Record<string, unknown>,
    });
  }

  return { bundle, raw };
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function collectAll(args: Args) {
  const combined = emptyInfluenceBundle();
  const raw: Record<string, unknown> = {};
  const sourceSummaries: Record<string, ReturnType<typeof summarizeBundle>> = {};
  const sourceErrors: Record<string, string> = {};

  async function collectSource(
    key: string,
    action: () => Promise<{ bundle: InfluenceBundle; raw: unknown }>,
  ) {
    try {
      const result = await action();
      mergeBundle(combined, result.bundle);
      raw[key] = result.raw;
      sourceSummaries[key] = summarizeBundle(result.bundle);
    } catch (error) {
      sourceErrors[key] = errorMessage(error);
    }
  }

  if (!args.skipFec) {
    await collectSource('us_fec', () => collectFecCandidateTotals(args.fecCycle, args.fecLimit));
    await collectSource('us_fec_committee', () => collectFecCommittees(args.fecCycle, args.fecCommitteeLimit));
    await collectSource('us_fec_contribution', () => collectFecOrganizationContributions(args.fecCycle, args.fecContributionLimit));
  }
  if (!args.skipSec) {
    await collectSource('sec_edgar', () => collectSecSubmissions(args.secCompanies, args.secFilingsPerCompany));
    await collectSource('sec_edgar_companyfacts', () => collectSecCompanyFacts(args.secCompanies, args.secFactsPerCompany));
  }
  if (!args.skipUsaspending) {
    await collectSource('usaspending', () => collectUsaSpendingAwards(args.usaspendingLimit));
  }
  if (!args.skipFoia) {
    await collectSource('us_foia', () => collectFoiaComponents(args.foiaLimit));
    await collectSource('us_foia_annual_report', () => collectFoiaAnnualReports(args.foiaAnnualYear, args.foiaAnnualLimit));
  }
  if (!args.skipAdvisory) {
    await collectSource('advisory', () => collectAdvisoryAppointments());
  }
  if (!args.skipEuExpertGroups) {
    await collectSource('eu_expert_groups', () => collectEuExpertGroups(args.euExpertGroupLimit));
  }

  return { bundle: combined, raw, sourceSummaries, sourceErrors };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const { bundle, raw, sourceSummaries, sourceErrors } = await collectAll(args);
  const summary = summarizeBundle(bundle);
  const rawPath = path.join(args.outputDir, 'raw', 'public-records.json');
  const bundlePath = path.join(args.outputDir, 'normalized', 'public-record-influence-bundle.json');
  const reportPath = path.join(args.outputDir, 'summaries', 'public-record-collection-report.json');

  writeJson(rawPath, raw);
  writeJson(bundlePath, bundle);

  let applied: ReturnType<typeof summarizeBundle> | null = null;
  const sourceErrorCount = Object.keys(sourceErrors).length;

  const baseReport = {
    generated_at: new Date().toISOString(),
    apply: args.apply,
    args,
    source_summaries: sourceSummaries,
    source_errors: sourceErrors,
    summary,
    artifacts: { rawPath, bundlePath, reportPath },
  };

  if (sourceErrorCount > 0 && !args.allowSourceErrors) {
    const report = {
      ...baseReport,
      status: 'failed_source_errors',
      applied,
    };
    writeJson(reportPath, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (args.apply) {
    const supabase = getSupabaseClient(true);
    applied = await applyInfluenceBundle(supabase, bundle);
  }

  const report = {
    ...baseReport,
    status: sourceErrorCount > 0 ? 'completed_with_source_errors' : 'completed',
    applied,
  };
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export {
  collectAdvisoryAppointments,
  collectFecCandidateTotals,
  collectFecCommittees,
  collectFecOrganizationContributions,
  collectEuExpertGroups,
  collectFoiaAnnualReports,
  collectFoiaComponents,
  collectSecCompanyFacts,
  collectSecSubmissions,
  collectUsaSpendingAwards,
};
