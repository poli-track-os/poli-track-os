/**
 * Pure helpers for ingesting Austrian Nationalrat government bills from the
 * official Parlament open-data filter endpoint.
 * No I/O, no Supabase.
 */

export interface ParlamentAtHeaderField {
  label?: string | null;
  feld_name?: string | null;
}

export type ParlamentAtRawRow = unknown[];

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energie|elektri|gas|klima|emission|wasserstoff/i, 'energy'],
  [/gesund|medizin|kranken|pflege|spital|impf/i, 'health'],
  [/asyl|migration|grenze|fremden|staatsb[uü]rgerschaft/i, 'migration'],
  [/verteidigung|bundesheer|milit[aä]r|sicherheit/i, 'defence'],
  [/digital|daten|cyber|internet|ki|k[uü]nstliche intelligenz/i, 'digital'],
  [/landwirtschaft|forst|fischerei|lebensmittel/i, 'agriculture'],
  [/handel|zoll|import|export|gewerbe|industrie/i, 'trade'],
  [/budget|finanz|steuer|abgaben|bank|haushalt/i, 'finance'],
  [/verkehr|bahn|luftfahrt|schiff|stra[sß]e|transport/i, 'transport'],
  [/umwelt|natur|biodiversit[aä]t|abfall|wasser|klimaschutz/i, 'environment'],
  [/arbeit|besch[aä]ftigung|sozial|pension|arbeitslos/i, 'labour'],
  [/justiz|gericht|straf|zivilrecht/i, 'justice'],
  [/bildung|schule|hochschule|universit[aä]t|forschung/i, 'education'],
];

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry).replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function detectPolicyArea(title: string, topics: string[]): string | null {
  const haystack = `${title} ${topics.join(' ')}`;
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(haystack)) return area;
  }
  return null;
}

function mapStatus(statusValue: string | null | undefined): string {
  const numeric = parseInt(statusValue ?? '', 10);
  if (numeric === 5 || numeric === 4) return 'adopted';
  if (numeric === 3 || numeric === 2) return 'committee';
  return 'consultation';
}

export function buildParlamentAtSourceUrl(relativeUrl: string | null | undefined): string {
  if (!relativeUrl?.trim()) return 'https://www.parlament.gv.at/recherchieren/gegenstaende/index.html';
  return new URL(relativeUrl.trim(), 'https://www.parlament.gv.at').toString();
}

/**
 * Build a proposal row from one Austrian bulk row.
 *
 * @param headers Official header metadata describing the row positions
 * @param row Raw row array from the official bulk payload
 * @returns proposal row or null
 */
export function buildProposalFromParlamentAtRow(
  headers: ParlamentAtHeaderField[],
  row: ParlamentAtRawRow,
): {
  title: string;
  official_title: string;
  status: string;
  proposal_type: string;
  jurisdiction: string;
  country_code: string;
  country_name: string;
  vote_date: string | null;
  submitted_date: string;
  sponsors: string[];
  affected_laws: string[];
  evidence_count: number;
  summary: string;
  policy_area: string | null;
  source_url: string;
  data_source: string;
} | null {
  const indexByField = new Map<string, number>();
  headers.forEach((field, index) => {
    if (field.feld_name) indexByField.set(field.feld_name, index);
    if (field.label) indexByField.set(field.label, index);
  });

  const title = String(row[indexByField.get('PFAD') ?? -1] ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const isoDate = String(row[indexByField.get('DATUM_VON') ?? -1] ?? '').trim();
  const date = isoDate ? isoDate.slice(0, 10) : String(row[indexByField.get('DATUM') ?? -1] ?? '').trim();
  const statusRaw = String(row[indexByField.get('STATUS') ?? -1] ?? '').trim();
  const voteText = String(row[indexByField.get('VOTE_TEXT') ?? -1] ?? '').replace(/\s+/g, ' ').trim();
  const topics = [
    ...parseJsonArray(row[indexByField.get('THEMEN') ?? -1]),
    ...parseJsonArray(row[indexByField.get('SW') ?? -1]),
    ...parseJsonArray(row[indexByField.get('EUROVOC') ?? -1]),
  ];
  const sponsors = parseJsonArray(row[indexByField.get('PAD_INTERN') ?? -1]).map((value) => `PAD_INTERN:${value}`);
  const sourceUrl = buildParlamentAtSourceUrl(String(row[indexByField.get('HIS_URL') ?? -1] ?? ''));
  const status = mapStatus(statusRaw);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'AT',
    country_name: 'Austria',
    vote_date: status === 'adopted' ? (date || null) : null,
    submitted_date: date || new Date().toISOString().slice(0, 10),
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: voteText || title,
    policy_area: detectPolicyArea(title, topics),
    source_url: sourceUrl,
    data_source: 'parlament_at',
  };
}
