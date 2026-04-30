export type OfficeCompensationSourceType = 'official' | 'curated_secondary';

export type OfficeCompensationInput = {
  country_code: string;
  country_name: string;
  jurisdiction: string;
  chamber_id?: string | null;
  office_type: string;
  office_title: string;
  role_patterns: string[];
  year: number;
  effective_date: string;
  date_to?: string | null;
  period: string;
  amount: number;
  annual_amount: number;
  currency: string;
  annual_amount_eur?: number | null;
  source_url: string;
  source_label: string;
  source_type: OfficeCompensationSourceType;
  trust_level: number;
  notes?: string | null;
  raw_data: Record<string, unknown>;
};

export type IpuChamberKind = 'lower' | 'upper';

export type IpuCompensationOptions = {
  countryCode: string;
  countryName: string;
  chamberId: string;
  chamberKind: IpuChamberKind;
  sourceUrl: string;
  sourceLabel?: string;
};

export type PoliticianCompensationMatchInput = {
  countryId?: string;
  jurisdiction?: string;
  role?: string;
};

export const SYSTEM_COUNTRIES: Record<string, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GR: 'Greece',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
};

const POLITICAL_SALARIES_NAME_TO_CODE: Record<string, string> = {
  Austria: 'AT',
  Belgium: 'BE',
  Bulgaria: 'BG',
  Cyprus: 'CY',
  'Czech Republic': 'CZ',
  Czechia: 'CZ',
  Germany: 'DE',
  Denmark: 'DK',
  Estonia: 'EE',
  Spain: 'ES',
  Finland: 'FI',
  France: 'FR',
  Greece: 'GR',
  Croatia: 'HR',
  Hungary: 'HU',
  Ireland: 'IE',
  Italy: 'IT',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Latvia: 'LV',
  Malta: 'MT',
  Netherlands: 'NL',
  Poland: 'PL',
  Portugal: 'PT',
  Romania: 'RO',
  Sweden: 'SE',
  Slovenia: 'SI',
  Slovakia: 'SK',
};

export const OFFICE_TYPE_LABELS: Record<string, string> = {
  member_of_european_parliament: 'Member of European Parliament',
  member_of_parliament: 'Member of Parliament',
  senator: 'Senator / upper-chamber member',
  head_of_government: 'Head of Government',
  head_of_state: 'Head of State',
  minister: 'Minister / secretary',
  speaker: 'Speaker / presiding officer',
  basic_allowance: 'Basic allowance',
};

