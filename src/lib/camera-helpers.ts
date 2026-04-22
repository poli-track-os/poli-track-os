/**
 * Pure helpers for ingesting Italian Camera dei deputati proposals from the
 * official open-data SPARQL endpoint.
 * No I/O, no Supabase.
 */

export interface CameraActRow {
  attoUri: string;
  legislature: string;
  identifier: string;
  title: string;
  initiativeType: string;
  submittedDate: string;
  description?: string | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energi|elettric|gas|clima|emission/i, 'energy'],
  [/sanit|ospedal|medic|vaccin/i, 'health'],
  [/migraz|asilo|frontier|immigraz/i, 'migration'],
  [/difesa|militar|sicurezza/i, 'defence'],
  [/digitale|dati|cyber|intelligenza artificial/i, 'digital'],
  [/agricol|forest|pesca|aliment/i, 'agriculture'],
  [/commercio|dogan|industri|impres/i, 'trade'],
  [/bilancio|rendiconto|assestamento|finanz|tribut|fiscal|impost|banc/i, 'finance'],
  [/trasport|ferrovi|stradal|portual|aeroport/i, 'transport'],
  [/ambient|rifiut|acqua|natura/i, 'environment'],
  [/lavoro|occupaz|social|pension|salari/i, 'labour'],
  [/giustizia|penal|tribunal|polizia|carcer/i, 'justice'],
  [/scuol|istruzion|universit|ricerca/i, 'education'],
];

const IT_MONTHS: Record<string, string> = {
  gennaio: '01',
  febbraio: '02',
  marzo: '03',
  aprile: '04',
  maggio: '05',
  giugno: '06',
  luglio: '07',
  agosto: '08',
  settembre: '09',
  ottobre: '10',
  novembre: '11',
  dicembre: '12',
};

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/&lt;\/?em&gt;/gi, '')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;|&#39;|&apos;/g, "'")
    .replace(/&agrave;/g, 'à')
    .replace(/&egrave;/g, 'è')
    .replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì')
    .replace(/&ograve;/g, 'ò')
    .replace(/&ugrave;/g, 'ù')
    .replace(/&amp;/g, '&');
}

function parseCompactDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function parseDescriptionLawDate(description: string): string | null {
  const match = decodeHtml(description).match(/Legge\s+\d+\s+del\s+(\d{1,2})\s+([a-zà]+)/i);
  if (!match) return null;
  const month = IT_MONTHS[match[2].toLowerCase()];
  const yearMatch = decodeHtml(description).match(/Legge\s+\d+\s+del\s+\d{1,2}\s+[a-zà]+\s+(\d{4})/i);
  if (!month || !yearMatch) return null;
  return `${yearMatch[1]}-${month}-${match[1].padStart(2, '0')}`;
}

function detectPolicyArea(title: string, initiativeType: string): string | null {
  const haystack = `${title} ${initiativeType}`.toLowerCase();
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function normalizeProposalType(title: string, initiativeType: string): string {
  const haystack = `${title} ${initiativeType}`.toLowerCase();
  if (/bilancio|rendiconto|assestamento|stato di previsione|conto consuntivo/.test(haystack)) return 'budget';
  if (/costituzional|revisione costituzionale/.test(haystack)) return 'constitutional_revision';
  return 'bill';
}

export function normalizeCameraActStatus(
  stateLabels: string[],
  description: string | null | undefined,
): string {
  const decodedDescription = decodeHtml(description);
  const labels = stateLabels.map((value) => decodeHtml(value).toLowerCase());
  if (/legge\s+\d+\s+del/i.test(decodedDescription) || labels.some((label) => label.includes('legge'))) return 'adopted';
  if (labels.some((label) => /respint|reiett|non approvat|assorbit|decadut/.test(label))) return 'rejected';
  if (labels.some((label) => /ritirat|stralciat/.test(label))) return 'withdrawn';
  if (labels.some((label) => /in corso di esame in commissione|assegnat|rinviato .* commissione|stato di relazione/.test(label))) return 'committee';
  if (labels.some((label) => /in discussione|approvato\. trasmesso|approvato, trasmesso|discussione in aula/.test(label))) return 'parliamentary_deliberation';
  return 'consultation';
}

function normalizeSponsors(values: string[]): string[] {
  return [...new Set(values.map((value) => decodeHtml(value)).filter(Boolean))];
}

export function buildCameraActSourceUrl(legislature: string, identifier: string): string {
  return `https://dati.camera.it/ocd/attocamera.rdf/ac${encodeURIComponent(legislature)}_${encodeURIComponent(identifier)}`;
}

/**
 * Build a proposal row from one Camera open-data act row plus creator/state
 * metadata collected from the same official graph.
 */
export function buildProposalFromCameraActRow(
  row: CameraActRow,
  creators: string[],
  stateLabels: string[],
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
  const legislature = cleanText(row.legislature);
  const identifier = cleanText(row.identifier);
  const title = decodeHtml(row.title).replace(/^"+|"+$/g, '').trim();
  if (!legislature || !identifier || !title) return null;

  const description = decodeHtml(row.description);
  const initiativeType = decodeHtml(row.initiativeType);
  const status = normalizeCameraActStatus(stateLabels, description);
  const submittedDate = parseCompactDate(row.submittedDate) ?? new Date().toISOString().slice(0, 10);
  const voteDate = status === 'adopted' ? parseDescriptionLawDate(description) : null;
  const summary = [initiativeType, description, ...stateLabels.map((value) => decodeHtml(value))]
    .filter(Boolean)
    .join(' | ');

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: normalizeProposalType(title, initiativeType),
    jurisdiction: 'federal',
    country_code: 'IT',
    country_name: 'Italy',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors: normalizeSponsors(creators),
    affected_laws: [],
    evidence_count: 1,
    summary: summary || title,
    policy_area: detectPolicyArea(title, initiativeType),
    source_url: buildCameraActSourceUrl(legislature, identifier),
    data_source: 'camera_atti',
  };
}
