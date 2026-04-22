// Pure parsers for LobbyFacts.eu HTML. LobbyFacts is an NGO project that
// republishes EU Transparency Register data with normalized historical
// spend amounts and meeting counts.
//
// CC-BY 4.0. Attribution: ALTER-EU / LobbyFacts.eu.
//
// Structure:
//   /search-all?page=N            — paginated list of organisations, each
//                                    with name + datacard URL
//   /datacard/{slug}?rid={tr_id}  — full per-organisation page with spend
//                                    history, FTE, accreditations, meetings

export interface LobbyfactsListEntry {
  name: string;
  datacardPath: string;
  transparencyId: string;
  approxSpendLabel: string | null;
  fte: number | null;
}

export interface LobbyfactsDatacard {
  transparencyId: string;
  name: string;
  legalName: string | null;
  category: string | null;
  subcategory: string | null;
  countryOfHq: string | null;
  hqAddress: string | null;
  website: string | null;
  registeredAt: string | null;       // ISO date (YYYY-MM-DD)
  lastUpdatedTr: string | null;
  fteCount: number | null;
  totalStaffInvolved: number | null;
  epAccreditations: number | null;
  highLevelCommissionMeetings: number | null;
  spendByYear: Array<{ year: number; amountEur: number }>;
}

export interface LobbyfactsMeetingCsvRow {
  meetingDate: string;
  subject: string | null;
  location: string | null;
  cabinet: string | null;
  commissionerOrg: string | null;
  attendingFromCommission: string | null;
  otherLobbyists: string | null;
}

/**
 * Extract organisation list rows from a /search-all results page.
 * Strategy: each row contains an <a href="/datacard/...?rid=..."> link.
 * The visible name comes from inside the anchor; spend/FTE come from
 * sibling cells using class hooks LobbyFacts uses consistently.
 *
 * We deliberately don't use jsdom — the format is stable enough for
 * regex extraction, and avoiding a Node-only dep keeps this module
 * loadable under both Vite/Vitest and Deno.
 */
export function parseLobbyfactsSearchPage(html: string): LobbyfactsListEntry[] {
  const entries: LobbyfactsListEntry[] = [];
  const linkRe = /<a[^>]+href="\/datacard\/([^"?]+)\?rid=([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = linkRe.exec(html))) {
    const [, , rid, innerHtml] = match;
    if (seen.has(rid)) continue;
    seen.add(rid);

    const name = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    // Find the surrounding row container — heuristic: look at the next 800
    // chars after the anchor for spend (€) and FTE numbers.
    const window = html.slice(match.index, Math.min(html.length, match.index + 1200));
    const spendMatch = window.match(/(\d[\d,.\s]*)\s*€\+?/);
    const fteMatch = window.match(/(?:fte|FTE|full[-\s]?time)[^<>\d]*([\d.]+)/);

    entries.push({
      name,
      datacardPath: `/datacard/${match[1]}?rid=${rid}`,
      transparencyId: rid,
      approxSpendLabel: spendMatch ? spendMatch[0].trim() : null,
      fte: fteMatch ? Number.parseFloat(fteMatch[1]) : null,
    });
  }

  return entries;
}

/**
 * Parse a single datacard page into a LobbyfactsDatacard record.
 *
 * Strategy: LobbyFacts uses a fairly stable label-then-value structure.
 * For each known field, we look for the label text and then capture
 * what follows it within a bounded window. The spend history is in a
 * table or chart-data block.
 */
