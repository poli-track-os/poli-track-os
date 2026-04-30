import { XMLParser } from 'fast-xml-parser';

const PCAST_FALLBACK_NAMES = [
  'Marc Andreessen',
  'Sergey Brin',
  'Safra Catz',
  'Michael Dell',
  'Jacob DeWitte',
  'Fred Ehrsam',
  'Larry Ellison',
  'David Friedberg',
  'Jensen Huang',
  'John Martinis',
  'Bob Mumgaard',
  'Lisa Su',
  'Mark Zuckerberg',
];

export const EU_GCSA_FALLBACK_NAMES = [
  'Dimitra Simeonidou',
  'Rémy Slama',
  'Mangala Srinivas',
  'Adam Izdebski',
  'Martin Kahanec',
  'Rafał Łukasik',
  'Naomi Ellemers',
];

export function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&Eacute;/g, 'É');
}

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parsePcastNames(html: string) {
  const match = html.match(/The following individuals have been appointed:<\/p>\s*<p>([\s\S]*?)<\/p>/i);
  if (!match) return PCAST_FALLBACK_NAMES;
  const names = decodeHtml(match[1])
    .split(/<br\s*\/?>|\n/i)
    .map((part) => stripTags(part))
    .filter((part) => /^[A-Z][A-Za-z .'-]+$/.test(part));
  return names.length >= 5 ? names : PCAST_FALLBACK_NAMES;
}

export function parseStrongNames(html: string, fallback: string[]) {
  const names = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)]
    .map((match) => stripTags(match[1]))
    .filter((name) => name.length > 2 && !/^(Chair|Vice-Chair)$/i.test(name));
  return names.length >= 5 ? [...new Set(names)] : fallback;
}

export function parseEgeMembers(html: string) {
  return [...html.matchAll(/ecl-list-illustration__title">([^<]+)<\/div>[\s\S]*?ecl-list-illustration__description"><div class="ecl">([\s\S]*?)<\/div><\/div>/g)]
    .map((match) => ({
      name: stripTags(match[1]),
      description: stripTags(match[2]),
      role: /<strong>([^<]+)<\/strong>/.exec(match[2])?.[1] || null,
    }))
    .filter((member) => member.name.length > 2);
}

export const SEC_COMPANY_FACT_TAGS = [
  { key: 'Revenues', label: 'Revenue', money_type: 'income' },
  { key: 'RevenueFromContractWithCustomerExcludingAssessedTax', label: 'Customer revenue', money_type: 'income' },
  { key: 'NetIncomeLoss', label: 'Net income', money_type: 'income' },
  { key: 'OperatingIncomeLoss', label: 'Operating income', money_type: 'income' },
  { key: 'Assets', label: 'Assets', money_type: 'other' },
  { key: 'CashAndCashEquivalentsAtCarryingValue', label: 'Cash and equivalents', money_type: 'other' },
  { key: 'LongTermDebt', label: 'Long-term debt', money_type: 'other' },
  { key: 'LongTermDebtCurrent', label: 'Current long-term debt', money_type: 'other' },
] as const;

export type SecCompanyFactSummary = {
  fact_key: string;
  label: string;
  money_type: 'income' | 'other';
  fiscal_year: number | null;
  fiscal_period: string | null;
  form: string | null;
  filed_date: string | null;
  end_date: string | null;
  accession_number: string | null;
  value: number;
  unit: string;
};

function recordValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectLatestSecCompanyFacts(payload: unknown, limit: number): SecCompanyFactSummary[] {
  const usGaap = recordValue(recordValue(payload, 'facts'), 'us-gaap');
  if (!usGaap || typeof usGaap !== 'object' || limit <= 0) return [];

  const selected: SecCompanyFactSummary[] = [];
  for (const spec of SEC_COMPANY_FACT_TAGS) {
    const fact = recordValue(usGaap, spec.key);
    const usdUnits = recordValue(recordValue(fact, 'units'), 'USD');
    if (!Array.isArray(usdUnits)) continue;

    const annualRows = usdUnits
      .map<SecCompanyFactSummary | null>((row) => {
        if (!row || typeof row !== 'object') return null;
        const record = row as Record<string, unknown>;
        const value = finiteNumber(record.val);
        if (value === null) return null;
        const form = typeof record.form === 'string' ? record.form : null;
        if (!['10-K', '10-Q'].includes(form || '')) return null;
        return {
          fact_key: spec.key,
          label: spec.label,
          money_type: spec.money_type,
          fiscal_year: finiteNumber(record.fy),
          fiscal_period: typeof record.fp === 'string' ? record.fp : null,
          form,
          filed_date: typeof record.filed === 'string' ? record.filed : null,
          end_date: typeof record.end === 'string' ? record.end : null,
          accession_number: typeof record.accn === 'string' ? record.accn : null,
          value,
          unit: 'USD',
        };
      })
      .filter((row): row is SecCompanyFactSummary => Boolean(row))
      .sort((left, right) => {
        const leftAnnual = left.form === '10-K' && left.fiscal_period === 'FY' ? 1 : 0;
        const rightAnnual = right.form === '10-K' && right.fiscal_period === 'FY' ? 1 : 0;
        if (leftAnnual !== rightAnnual) return rightAnnual - leftAnnual;
        return `${right.filed_date || ''}:${right.end_date || ''}`.localeCompare(`${left.filed_date || ''}:${left.end_date || ''}`);
      });

    if (annualRows[0]) selected.push(annualRows[0]);
  }

  return selected
    .sort((left, right) => `${right.filed_date || ''}:${right.fact_key}`.localeCompare(`${left.filed_date || ''}:${left.fact_key}`))
    .slice(0, limit);
}

