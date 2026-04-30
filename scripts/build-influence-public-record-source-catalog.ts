#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TODAY = new Date().toISOString().slice(0, 10);
const WORLD_CATALOG_PATH = path.join('data', 'source-catalog', 'world-country-data-sources.json');
const OUTPUT_PATH = path.join('data', 'source-catalog', 'influence-public-record-sources.json');

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

const PRIORITY_FOREIGN_PRINCIPAL_COUNTRIES = new Set([
  'CN', 'RU', 'AE', 'BH', 'EG', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA',
  'SA', 'SY', 'TR', 'YE',
]);

const SOURCE_DEFINITIONS = {
  opencorporates: {
    category: 'company_registry',
    label: 'OpenCorporates company registry index',
    jurisdiction: 'global',
    url: 'https://opencorporates.com/',
    trust_level: 2,
    existing_script: 'scripts/sync-opencorporates.ts',
    platform_targets: ['companies', 'company_officers', 'beneficial_ownership'],
    notes: 'Global company identity and officer source. Prefer official national registries where a country-specific direct source is added later.',
  },
  opensanctions: {
    category: 'pep_sanctions_state_linkage',
    label: 'OpenSanctions PEP and sanctions datasets',
    jurisdiction: 'global',
    url: 'https://www.opensanctions.org/datasets/',
    trust_level: 2,
    existing_script: 'scripts/sync-opensanctions.ts',
    platform_targets: ['influence_actors', 'entity_aliases'],
    notes: 'Structured cross-border PEP, sanctions, and state-linked actor data with source references.',
  },
  wikidata: {
    category: 'identity_aliases',
    label: 'Wikidata SPARQL endpoint',
    jurisdiction: 'global',
    url: 'https://query.wikidata.org/sparql',
    trust_level: 2,
    existing_script: 'scripts/sync-public-affiliations.ts',
    platform_targets: ['entity_aliases', 'public_affiliations'],
    notes: 'Identity aliases and reviewed public affiliations only; sensitive affiliations remain hidden until reviewed.',
  },
  us_fec: {
    category: 'campaign_finance',
    label: 'Federal Election Commission OpenFEC API',
    jurisdiction: 'US',
    url: 'https://api.open.fec.gov/developers/',
    api_url_template: 'https://api.open.fec.gov/v1/candidates/totals/?election_year={cycle}',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_filings', 'influence_money'],
    notes: 'Candidate campaign-finance totals. Itemized individual donor records are public but are intentionally excluded from the live collector.',
  },
  us_fec_committee: {
    category: 'campaign_finance',
    label: 'Federal Election Commission committee registry',
    jurisdiction: 'US',
    url: 'https://api.open.fec.gov/developers/',
    api_url_template: 'https://api.open.fec.gov/v1/committees/?cycle={cycle}',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_filings'],
    notes: 'Official FEC committee identity and registration metadata.',
  },
  us_fec_contribution: {
    category: 'campaign_finance',
    label: 'Federal Election Commission non-individual itemized receipts',
    jurisdiction: 'US',
    url: 'https://api.open.fec.gov/developers/',
    api_url_template: 'https://api.open.fec.gov/v1/schedules/schedule_a/?two_year_transaction_period={cycle}',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_clients', 'influence_filings', 'influence_money'],
    notes: 'Only organization, committee, PAC, and party receipts are collected; individual and candidate-name receipt rows are skipped to keep the platform conservative.',
  },
  us_fec_bulk_contribution: {
    category: 'campaign_finance_bulk',
    label: 'Federal Election Commission bulk non-individual receipts',
    jurisdiction: 'US',
    url: 'https://www.fec.gov/data/browse-data/?tab=bulk-data',
    api_url_template: 'https://www.fec.gov/files/bulk-downloads/{cycle}/oth{cycle2}.zip',
    trust_level: 1,
    existing_script: 'scripts/collect-fec-bulk-contributions.ts',
    platform_targets: ['influence_actors', 'influence_clients', 'influence_filings', 'influence_money'],
    notes: 'Official FEC bulk receipts fallback for committee, organisation, PAC, and party entity types. Individual rows are excluded.',
  },
  us_lda: {
    category: 'lobbying_disclosure',
    label: 'US Senate Lobbying Disclosure Act filings API',
    jurisdiction: 'US',
    url: 'https://lda.senate.gov/api/v1/filings/',
    trust_level: 1,
    existing_script: 'scripts/sync-us-lda.ts',
    platform_targets: ['influence_filings', 'influence_clients', 'influence_money', 'influence_contacts'],
    notes: 'Official US federal lobbying reports.',
  },
  us_fara: {
    category: 'foreign_agent_disclosure',
    label: 'US DOJ FARA eFile API',
    jurisdiction: 'US',
    url: 'https://efile.fara.gov/',
    api_url: 'https://efile.fara.gov/api/v1',
    trust_level: 1,
    existing_script: 'scripts/sync-us-fara.ts',
    platform_targets: ['influence_filings', 'influence_clients', 'influence_money', 'influence_contacts'],
    notes: 'Official US foreign-agent registration and activity records.',
  },
  sec_edgar: {
    category: 'securities_filings',
    label: 'SEC EDGAR submissions API',
    jurisdiction: 'US',
    url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    api_url_template: 'https://data.sec.gov/submissions/CIK{cik10}.json',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['companies', 'influence_actors', 'influence_filings'],
    notes: 'Official public-company filing history and issuer metadata.',
  },
  sec_edgar_companyfacts: {
    category: 'securities_facts',
    label: 'SEC EDGAR XBRL company facts API',
    jurisdiction: 'US',
    url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    api_url_template: 'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['companies', 'influence_actors', 'influence_filings', 'influence_money'],
    notes: 'Official issuer financial facts such as revenue, net income, assets, cash, and debt.',
  },
  usaspending: {
    category: 'public_spending',
    label: 'USAspending API',
    jurisdiction: 'US',
    url: 'https://api.usaspending.gov/',
    api_url: 'https://api.usaspending.gov/api/v2/search/spending_by_award/',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['companies', 'influence_filings', 'influence_money'],
    notes: 'Official federal award and contract data under the DATA Act.',
  },
  us_foia: {
    category: 'foia_registry',
    label: 'FOIA.gov agency component API',
    jurisdiction: 'US',
    url: 'https://www.foia.gov/developer/',
    api_url: 'https://api.foia.gov/api/agency_components',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_filings'],
    notes: 'Official agency-component registry and annual-report XML endpoints. Request-level FOIA data requires agency-specific handling.',
  },
  us_foia_annual_report: {
    category: 'foia_annual_report',
    label: 'FOIA annual report XML sources',
    jurisdiction: 'US',
    url: 'https://www.foia.gov/developer/',
    api_url_template: 'https://api.foia.gov/api/annual-report-xml/{agency}/{year}',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_filings'],
    notes: 'Official agency-level annual FOIA workload, backlog, staffing, and cost summaries. The collector uses direct agency XML files first and FOIA.gov API as fallback when rate limits permit.',
  },
  us_pcast: {
    category: 'science_advisory_appointments',
    label: "White House President's Council of Advisors on Science and Technology appointments",
    jurisdiction: 'US',
    url: 'https://www.whitehouse.gov/releases/2026/03/president-trump-announces-appointments-to-presidents-council-of-advisors-on-science-and-technology/',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_contacts', 'influence_filings'],
    notes: 'Official White House advisory appointment announcement.',
  },
  eu_transparency_register: {
    category: 'lobbying_disclosure',
    label: 'EU Transparency Register',
    jurisdiction: 'EU',
    url: 'https://transparency-register.europa.eu/index_en',
    trust_level: 1,
    existing_script: 'scripts/sync-eu-transparency.ts',
    platform_targets: ['influence_filings', 'influence_clients', 'influence_money', 'influence_contacts'],
    notes: 'Official EU register of interest representatives.',
  },
  lobbyfacts: {
    category: 'lobbying_disclosure_secondary',
    label: 'LobbyFacts',
    jurisdiction: 'EU',
    url: 'https://www.lobbyfacts.eu/',
    trust_level: 2,
    existing_script: 'scripts/sync-lobbyfacts.ts',
    platform_targets: ['lobby_organisations', 'lobby_spend', 'influence_filings'],
    notes: 'Secondary structured EU transparency data with references back to official records.',
  },
  eu_expert_groups: {
    category: 'expert_group_registry',
    label: 'European Commission Register of Expert Groups',
    jurisdiction: 'EU',
    url: 'https://commission.europa.eu/about/service-standards-and-principles/transparency/register-expert-groups_en',
    api_url_template: 'https://ec.europa.eu/transparency/expert-groups-register/core/api/front/expertGroups/{group_id}',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_contacts', 'influence_filings'],
    notes: 'Official register with group missions, tasks, membership, minutes, agendas, and reports.',
  },
  eu_chief_scientific_advisors: {
    category: 'science_advisory_appointments',
    label: 'European Commission Group of Chief Scientific Advisors',
    jurisdiction: 'EU',
    url: 'https://research-and-innovation.ec.europa.eu/strategy/support-policy-making/scientific-support-eu-policies/group-chief-scientific-advisors_en',
    source_url: 'https://research-and-innovation.ec.europa.eu/news/all-research-and-innovation-news/renewal-group-chief-scientific-advisors-2025-05-23_en',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_contacts', 'influence_filings'],
    notes: 'Official European Commission science-advice body and member renewal record.',
  },
  eu_ege: {
    category: 'ethics_advisory_appointments',
    label: 'European Group on Ethics in Science and New Technologies',
    jurisdiction: 'EU',
    url: 'https://research-and-innovation.ec.europa.eu/strategy/support-policy-making/scientific-support-eu-policies/european-group-ethics_en',
    members_url: 'https://research-and-innovation.ec.europa.eu/strategy/support-policy-making/scientific-support-eu-policies/european-group-ethics/members_en',
    trust_level: 1,
    existing_script: 'scripts/collect-public-record-influence.ts',
    platform_targets: ['influence_actors', 'influence_contacts', 'influence_filings'],
    notes: 'Official European Commission ethics advisory body and member pages.',
  },
} as const;

