/**
 * Pure helpers for ingesting Spanish Congreso open data initiatives.
 * No I/O, no Supabase.
 */

export interface CongresoEsItem {
  TIPO?: string;
  OBJETO?: string;
  NUMEXPEDIENTE?: string;
  FECHAPRESENTACION?: string;
  FECHACALIFICACION?: string;
  AUTOR?: string;
  SITUACIONACTUAL?: string;
  RESULTADOTRAMITACION?: string;
  ENLACESBOCG?: string;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energ[ií]a|electricidad|gas|renovable|nuclear|emisi[oó]n|clima|carbon/i, 'energy'],
  [/salud|medicin|farmac|vacuna|hospital|enfermedad/i, 'health'],
  [/asilo|migraci[oó]n|frontera|inmigraci[oó]n|refugiad/i, 'migration'],
  [/defensa|militar|armamento|seguridad/i, 'defence'],
  [/digital|dato|ciber|internet|inteligencia artificial/i, 'digital'],
  [/agric|pesca|aliment/i, 'agriculture'],
  [/comercio|aduan|arancel|importaci[oó]n|exportaci[oó]n/i, 'trade'],
  [/finan|banco|monetari|fiscal|presupuesto|impuesto/i, 'finance'],
  [/transporte|aviaci[oó]n|ferrovi|mar[ií]tim|carretera/i, 'transport'],
  [/medio ambiente|biodiversidad|contaminaci[oó]n|residuo|agua|naturaleza/i, 'environment'],
  [/trabajo|empleo|social|pensi[oó]n|jubilaci[oó]n/i, 'labour'],
  [/justicia|judicial|penal|tribunal/i, 'justice'],
  [/educaci[oó]n|escuela|universidad|investigaci[oó]n/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function parseSpanishDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return new Date().toISOString().slice(0, 10);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function mapStatus(item: CongresoEsItem): string {
  const source = `${item.SITUACIONACTUAL ?? ''} ${item.RESULTADOTRAMITACION ?? ''}`.toLowerCase();
  if (source.includes('aprob')) return 'adopted';
  if (source.includes('inadmit') || source.includes('rechaz')) return 'rejected';
  if (source.includes('cerrado') || source.includes('concluido')) return 'withdrawn';
  if (source.includes('comisi') || source.includes('enmienda')) return 'committee';
  if (source.includes('pleno') || source.includes('toma en consideración')) return 'parliamentary_deliberation';
  return 'consultation';
}

function mapProposalType(typeRaw: string | undefined): string {
  const value = (typeRaw ?? '').toLowerCase();
  if (value.includes('resoluci')) return 'resolution';
  if (value.includes('proyecto') || value.includes('proposici')) return 'bill';
  return 'bill';
}

function extractSourceUrl(item: CongresoEsItem): string {
  const candidates = (item.ENLACESBOCG ?? '').split(/\s+/).filter((chunk) => chunk.startsWith('http'));
  if (candidates.length > 0) return candidates[0];
  const exp = item.NUMEXPEDIENTE?.replace(/\//g, '-') ?? crypto.randomUUID();
  return `https://www.congreso.es/es/busqueda-de-publicaciones?p_p_id=publicaciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_publicaciones_mode=mostrarTextoIntegro&_publicaciones_legislatura=&_publicaciones_id_texto=BOCG-${exp}`;
}

/**
 * Build a proposal row from a Congreso open-data record.
 *
 * @param item raw item from Proposiciones/Proyectos JSON dump
 * @returns proposal row or null for invalid rows
 */
export function buildProposalFromCongresoEs(item: CongresoEsItem): {
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
  const title = item.OBJETO?.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const author = item.AUTOR?.replace(/\s+/g, ' ').trim();
  const sponsors = author ? [author] : [];
  return {
    title: title.slice(0, 500),
    official_title: title,
    status: mapStatus(item),
    proposal_type: mapProposalType(item.TIPO),
    jurisdiction: 'federal',
    country_code: 'ES',
    country_name: 'Spain',
    vote_date: null,
    submitted_date: parseSpanishDate(item.FECHAPRESENTACION || item.FECHACALIFICACION),
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: extractSourceUrl(item),
    data_source: 'congreso_es',
  };
}