export function parseLobbyfactsDatacard(html: string, fallbackTransparencyId: string): LobbyfactsDatacard {
  const findLabeled = (label: string): string | null => {
    // Match "<label>:</label>...<value>...</value>" or "<dt>label</dt><dd>value</dd>"
    // or any "label" followed by content within ~200 chars.
    const re = new RegExp(`${escapeRegex(label)}[\\s:]*<[^>]*>([\\s\\S]{0,300}?)<\\/`, 'i');
    const m = html.match(re);
    if (!m) return null;
    return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
  };

  const findInt = (label: string): number | null => {
    const text = findLabeled(label);
    if (!text) return null;
    const m = text.match(/(\d[\d.,\s]*)/);
    if (!m) return null;
    const n = Number.parseFloat(m[1].replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const findFloat = (label: string): number | null => {
    const text = findLabeled(label);
    if (!text) return null;
    const m = text.match(/(\d[\d.,]*)/);
    if (!m) return null;
    // LobbyFacts uses both "1,234.56" (US) and "1.234,56" (EU). Heuristic:
    // if the last separator is a comma followed by 1-2 digits, treat as
    // decimal comma.
    let s = m[1].replace(/\s/g, '');
    if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  // Title: <h1>...</h1> first occurrence.
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : 'Unknown organisation';

  const spendByYear = extractSpendByYear(html);

  return {
    transparencyId: fallbackTransparencyId,
    name,
    legalName: findLabeled('Legal name'),
    category: findLabeled('Category'),
    subcategory: findLabeled('Subcategory'),
    countryOfHq: findLabeled('Head office country'),
    hqAddress: findLabeled('Head office address'),
    website: extractFirstUrl(html),
    registeredAt: parseDateLabel(findLabeled('First registration')),
    lastUpdatedTr: parseDateLabel(findLabeled('Last updated')),
    fteCount: findFloat('Full-time equivalent') ?? findFloat('FTE'),
    totalStaffInvolved: findInt('Total staff involved'),
    epAccreditations: findInt('EP accreditation'),
    highLevelCommissionMeetings: findInt('High level Commission meetings') ?? findInt('Commission meetings'),
    spendByYear,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFirstUrl(html: string): string | null {
  const m = html.match(/href="(https?:\/\/[^"]+)"[^>]*>(?:[^<]*?(?:website|homepage|www\.))/i);
  return m ? m[1] : null;
}

function parseDateLabel(value: string | null): string | null {
  if (!value) return null;
  // Accept "2009-03-17", "17 March 2009", "17/03/2009"
  const iso = value.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const eu = value.match(/(\d{1,2})[/.\s-](\d{1,2})[/.\s-](\d{4})/);
  if (eu) {
    const [, d, m, y] = eu;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function parseLobbyfactsMeetingsCsv(csvText: string): LobbyfactsMeetingCsvRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const rows: LobbyfactsMeetingCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    if (cols.length < 7) continue;
    const date = cols[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      meetingDate: date,
      subject: cols[1].trim() || null,
      location: cols[2].trim() || null,
      cabinet: cols[3].trim() || null,
      commissionerOrg: cols[4].trim() || null,
      attendingFromCommission: cols[5].trim() || null,
      otherLobbyists: cols[6].trim() || null,
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractSpendByYear(html: string): Array<{ year: number; amountEur: number }> {
  const graphMatch = html.match(/<div id="graph_info"[^>]*>([\s\S]*?)<\/div>/i);
  if (graphMatch) {
    const raw = decodeHtmlEntities(graphMatch[1].trim());
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rows = Object.entries(parsed)
        .map(([yearText, amount]) => {
          const year = Number.parseInt(yearText, 10);
          const numericAmount = typeof amount === 'number' ? amount : Number.parseFloat(String(amount));
          return { year, amountEur: Math.round(numericAmount) };
        })
        .filter((row) => Number.isFinite(row.year) && row.year >= 2000 && Number.isFinite(row.amountEur) && row.amountEur > 0)
        .sort((a, b) => a.year - b.year);
      if (rows.length > 0) return rows;
    } catch {
      // fall through to legacy parser
    }
  }

  const spendByYear: Array<{ year: number; amountEur: number }> = [];
  const spendRowRe = /\b(20\d{2})\b[\s\S]{0,80}?(\d[\d,.\s]*)\s*€/g;
  let match: RegExpExecArray | null;
  const seenYears = new Set<number>();
  while ((match = spendRowRe.exec(html))) {
    const year = Number.parseInt(match[1], 10);
    if (seenYears.has(year)) continue;
    let amountText = match[2].replace(/\s/g, '');
    if (/,\d{1,2}$/.test(amountText) && !/\.\d/.test(amountText)) {
      amountText = amountText.replace(/\./g, '').replace(',', '.');
    } else {
      amountText = amountText.replace(/,/g, '');
    }
    const amount = Number.parseFloat(amountText);
    if (!Number.isFinite(amount)) continue;
    spendByYear.push({ year, amountEur: Math.round(amount) });
    seenYears.add(year);
  }
  return spendByYear.sort((a, b) => a.year - b.year);
}
