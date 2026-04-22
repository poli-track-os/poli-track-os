/**
 * Pure helpers for ingesting Portuguese Assembleia da Republica initiatives.
 * No I/O, no Supabase.
 */

export interface ParlamentoPtInitiativeListItem {
  ini_id: string;
  ini_nr?: string;
  legislatura?: string;
  ini_tipo?: string;
  ini_desc_tipo?: string;
  ini_titulo?: string;
  autor_gp?: string[];
}

export interface ParlamentoPtInitiativeListResponse {
  data: ParlamentoPtInitiativeListItem[];
  pagination?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
}

export interface ParlamentoPtInitiativeEvent {
  DataFase?: string;
  Fase?: string;
}

export interface ParlamentoPtInitiativeDetail {
  ini_id: string;
  ini_nr?: string;
  ini_titulo?: string;
  ini_tipo?: string;
  ini_desc_tipo?: string;
  ini_link_texto?: string | null;
  etl_timestamp?: string;
  ini_autor_grupos_parlamentares?: Array<{ GP?: string }>;
  ini_autor_deputados?: Array<{ nome?: string; GP?: string }>;
  ini_eventos?: ParlamentoPtInitiativeEvent[];
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energia|eletricidade|g[aá]s|renov[aá]vel|nuclear|emiss[aã]o|clima|carbon/i, 'energy'],
  [/sa[uú]de|medicin|farmac|vacina|hospital|doen[cç]a/i, 'health'],
  [/asilo|migra[cç][aã]o|fronteira|imigra[cç][aã]o|refugiad/i, 'migration'],
  [/defesa|militar|armament|seguran[cç]a/i, 'defence'],
  [/digital|dados|ciber|intelig[êe]ncia artificial|internet/i, 'digital'],
  [/agric|pescas|alimenta[cç][aã]o/i, 'agriculture'],
  [/com[eé]rcio|alf[aâ]ndega|tarifa|importa[cç][aã]o|exporta[cç][aã]o/i, 'trade'],
  [/finan[cç]|banco|monet[aá]ri|fiscal|or[cç]ament|imposto/i, 'finance'],
  [/transporte|avia[cç][aã]o|ferrovi[aá]ri|mar[ií]tim|rodovi[aá]ri/i, 'transport'],
  [/ambiente|biodiversidade|polui[cç][aã]o|res[ií]duo|[aá]gua|natureza/i, 'environment'],
  [/trabalho|emprego|social|pens[aã]o|reforma/i, 'labour'],
  [/justi[cç]a|judici[aá]rio|penal|tribunal/i, 'justice'],
  [/educa[cç][aã]o|escola|universidade|investiga[cç][aã]o|ci[eê]ncia/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function mapProposalType(rawType: string | undefined): string {
  const value = (rawType ?? '').toLowerCase();
  if (value.includes('resolu')) return 'resolution';
  if (value.includes('lei')) return 'bill';
  return 'bill';
}

function mapStatus(events: ParlamentoPtInitiativeEvent[] | undefined): string {
  const latest = events?.[events.length - 1];
  const phase = (latest?.Fase ?? '').toLowerCase();
  if (phase.includes('promulga') || phase.includes('publica')) return 'adopted';
  if (phase.includes('rejeitad')) return 'rejected';
  if (phase.includes('retirad')) return 'withdrawn';
  if (phase.includes('vota')) return 'parliamentary_deliberation';
  if (phase.includes('comiss')) return 'committee';
  return 'consultation';
}

/**
 * Build a proposal row from a Portuguese initiative detail payload.
 *
 * @param detail initiative detail from the API
 * @returns proposal row or null when insufficient fields
 */
export function buildProposalFromParlamentoPt(detail: ParlamentoPtInitiativeDetail): {
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
  if (!detail.ini_id || !detail.ini_titulo) return null;
  const submittedDate = detail.ini_eventos?.[0]?.DataFase
    ?? detail.etl_timestamp?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10);
  const sourceUrl = detail.ini_link_texto || `https://app.parlamento.pt/webutils/docs/ini/${detail.ini_id}`;
  const sponsors = new Set<string>();
  for (const group of detail.ini_autor_grupos_parlamentares ?? []) {
    if (group.GP?.trim()) sponsors.add(group.GP.trim());
  }
  for (const deputy of detail.ini_autor_deputados ?? []) {
    const name = deputy.nome?.trim();
    if (!name) continue;
    const party = deputy.GP?.trim();
    sponsors.add(party ? `${name} (${party})` : name);
  }
  return {
    title: detail.ini_titulo.slice(0, 500),
    official_title: detail.ini_titulo,
    status: mapStatus(detail.ini_eventos),
    proposal_type: mapProposalType(detail.ini_desc_tipo || detail.ini_tipo),
    jurisdiction: 'federal',
    country_code: 'PT',
    country_name: 'Portugal',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors: [...sponsors],
    affected_laws: [],
    evidence_count: 1,
    summary: detail.ini_titulo,
    policy_area: detectPolicyArea(detail.ini_titulo),
    source_url: sourceUrl,
    data_source: 'parlamento_pt',
  };
}