export function parseDelimitedRows(text: string, delimiter = ',') {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
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

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

export function parseMoneyAmount(value: string | undefined) {
  if (!value) return null;
  const normalized = value
    .replace(/\u00a0/g, ' ')
    .replace(/[,\s]/g, '')
    .replace(/[€$£A-Z]{2,}/gi, '')
    .trim();
  if (!normalized || /no information/i.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeCurrency(value: string | undefined, fallback = 'EUR') {
  const normalized = (value || fallback).replace(/[()]/g, ' ').trim().split(/\s+/)[0]?.toUpperCase();
  return normalized || fallback;
}

function yearFromDate(value: string | undefined) {
  const match = value?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function cleanDate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === ' ') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function ipuChamberOfficeType(chamberKind: IpuChamberKind) {
  return chamberKind === 'upper' ? 'senator' : 'member_of_parliament';
}

export function ipuChamberOfficeTitle(countryName: string, chamberKind: IpuChamberKind) {
  return chamberKind === 'upper'
    ? `${countryName} upper-chamber member`
    : `${countryName} lower-house member`;
}

export function ipuRolePatterns(countryCode: string, chamberKind: IpuChamberKind) {
  if (chamberKind === 'upper') return ['Senator', 'Member of Senate', 'Upper-chamber member'];
  if (countryCode === 'DE') return ['Member of Bundestag', 'Member of Parliament'];
  return ['Member of Parliament', 'Deputy'];
}

export function parseIpuBasicSalaryCsv(text: string, options: IpuCompensationOptions): OfficeCompensationInput[] {
  const rows = parseDelimitedRows(text);
  const headerIndex = rows.findIndex((row) => row[0] === 'Updated at' && row.some((cell) => cell === 'Basic salary, per year'));
  if (headerIndex === -1) return [];

  const header = rows[headerIndex];
  const amountIndex = header.indexOf('Basic salary, per year');
  const currencyIndex = header.indexOf('Basic salary, per year - Currency');
  const dateFromIndex = header.indexOf('Date from');
  const dateToIndex = header.indexOf('Date to');
  const officeType = ipuChamberOfficeType(options.chamberKind);
  const officeTitle = ipuChamberOfficeTitle(options.countryName, options.chamberKind);

  return rows.slice(headerIndex + 1).flatMap((row) => {
    const amount = parseMoneyAmount(row[amountIndex]);
    const effectiveDate = cleanDate(row[dateFromIndex]) || `${row[0]?.slice(0, 4)}-01-01`;
    const year = yearFromDate(effectiveDate) || yearFromDate(row[0]);
    if (!amount || !year) return [];
    const currency = normalizeCurrency(row[currencyIndex]);

    return [{
      country_code: options.countryCode,
      country_name: options.countryName,
      jurisdiction: 'federal',
      chamber_id: options.chamberId,
      office_type: officeType,
      office_title: officeTitle,
      role_patterns: ipuRolePatterns(options.countryCode, options.chamberKind),
      year,
      effective_date: effectiveDate,
      date_to: cleanDate(row[dateToIndex]),
      period: 'annual',
      amount,
      annual_amount: amount,
      currency,
      annual_amount_eur: currency === 'EUR' ? amount : null,
      source_url: options.sourceUrl,
      source_label: options.sourceLabel || 'IPU Parline parliamentary mandate',
      source_type: 'official',
      trust_level: 1,
      notes: 'Gross annual basic salary before tax, as provided to IPU Parline by national parliaments.',
      raw_data: {
        source: 'ipu_parline',
        chamber_id: options.chamberId,
        updated_at: row[0],
        csv_header: header,
        csv_row: row,
      },
    }];
  });
}

export function buildEuropeanParliamentSalaryRecords(year = 2025): OfficeCompensationInput[] {
  const monthlyPreTaxEur = 11255.26;
  const annualAmount = Number((monthlyPreTaxEur * 12).toFixed(2));
  return Object.entries(SYSTEM_COUNTRIES).map(([countryCode, countryName]) => ({
    country_code: countryCode,
    country_name: countryName,
    jurisdiction: 'eu',
    chamber_id: 'EP',
    office_type: 'member_of_european_parliament',
    office_title: 'Member of European Parliament',
    role_patterns: ['Member of European Parliament'],
    year,
    effective_date: `${year}-01-01`,
    date_to: null,
    period: 'annual',
    amount: annualAmount,
    annual_amount: annualAmount,
    currency: 'EUR',
    annual_amount_eur: annualAmount,
    source_url: 'https://www.europarl.europa.eu/meps/en/about/meps',
    source_label: 'European Parliament Members Statute salary',
    source_type: 'official',
    trust_level: 1,
    notes: 'Monthly pre-tax MEP salary of EUR 11,255.26 annualized over 12 months; allowances are excluded.',
    raw_data: {
      source: 'european_parliament_about_meps',
      monthly_pre_tax_eur: monthlyPreTaxEur,
    },
  }));
}

function parseMarkdownSource(value: string | undefined) {
  const match = value?.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) return { label: value || 'PoliticalSalaries', url: 'https://politicalsalaries.com/about-the-data/' };
  return { label: match[1], url: match[2] };
}

function confidenceToTrustLevel(value: string | undefined) {
  if ((value || '').toLowerCase() === 'high') return 2;
  if ((value || '').toLowerCase() === 'medium') return 3;
  return 3;
}

export function parsePoliticalSalariesLeaderTsv(text: string, accessedDate = '2026-04-30') {
  const rows = parseDelimitedRows(text, '\t');
  const [header, ...dataRows] = rows;
  if (!header?.includes('Country name')) return [] as OfficeCompensationInput[];

  return dataRows.flatMap((row) => {
    const record = Object.fromEntries(header.map((field, index) => [field, row[index] || '']));
    const code = POLITICAL_SALARIES_NAME_TO_CODE[record['Country name']];
    const countryName = code ? SYSTEM_COUNTRIES[code] : null;
    const amount = parseMoneyAmount(record['Salary (local)']);
    if (!code || !countryName || !amount) return [];
    const source = parseMarkdownSource(record.Source);
    const currency = normalizeCurrency(record['Currency letters']);
    const year = yearFromDate(record['Last updated']) || yearFromDate(accessedDate) || 2026;

    return [{
      country_code: code,
      country_name: countryName,
      jurisdiction: 'federal',
      chamber_id: null,
      office_type: 'head_of_government',
      office_title: `${countryName} head of government`,
      role_patterns: ['Head of Government'],
      year,
      effective_date: `${year}-01-01`,
      date_to: null,
      period: 'annual',
      amount,
      annual_amount: amount,
      currency,
      annual_amount_eur: currency === 'EUR' ? amount : null,
      source_url: source.url,
      source_label: `PoliticalSalaries: ${source.label}`,
      source_type: 'curated_secondary',
      trust_level: confidenceToTrustLevel(record['Data confidence']),
      notes: 'Curated secondary leader salary row. Use as office-level base salary only; verify against the linked primary source before high-stakes use.',
      raw_data: {
        source: 'politicalsalaries_datawrapper_leaders',
        accessed_date: accessedDate,
        row: record,
      },
    }];
  });
}

export function officeCompensationTypeLabel(value: string) {
  return OFFICE_TYPE_LABELS[value] || value.replace(/_/g, ' ');
}

function normalizeText(value: string | undefined) {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesOfficeCompensation(actor: PoliticianCompensationMatchInput, record: Pick<OfficeCompensationInput, 'country_code' | 'jurisdiction' | 'office_type' | 'role_patterns'>) {
  const actorCountry = actor.countryId?.toUpperCase();
  if (!actorCountry || actorCountry !== record.country_code.toUpperCase()) return false;

  const actorJurisdiction = normalizeText(actor.jurisdiction || 'federal');
  const recordJurisdiction = normalizeText(record.jurisdiction || 'federal');
  if (recordJurisdiction !== 'eu' && actorJurisdiction !== recordJurisdiction) return false;

  const role = normalizeText(actor.role);
  if (!role) return false;
  if (record.role_patterns.some((pattern) => normalizeText(pattern) === role)) return true;
  if (record.office_type === 'member_of_european_parliament') return role.includes('european parliament');
  if (record.office_type === 'member_of_parliament') return role.includes('member of parliament') || role.includes('member of bundestag') || role === 'deputy';
  if (record.office_type === 'senator') return role.includes('senator') || role.includes('senate');
  if (record.office_type === 'head_of_government') return role === 'head of government';
  if (record.office_type === 'head_of_state') return role === 'head of state';
  if (record.office_type === 'minister') return role.includes('minister') || role.includes('secretary');
  return false;
}
