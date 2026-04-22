/**
 * Pure helpers for ingesting Romanian Senate legislative proposals from the
 * official Senat.ro legislative search and detail pages.
 * No I/O, no Supabase.
 */

export interface SenatRoListEntry {
  number: string;
  year: string;
  title: string;
  initiators: string[];
  statusLabel: string;
}

export interface SenatRoDetail {
  firstChamber: string | null;
  initiativeType: string | null;
  initiators: string[];
  statusLabel: string;
  lawCharacter: string | null;
  adoptionDeadline: string | null;
  procedureDates: string[];
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energie|electric|gaz|clim|emis/i, 'energy'],
  [/sănăt|spital|medic|vaccin/i, 'health'],
  [/migra|azil|frontier|străin/i, 'migration'],
  [/apărare|militar|securit/i, 'defence'],
  [/digital|date|cibern|inteligenț/i, 'digital'],
  [/agric|silvic|pesc|aliment/i, 'agriculture'],
  [/comer|vam|industrie|întreprind/i, 'trade'],
  [/buget|finan|fiscal|tax|impoz|banc/i, 'finance'],
  [/transport|feroviar|rutier|port|avia/i, 'transport'],
  [/mediu|deșeu|apă|natur/i, 'environment'],
  [/munc|ocupare|social|pensii|salari/i, 'labour'],
  [/justi|penal|instanț|poliț|închisoare/i, 'justice'],
  [/educa|școal|universit|cercetare/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  const dashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}`;
  const dotMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  return null;
}

function detectPolicyArea(title: string): string | null {
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(title)) return area;
  }
  return null;
}

export function normalizeSenatRoStatus(value: string | null | undefined): string {
  const status = cleanText(value).toLowerCase();
  if (!status) return 'consultation';
  if (/retras/.test(status)) return 'withdrawn';
  if (/respins|resping/.test(status)) return 'rejected';
  if (/promulgat|publicat|adoptate de ambele camere|lege/.test(status)) return 'adopted';
  if (/la comisii|raport finalizat/.test(status)) return 'committee';
  if (/ordinea de zi|dezbatere|înregistrat la senat|trimise la camer|promulgare|mediere|plen/.test(status)) {
    return 'parliamentary_deliberation';
  }
  return 'consultation';
}

function normalizeProposalType(title: string, initiativeType: string | null, lawCharacter: string | null): string {
  const haystack = cleanText(`${title} ${initiativeType ?? ''} ${lawCharacter ?? ''}`).toLowerCase();
  if (/buget|contului general anual|rectificarea buget/i.test(haystack)) return 'budget';
  if (/constitu/.test(haystack)) return 'constitutional_revision';
  return 'bill';
}

function normalizeSponsors(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

export function buildSenatRoSourceUrl(number: string, year: string): string {
  return `https://www.senat.ro/Legis/Lista.aspx?nr_cls=${encodeURIComponent(number)}&an_cls=${encodeURIComponent(year)}`;
}

/**
 * Build a proposal row from one Romanian Senate list/detail pair.
 */
export function buildProposalFromSenatRoEntry(
  entry: SenatRoListEntry,
  detail: SenatRoDetail,
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
  const number = cleanText(entry.number);
  const year = cleanText(entry.year);
  const title = cleanText(entry.title);
  if (!number || !year || !title) return null;

  const status = normalizeSenatRoStatus(detail.statusLabel || entry.statusLabel);
  const dates = detail.procedureDates.map((value) => parseDate(value)).filter((value): value is string => Boolean(value));
  const submittedDate = dates[0] ?? parseDate(detail.adoptionDeadline) ?? `${year}-01-01`;
  const voteDate = ['adopted', 'rejected', 'withdrawn'].includes(status) ? (dates.at(-1) ?? null) : null;
  const sponsors = normalizeSponsors(detail.initiators.length > 0 ? detail.initiators : entry.initiators);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: normalizeProposalType(title, detail.initiativeType, detail.lawCharacter),
    jurisdiction: 'federal',
    country_code: 'RO',
    country_name: 'Romania',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: detail.firstChamber ? `${detail.firstChamber}: ${title}` : title,
    policy_area: detectPolicyArea(title),
    source_url: buildSenatRoSourceUrl(number, year),
    data_source: 'senat_ro',
  };
}
