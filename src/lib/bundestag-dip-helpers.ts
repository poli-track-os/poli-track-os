/**
 * Pure helpers for ingesting German Bundestag proposals from the DIP API.
 * No I/O, no Supabase — just response parsing and row construction.
 *
 * DIP API docs: https://dip.bundestag.api.bund.dev/
 * Endpoint: https://search.dip.bundestag.de/api/v1/vorgang
 */

export interface DipVorgang {
  id: string;
  vorgangstyp: string;
  wahlperiode: number;
  titel: string;
  initiative?: string[] | string;
  datum: string;
  beratungsstand?: string;
  abstract?: string;
  deskriptor?: Array<{ name: string; typ?: string }>;
  sachgebiet?: string[];
  gesta?: string;
  aktualisiert: string;
  fundstelle?: {
    drucksachetyp?: string;
    pdf_url?: string;
    dokumentnummer?: string;
    datum?: string;
  };
  vorgangsbezug?: Array<{
    id: string;
    vorgangstyp: string;
    titel: string;
  }>;
  abstimmung?: {
    id?: string | number;
    datum?: string;
    ergebnis?: string;
    ja?: number;
    nein?: number;
    enthaltung?: number;
    nichtabgegeben?: number;
    fraktionen?: Array<{
      name?: string;
      ja?: number;
      nein?: number;
      enthaltung?: number;
      nichtabgegeben?: number;
    }>;
    namentlich?: Array<{
      id?: string | number;
      name?: string;
      fraktion?: string;
      stimme?: string;
    }>;
  };
}

export interface DipListResponse {
  documents: DipVorgang[];
  numFound: number;
  cursor: string;
}

const BERATUNGSSTAND_MAP: Record<string, string> = {
  'Verkündet':               'adopted',
  'Abgeschlossen':           'adopted',
  'Zusammengeführt mit...':  'withdrawn',
  'Erledigt durch Ablauf der Wahlperiode': 'withdrawn',
  'Zurückgezogen':           'withdrawn',
  'Abgelehnt':               'rejected',
  'Überwiesen':              'committee',
  'Beschlussempfehlung liegt vor': 'committee',
  'Dem Bundestag zugeleitet': 'consultation',
  'Noch nicht beraten':      'consultation',
};

const SACHGEBIET_TO_POLICY: Array<[RegExp, string]> = [
  [/Energie/i, 'energy'],
  [/Gesundheit|Pharma|Medizin/i, 'health'],
  [/Migration|Asyl|Flüchtling/i, 'migration'],
  [/Verteidigung|Militär|Bundeswehr/i, 'defence'],
  [/Digital|Daten|Cyber|Informationstechnik/i, 'digital'],
  [/Landwirtschaft|Agrar|Ernährung|Fischerei/i, 'agriculture'],
  [/Handel|Zoll|Außenwirtschaft/i, 'trade'],
  [/Finanzen|Bank|Steuer|Haushalt/i, 'finance'],
  [/Verkehr|Bahn|Luftfahrt|Schifffahrt/i, 'transport'],
  [/Umwelt|Natur|Klima|Wasser/i, 'environment'],
  [/Arbeit|Beschäftigung|Sozial|Rente/i, 'labour'],
  [/Justiz|Recht|Straf|Gericht/i, 'justice'],
  [/Bildung|Forschung|Schule|Universität/i, 'education'],
];

function detectPolicyArea(vorgang: DipVorgang): string | null {
  const searchable = [
    ...(vorgang.sachgebiet ?? []),
    ...(vorgang.deskriptor ?? []).map((d) => d.name),
    vorgang.titel,
  ].join(' ');
  for (const [re, area] of SACHGEBIET_TO_POLICY) {
    if (re.test(searchable)) return area;
  }
  return null;
}

function mapStatus(beratungsstand: string | undefined): string {
  if (!beratungsstand) return 'consultation';
  for (const [key, value] of Object.entries(BERATUNGSSTAND_MAP)) {
    if (beratungsstand.startsWith(key)) return value;
  }
  if (beratungsstand.includes('beraten')) return 'parliamentary_deliberation';
  return 'consultation';
}

