export type DpiSectionKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface DpiEntry {
  section: DpiSectionKey;
  description: string;
  rawText: string;
  amount: number | null;
  currency: string | null;
  periodicity: string | null;
}

export interface ParsedMepDpi {
  declarationDate: string | null;
  declarationYear: number | null;
  sections: Partial<Record<DpiSectionKey, string>>;
  entries: DpiEntry[];
  sideIncomeEntries: DpiEntry[];
  holdings: DpiEntry[];
  sideIncomeByCurrency: Record<string, number>;
}

const SECTION_KEYS: DpiSectionKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CURRENCIES = [
  'EUR',
  'DKK',
  'HUF',
  'PLN',
  'SEK',
  'CZK',
  'BGN',
  'RON',
  'HRK',
  'GBP',
  'USD',
  'CHF',
  'NOK',
  'ISK',
  'TRY',
];

const CURRENCY_RE = new RegExp(
  String.raw`(\d{1,3}(?:[\s.',’]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(${CURRENCIES.join('|')})\b`,
  'i',
);

function cleanLine(line: string) {
  return line.replace(/\s+/g, ' ').trim();
}

function cleanDescription(value: string) {
  return cleanLine(value)
    .replace(/^\d+\.\s*/, '')
    .replace(/\bX\b/g, ' ')
    .replace(/\s+(none|nem volt|ingen|aucun|aucune|keine|geen|nessuno|ninguno|nicio)\s*$/i, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeNumber(value: string) {
  const compact = value.replace(/[\s'’]/g, '');
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  if (comma > -1 && dot > -1) {
    return Number((comma > dot ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, '')));
  }
  if (comma > -1) {
    const decimals = compact.length - comma - 1;
    return Number(decimals <= 2 ? compact.replace(',', '.') : compact.replace(/,/g, ''));
  }
  if (dot > -1) {
    const decimals = compact.length - dot - 1;
    return Number(decimals <= 2 ? compact : compact.replace(/\./g, ''));
  }
  return Number(compact);
}

function parseAmount(rawText: string) {
  const match = rawText.match(CURRENCY_RE);
  if (!match) return { amount: null, currency: null, amountText: null, endIndex: -1 };
  const amount = normalizeNumber(match[1]);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: match[2].toUpperCase(),
    amountText: match[0],
    endIndex: (match.index || 0) + match[0].length,
  };
}

function stripPeriodicity(value: string) {
  return value
    .replace(/\b(monthly|annually|annual|yearly|quarterly|weekly|monthly|year|month)\b/gi, ' ')
    .replace(/\b(mensuelle|annuelle|annuel|jährlich|monatlich|jaehrlich|årligt|aarligt|hyppighed)\b/gi, ' ')
    .replace(/\b(per jaar|per annum|per year|par mois|pro jahr|por ano|por mes)\b/gi, ' ');
}

function descriptionForSection(section: DpiSectionKey, row: string, parsed: ReturnType<typeof parseAmount>) {
  if (section !== 'D' || !parsed.amountText) {
    const beforeAmount = parsed.amountText ? row.slice(0, row.indexOf(parsed.amountText)) : row;
    return cleanDescription(beforeAmount);
  }
  return cleanDescription(stripPeriodicity(row.replace(parsed.amountText, ' ')));
}

function isLikelyTableHeader(line: string) {
  return /income amount|generated income|periodicity|nature of the benefit|indkomstbeløb|jövedelem|hyppighed|none$/i.test(line);
}

function isLikelyFooter(line: string) {
  return /^(EN|DA|DE|FR|HU|ES|IT|NL|PL|PT|RO|BG|CS|SK|SL|ET|LV|LT|FI|SV|EL|HR)\s*$/.test(line) ||
    /^Legal Notice\b/i.test(line) ||
    /^Jogi nyilatkozat\b/i.test(line) ||
    /^Juridisk meddelelse\b/i.test(line);
}

function isEmptyValue(description: string) {
  const normalized = description.toLowerCase();
  return !normalized ||
    /^(none|nil|n\/a|-|nem volt|ingen|aucun|aucune|keine|geen|nessuno|ninguno|nicio)$/.test(normalized);
}

function splitSections(text: string): Partial<Record<DpiSectionKey, string>> {
  const normalized = text.replace(/\r/g, '');
  const matches = [...normalized.matchAll(/^\s*\(([A-G])\)\s+/gm)]
    .filter((match) => SECTION_KEYS.includes(match[1] as DpiSectionKey));
  const sections: Partial<Record<DpiSectionKey, string>> = {};

  for (let index = 0; index < matches.length; index += 1) {
    const key = matches[index][1] as DpiSectionKey;
    const start = matches[index].index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || normalized.length : normalized.length;
    sections[key] = normalized.slice(start, end).trim();
  }

  return sections;
}

function parseRows(section: DpiSectionKey, sectionText: string): DpiEntry[] {
  const rows: string[] = [];
  let current: string | null = null;

  for (const rawLine of sectionText.split('\n')) {
    const line = cleanLine(rawLine);
    if (!line || isLikelyFooter(line) || isLikelyTableHeader(line)) continue;
    if (/^\([A-G]\)\s+/.test(line)) continue;

    if (/^\d+\.\s+/.test(line)) {
      if (current) rows.push(current);
      current = line;
      continue;
    }

    if (current && !/^This statement will be published|^STATEMENTS INCLUDED/i.test(line)) {
      current = `${current} ${line}`;
    }
  }

  if (current) rows.push(current);

  return rows
    .map((row): DpiEntry | null => {
      const parsed = parseAmount(row);
      const description = descriptionForSection(section, row, parsed);
      if (isEmptyValue(description)) return null;
      const afterAmount = parsed.endIndex > -1 ? cleanLine(row.slice(parsed.endIndex)) : null;
      return {
        section,
        description,
        rawText: row,
        amount: parsed.amount,
        currency: parsed.currency,
        periodicity: afterAmount || null,
      };
    })
    .filter((entry): entry is DpiEntry => Boolean(entry));
}

function parseDeclarationDate(text: string) {
  const dateMatch = text.match(/(?:date|dato|dátum|fecha|datum|data|dată|kuupäev)\s*:\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    return `${dateMatch[3]}-${month}-${day}`;
  }
  const isoMatch = text.match(/(?:date|dato|dátum|fecha|datum|data|dată|kuupäev)\s*:\s*(\d{4})-(\d{2})-(\d{2})/i);
  return isoMatch ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` : null;
}

export function parseMepFinancialDisclosureText(text: string): ParsedMepDpi {
  const sections = splitSections(text);
  const entries = SECTION_KEYS.flatMap((section) => parseRows(section, sections[section] || ''));
  const sideIncomeEntries = entries.filter((entry) => entry.section === 'B' && entry.amount !== null && entry.currency);
  const holdings = entries.filter((entry) => entry.section === 'D');
  const sideIncomeByCurrency: Record<string, number> = {};

  for (const entry of sideIncomeEntries) {
    if (!entry.currency || entry.amount === null) continue;
    sideIncomeByCurrency[entry.currency] = (sideIncomeByCurrency[entry.currency] || 0) + entry.amount;
  }

  const declarationDate = parseDeclarationDate(text);
  return {
    declarationDate,
    declarationYear: declarationDate ? Number.parseInt(declarationDate.slice(0, 4), 10) : null,
    sections,
    entries,
    sideIncomeEntries,
    holdings,
    sideIncomeByCurrency,
  };
}