type WorldCountry = {
  name: string;
  official_name?: string;
  iso_alpha3?: string;
  ipu_public_url?: string;
  official_salary_links?: Array<{ title: string | null; url: string }>;
  collection_status?: { records_found?: number; gaps?: string[] };
};

type WorldCatalog = {
  countries: Record<string, WorldCountry>;
};

function sourceKeysForCountry(code: string) {
  const keys = ['opencorporates', 'opensanctions', 'wikidata'];
  if (code === 'US') {
    keys.push(
      'us_fec',
      'us_fec_committee',
      'us_fec_contribution',
      'us_fec_bulk_contribution',
      'us_lda',
      'us_fara',
      'sec_edgar',
      'sec_edgar_companyfacts',
      'usaspending',
      'us_foia',
      'us_foia_annual_report',
      'us_pcast',
    );
  }
  if (EU_COUNTRY_CODES.has(code)) {
    keys.push('eu_transparency_register', 'lobbyfacts', 'eu_expert_groups', 'eu_chief_scientific_advisors', 'eu_ege');
  }
  return keys;
}

function coverageLevelForCountry(code: string) {
  if (code === 'US') return 'us_federal_public_records';
  if (EU_COUNTRY_CODES.has(code)) return 'eu_institutional_public_records';
  if (PRIORITY_FOREIGN_PRINCIPAL_COUNTRIES.has(code)) return 'priority_foreign_principal_global_references';
  return 'global_reference_only';
}

