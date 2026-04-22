/**
 * Pure helpers for ingesting Luxembourg Chamber law proposals from the
 * official data.public.lu XML dataset.
 * No I/O, no Supabase.
 */

export interface ChdLuLawRow {
  LAW_NUMBER?: string | null;
  LAW_TYPE?: string | null;
  LAW_DEPOSIT_DATE?: string | null;
  LAW_EVACUATION_DATE?: string | null;
  LAW_STATUS?: string | null;
  LAW_TITLE?: string | null;
  LAW_CONTENT?: string | null;
  LAW_AUTHORS?: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energie|electri|gaz|climat|emission/i, 'energy'],
  [/sante|hopital|medical|medecin|vaccin/i, 'health'],
  [/migration|asile|frontiere|etranger/i, 'migration'],
  [/defense|militaire|securite/i, 'defence'],
  [/digital|donnees|cyber|intelligence artificielle/i, 'digital'],
  [/agric|foret|peche|aliment/i, 'agriculture'],
  [/commerce|douane|industrie|economie/i, 'trade'],
  [/budget|impot|taxe|finance|banque|comptabilite/i, 'finance'],
  [/transport|rail|route|aviation|port/i, 'transport'],
  [/environnement|dechet|eau|nature/i, 'environment'],
  [/travail|emploi|social|pension|salaire/i, 'labour'],
  [/justice|penal|tribunal|police|prison/i, 'justice'],
  [/education|ecole|universite|science/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function detectPolicyArea(title: string, content: string): string | null {
  const haystack = `${title} ${content}`;
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function normalizeStatus(value: string | null | undefined): string {
  const status = cleanText(value);
  if (status === 'Retire') return 'withdrawn';
  if (status === 'VoteRefuse') return 'rejected';
  if (['VoteAccepte', 'Publie', 'EnAttenteDispenseSecondVote', 'EvacueConjointement'].includes(status)) return 'adopted';
  if (status === 'EnCommission') return 'committee';
  return 'consultation';
}

export function buildChdLuSourceUrl(lawNumber: string | null | undefined): string {
  const number = cleanText(lawNumber);
  if (!number) return 'https://data.public.lu/fr/datasets/la-liste-des-projets-propositions-de-lois/';
  return `https://data.public.lu/fr/datasets/r/c5a74c97-a5fa-42ec-90d7-a832ab7410b2#LAW_NUMBER=${encodeURIComponent(number)}`;
}

/**
 * Build a proposal row from one Luxembourg law dataset row.
 */
export function buildProposalFromChdLuRow(
  row: ChdLuLawRow,
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
  const number = cleanText(row.LAW_NUMBER);
  const title = cleanText(row.LAW_TITLE);
  if (!number || !title) return null;

  const content = cleanText(row.LAW_CONTENT);
  const status = normalizeStatus(row.LAW_STATUS);
  const submittedDate = parseDate(row.LAW_DEPOSIT_DATE) ?? new Date().toISOString().slice(0, 10);
  const voteDate = status === 'adopted' || status === 'rejected' || status === 'withdrawn'
    ? (parseDate(row.LAW_EVACUATION_DATE) ?? null)
    : null;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: cleanText(row.LAW_TYPE).includes('Revision') ? 'constitutional_revision' : 'bill',
    jurisdiction: 'federal',
    country_code: 'LU',
    country_name: 'Luxembourg',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors: cleanText(row.LAW_AUTHORS) ? [cleanText(row.LAW_AUTHORS)] : [],
    affected_laws: [],
    evidence_count: 1,
    summary: content || title,
    policy_area: detectPolicyArea(title, content),
    source_url: buildChdLuSourceUrl(number),
    data_source: 'chd_lu',
  };
}
