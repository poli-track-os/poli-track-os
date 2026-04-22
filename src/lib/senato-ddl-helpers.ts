/**
 * Pure helpers for ingesting Italian draft laws from the official Senato open
 * data SPARQL endpoint.
 * No I/O, no Supabase.
 */

export interface SenatoDdlRow {
  idFase: string;
  legislatura: string;
  ramo: string;
  numeroFase: string;
  titolo: string;
  natura?: string | null;
  stato: string;
  dataStato?: string | null;
  dataPresentazione: string;
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

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseIsoDate(value: string | null | undefined): string | null {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function detectPolicyArea(title: string, nature: string): string | null {
  const haystack = `${title} ${nature}`;
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

export function normalizeSenatoDdlStatus(value: string | null | undefined): string {
  const status = cleanText(value).toLowerCase();
  if (!status) return 'consultation';
  if (/ritirat|rinviat|assorbit|stralciat/.test(status)) return 'withdrawn';
  if (/respint|reiez|non approvat|decadut|inammissibil/.test(status)) return 'rejected';
  if (/approvat|promulgat|pubblicat|legge/.test(status)) return 'adopted';
  if (/commis/.test(status)) return 'committee';
  if (/assemblea|aula|esame/.test(status)) return 'parliamentary_deliberation';
  return 'consultation';
}

function normalizeProposalType(title: string, nature: string): string {
  const haystack = `${title} ${nature}`.toLowerCase();
  if (/bilancio|rendiconto|assestamento|stato di previsione|conto consuntivo/.test(haystack)) return 'budget';
  if (/costituzional|revisione costituzionale/.test(haystack)) return 'constitutional_revision';
  return 'bill';
}

function normalizeSponsor(value: string): string {
  return cleanText(value).replace(/^(Sen\.|On\.|Dep\.)\s+/i, '');
}

function normalizeSponsors(values: string[]): string[] {
  return [...new Set(values.map(normalizeSponsor).filter(Boolean))];
}

export function buildSenatoDdlSourceUrl(idFase: string | number): string {
  return `http://dati.senato.it/ddl/${encodeURIComponent(String(idFase).trim())}`;
}

/**
 * Build a proposal row from one Senato DDL row plus the presenter names
 * collected from the same official graph.
 */
export function buildProposalFromSenatoDdlRow(
  row: SenatoDdlRow,
  presenters: string[],
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
  const idFase = cleanText(row.idFase);
  const title = cleanText(row.titolo);
  if (!idFase || !title) return null;

  const nature = cleanText(row.natura);
  const status = normalizeSenatoDdlStatus(row.stato);
  const submittedDate = parseIsoDate(row.dataPresentazione) ?? new Date().toISOString().slice(0, 10);
  const voteDate = ['adopted', 'rejected', 'withdrawn'].includes(status)
    ? (parseIsoDate(row.dataStato) ?? null)
    : null;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: normalizeProposalType(title, nature),
    jurisdiction: 'federal',
    country_code: 'IT',
    country_name: 'Italy',
    vote_date: voteDate,
    submitted_date: submittedDate,
    sponsors: normalizeSponsors(presenters),
    affected_laws: [],
    evidence_count: 1,
    summary: nature ? `${nature}: ${title}` : title,
    policy_area: detectPolicyArea(title, nature),
    source_url: buildSenatoDdlSourceUrl(idFase),
    data_source: 'senato_ddl',
  };
}