export function isConservativeFecOrganizationReceipt(row: unknown) {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  const type = String(record.entity_type || '').toUpperCase();
  const amount = finiteNumber(record.contribution_receipt_amount);
  const name = String(record.contributor_name || '').trim();
  return ['ORG', 'COM', 'PAC', 'PTY'].includes(type) && Boolean(name) && amount !== null && amount > 0;
}

export function normalizePublicRecordDate(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const european = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (european) {
    const [, day, month, year] = european;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

export function yearFromPublicRecordDate(value: string | null | undefined) {
  const normalized = normalizePublicRecordDate(value);
  return normalized ? Number.parseInt(normalized.slice(0, 4), 10) : null;
}

export const FEC_BULK_RECEIPT_HEADERS = [
  'CMTE_ID',
  'AMNDT_IND',
  'RPT_TP',
  'TRANSACTION_PGI',
  'IMAGE_NUM',
  'TRANSACTION_TP',
  'ENTITY_TP',
  'NAME',
  'CITY',
  'STATE',
  'ZIP_CODE',
  'EMPLOYER',
  'OCCUPATION',
  'TRANSACTION_DT',
  'TRANSACTION_AMT',
  'OTHER_ID',
  'TRAN_ID',
  'FILE_NUM',
  'MEMO_CD',
  'MEMO_TEXT',
  'SUB_ID',
];

export function parseFecBulkLine(line: string, headers = FEC_BULK_RECEIPT_HEADERS) {
  const values = line.split('|');
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
}

export function parseFecBulkDate(value: string | null | undefined) {
  const text = (value || '').trim();
  if (!/^\d{8}$/.test(text)) return null;
  const month = text.slice(0, 2);
  const day = text.slice(2, 4);
  const year = text.slice(4, 8);
  return `${year}-${month}-${day}`;
}

export function isConservativeFecBulkReceipt(row: Record<string, string>) {
  const type = String(row.ENTITY_TP || '').toUpperCase();
  const amount = finiteNumber(row.TRANSACTION_AMT);
  const name = String(row.NAME || '').trim();
  return ['ORG', 'COM', 'PAC', 'PTY'].includes(type) && Boolean(name) && amount !== null && amount > 0;
}

const foiaXmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  parseAttributeValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

function collectValuesByKey(value: unknown, key: string, output: unknown[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectValuesByKey(item, key, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [currentKey, currentValue] of Object.entries(value as Record<string, unknown>)) {
    if (currentKey === key) {
      if (Array.isArray(currentValue)) output.push(...currentValue);
      else output.push(currentValue);
    }
    collectValuesByKey(currentValue, key, output);
  }
  return output;
}

function firstStringByKey(value: unknown, key: string) {
  const found = collectValuesByKey(value, key)
    .map((item) => String(item || '').trim())
    .find((item) => item.length > 0);
  return found || null;
}

function maxNumberByKey(value: unknown, key: string) {
  const numbers = collectValuesByKey(value, key)
    .map(finiteNumber)
    .filter((item): item is number => item !== null);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

export function summarizeFoiaAnnualReportXml(xml: string) {
  const parsed = foiaXmlParser.parse(xml);
  const organizationNames = collectValuesByKey(parsed, 'OrganizationName')
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return {
    agency_name: organizationNames[0] || null,
    fiscal_year: finiteNumber(firstStringByKey(parsed, 'DocumentFiscalYearDate')),
    document_creation_date: firstStringByKey(parsed, 'Date'),
    organization_count: organizationNames.length,
    request_received_current_year: maxNumberByKey(parsed, 'ProcessingStatisticsReceivedQuantity') ?? maxNumberByKey(parsed, 'ItemsReceivedCurrentYearQuantity'),
    request_processed_current_year: maxNumberByKey(parsed, 'ProcessingStatisticsProcessedQuantity') ?? maxNumberByKey(parsed, 'ItemsProcessedCurrentYearQuantity'),
    request_pending_end_year: maxNumberByKey(parsed, 'ProcessingStatisticsPendingAtEndQuantity'),
    backlog_current_year: maxNumberByKey(parsed, 'BacklogCurrentYearQuantity'),
    total_cost_amount: maxNumberByKey(parsed, 'TotalCostAmount'),
    full_time_staff: maxNumberByKey(parsed, 'TotalFullTimeStaffQuantity'),
  };
}
