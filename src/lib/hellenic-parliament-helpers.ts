/**
 * Pure helpers for ingesting Greek parliamentary bills from the official
 * Hellenic Parliament legislative pages.
 * No I/O, no Supabase.
 */

export interface HellenicParliamentListEntry {
  lawId: string;
  title: string;
  typeLabel: string | null;
  ministry: string | null;
  committee: string | null;
  phaseLabel: string;
  phaseDate: string | null;
  detailUrl: string;
}

export interface HellenicParliamentDetail {
  title: string | null;
  typeLabel: string | null;
  ministry: string | null;
  committee: string | null;
  phaseLabel: string | null;
  phaseDate: string | null;
  fekNumber: string | null;
  lawNumber: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/ενεργ|ηλεκτρ|αερι|κλιμα|εκπομπ/i, 'energy'],
  [/υγει|νοσοκομ|ιατρ|φαρμακ/i, 'health'],
  [/μεταναστ|ασυλ|συνορ/i, 'migration'],
  [/αμυν|στρατιω|ασφαλει/i, 'defence'],
  [/ψηφια|δεδομεν|κυβερνο|τεχνολογ/i, 'digital'],
  [/αγροτ|γεωργ|κτηνοτροφ|τροφιμ|αλι/i, 'agriculture'],
  [/εμπορ|τελων|βιομηχαν|επιχειρ/i, 'trade'],
  [/προυπολογ|οικονομ|δημοσιονομ|φορο|τραπεζ|ισολογισ|απολογισ/i, 'finance'],
  [/μεταφορ|σιδηροδρομ|οδικ|λιμεν|αερο/i, 'transport'],
  [/περιβαλλον|αποβλητ|υδατ|φυση/i, 'environment'],
  [/εργασ|απασχολ|κοινωνικ|συνταξ|μισθ/i, 'labour'],
  [/δικαιοσυν|ποιν|δικαστ|αστυνομ/i, 'justice'],
  [/παιδει|σχολ|πανεπιστημ|εκπαιδευ/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function foldText(value: string | null | undefined): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function parseGreekDate(value: string | null | undefined): string | null {
  const match = cleanText(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function detectPolicyArea(title: string, ministry: string | null): string | null {
  const haystack = foldText(`${title} ${ministry ?? ''}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

export function normalizeHellenicParliamentStatus(value: string | null | undefined): string {
  const phase = foldText(value);
  if (!phase) return 'consultation';
  if (phase.includes('ολοκληρ') || phase.includes('enacted')) return 'adopted';
  if (phase.includes('επιτροπ') || phase.includes('αναγνωση')) return 'committee';
  if (phase.includes('συζητ') || phase.includes('ψηφισ') || phase.includes('debate')) return 'parliamentary_deliberation';
  if (phase.includes('κατατεθ') || phase.includes('submitted')) return 'consultation';
  return 'consultation';
}

function normalizeProposalType(title: string, typeLabel: string | null): string {
  const haystack = foldText(`${title} ${typeLabel ?? ''}`);
  if (/προυπολογ|απολογισ|ισολογισ/.test(haystack)) return 'budget';
  return 'bill';
}

function normalizeSponsors(typeLabel: string | null, ministry: string | null): string[] {
  const type = foldText(typeLabel);
  const sponsor = cleanText(ministry);
  if (!sponsor) return [];
  if (type.includes('σχεδιο νομου') || type.includes('bill')) return [sponsor];
  return [];
}

export function buildHellenicParliamentSourceUrl(lawId: string): string {
  return `https://www.hellenicparliament.gr/Nomothetiko-Ergo/Anazitisi-Nomothetikou-Ergou?law_id=${encodeURIComponent(lawId)}`;
}

/**
 * Build a proposal row from one Hellenic Parliament list/detail pair.
 */
export function buildProposalFromHellenicParliamentEntry(
  entry: HellenicParliamentListEntry,
  detail: HellenicParliamentDetail,
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
  const lawId = cleanText(entry.lawId);
  const title = cleanText(detail.title || entry.title);
  if (!lawId || !title) return null;

  const typeLabel = cleanText(detail.typeLabel || entry.typeLabel) || null;
  const ministry = cleanText(detail.ministry || entry.ministry) || null;
  const committee = cleanText(detail.committee || entry.committee) || null;
  const phaseLabel = cleanText(detail.phaseLabel || entry.phaseLabel) || entry.phaseLabel;
  const status = normalizeHellenicParliamentStatus(phaseLabel);
  const phaseDate = parseGreekDate(detail.phaseDate || entry.phaseDate);
  const voteDate = status === 'adopted' ? phaseDate : null;
  const summaryParts = [
    committee,
    cleanText(detail.lawNumber),
    cleanText(detail.fekNumber),
    phaseLabel,
  ].filter(Boolean);

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: normalizeProposalType(title, typeLabel),
    jurisdiction: 'federal',
    country_code: 'GR',
    country_name: 'Greece',
    vote_date: voteDate,
    submitted_date: phaseDate ?? new Date().toISOString().slice(0, 10),
    sponsors: normalizeSponsors(typeLabel, ministry),
    affected_laws: [],
    evidence_count: 1,
    summary: summaryParts.join(' | ') || title,
    policy_area: detectPolicyArea(title, ministry),
    source_url: buildHellenicParliamentSourceUrl(lawId),
    data_source: 'hellenic_parliament',
  };
}