function extractSponsors(initiative: string[] | string | undefined): string[] {
  if (!initiative) return [];
  const parts = Array.isArray(initiative) ? initiative : [initiative];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Build a proposals-table row from a DIP Vorgang record.
 *
 * @param vorgang - Raw DIP API Vorgang record.
 * @returns Proposal row or null if the record is not a legislative procedure.
 */
export function buildProposalFromVorgang(vorgang: DipVorgang): {
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
  if (!vorgang.titel || !vorgang.id) return null;
  const lowerType = vorgang.vorgangstyp?.toLowerCase() ?? '';
  if (!lowerType.includes('gesetzgebung') && !lowerType.includes('antrag') &&
      !lowerType.includes('verordnung') && !lowerType.includes('entschließung')) {
    return null;
  }

  return {
    title: vorgang.titel.slice(0, 500),
    official_title: vorgang.titel,
    status: mapStatus(vorgang.beratungsstand),
    proposal_type: lowerType.includes('verordnung') ? 'regulation' : 'bill',
    jurisdiction: 'federal',
    country_code: 'DE',
    country_name: 'Germany',
    vote_date: null,
    submitted_date: vorgang.datum,
    sponsors: extractSponsors(vorgang.initiative),
    affected_laws: [],
    evidence_count: 1,
    summary: (vorgang.abstract ?? vorgang.titel).slice(0, 2000),
    policy_area: detectPolicyArea(vorgang),
    source_url: `https://dip.bundestag.de/vorgang/${vorgang.id}`,
    data_source: 'bundestag_dip',
  };
}

export function buildVoteBundleFromDipVorgang(vorgang: DipVorgang) {
  const abstimmung = vorgang.abstimmung;
  if (!abstimmung || (!abstimmung.id && !abstimmung.datum)) return null;
  const eventId = String(abstimmung.id ?? `${vorgang.id}-${abstimmung.datum ?? 'vote'}`);
  const normalizePosition = (value: string | undefined) => {
    const lower = (value ?? '').toLowerCase();
    if (['ja', 'yes', 'for'].includes(lower)) return 'for' as const;
    if (['nein', 'no', 'against'].includes(lower)) return 'against' as const;
    if (['enthaltung', 'abstain'].includes(lower)) return 'abstain' as const;
    if (['nichtabgegeben', 'absent'].includes(lower)) return 'absent' as const;
    return 'other' as const;
  };
  return {
    source_event_id: eventId,
    chamber: 'Bundestag',
    vote_method: abstimmung.namentlich?.length ? 'roll_call' : 'aggregate',
    happened_at: abstimmung.datum ?? null,
    result: abstimmung.ergebnis ?? null,
    for_count: abstimmung.ja ?? null,
    against_count: abstimmung.nein ?? null,
    abstain_count: abstimmung.enthaltung ?? null,
    absent_count: abstimmung.nichtabgegeben ?? null,
    total_eligible: null,
    total_cast: null,
    quorum_required: null,
    quorum_reached: null,
    source_url: `https://dip.bundestag.de/vorgang/${vorgang.id}`,
    source_payload: abstimmung as Record<string, unknown>,
    groups: (abstimmung.fraktionen ?? []).map((item, index) => ({
      source_group_id: `${eventId}-group-${index}`,
      group_type: 'party',
      group_name: item.name ?? 'Unknown',
      for_count: item.ja ?? null,
      against_count: item.nein ?? null,
      abstain_count: item.enthaltung ?? null,
      absent_count: item.nichtabgegeben ?? null,
      source_payload: item as Record<string, unknown>,
    })),
    records: (abstimmung.namentlich ?? []).map((item, index) => ({
      source_record_id: String(item.id ?? `${eventId}-record-${index}`),
      politician_id: null,
      voter_name: item.name ?? 'Unknown',
      party: item.fraktion ?? null,
      vote_position: normalizePosition(item.stimme),
      confidence: item.name ? 1 : 0.4,
      source_payload: item as Record<string, unknown>,
    })),
  };
}