function coverageNotes(code: string, country: WorldCountry) {
  const notes: string[] = [];
  if (code === 'US') {
    notes.push('US federal campaign finance, lobbying, foreign-agent, securities, spending, FOIA agency, and PCAST records are in the live public-record collector.');
  } else if (EU_COUNTRY_CODES.has(code)) {
    notes.push('EU-level lobbying and advisory-group records apply to this member state through EU institutions; domestic national lobbying registries still need country-specific additions.');
  } else {
    notes.push('No comparable domestic lobbying/advisory registry has been wired for this country yet; use global PEP/sanctions/company sources plus US/EU foreign-principal disclosures when the country appears there.');
  }
  if (PRIORITY_FOREIGN_PRINCIPAL_COUNTRIES.has(code)) {
    notes.push('Priority foreign-principal coverage: collect appearances in LDA/FARA/EU transparency records, OpenSanctions, OpenCorporates, and official company/state sources before using media.');
  }
  if (country.collection_status?.gaps?.length) {
    notes.push(...country.collection_status.gaps.map((gap) => `Office-compensation gap from world catalog: ${gap}`));
  }
  return notes;
}

function buildCatalog() {
  const world = JSON.parse(fs.readFileSync(WORLD_CATALOG_PATH, 'utf8')) as WorldCatalog;
  const countries = Object.fromEntries(
    Object.entries(world.countries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, country]) => [
        code,
        {
          name: country.name,
          official_name: country.official_name || null,
          iso_alpha3: country.iso_alpha3 || null,
          ipu_public_url: country.ipu_public_url || null,
          coverage_level: coverageLevelForCountry(code),
          source_keys: sourceKeysForCountry(code),
          official_salary_links: country.official_salary_links || [],
          office_compensation_records_found: country.collection_status?.records_found ?? 0,
          coverage_notes: coverageNotes(code, country),
        },
      ]),
  );

  return {
    schema_version: 1,
    updated_at: TODAY,
    purpose: 'Country-by-country source registry for public-record influence, corporate, spending, FOIA, and advisory-appointment collection.',
    evidence_policy: {
      trust_1: 'Official government, parliament, regulator, court, or intergovernmental source.',
      trust_2: 'Structured secondary dataset with references to official or reputable sources.',
      trust_3: 'Media or derived source; use when official data is missing and retain source notes.',
      trust_4: 'Unreviewed sensitive claims; never expose publicly until reviewed.',
    },
    source_definitions: SOURCE_DEFINITIONS,
    countries,
  };
}

function main() {
  const catalog = buildCatalog();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog)}\n`);
  console.log(JSON.stringify({
    output: OUTPUT_PATH,
    countries: Object.keys(catalog.countries).length,
    sources: Object.keys(catalog.source_definitions).length,
  }, null, 2));
}

main();
