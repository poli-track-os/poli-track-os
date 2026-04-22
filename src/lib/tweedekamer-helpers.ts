/**
 * Pure helpers for ingesting Netherlands Tweede Kamer OData legislation.
 * No I/O, no Supabase.
 */

export interface TweedeKamerZaak {
  Id?: string;
  Nummer?: string;
  Soort?: string;
  Titel?: string;
  Onderwerp?: string;
  Status?: string;
  HuidigeBehandelstatus?: string | null;
  GestartOp?: string;
  Organisatie?: string;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energie|elektriciteit|gas|hernieuwbaar|kern|emissie|klimaat|koolstof/i, 'energy'],
  [/gezondheid|medic|farmac|vaccin|ziekenhuis|ziekte/i, 'health'],
  [/asiel|migratie|grens|immigratie|vluchteling/i, 'migration'],
  [/defensie|militair|bewapening|veiligheid/i, 'defence'],
  [/digitaal|data|cyber|internet|kunstmatige intelligentie/i, 'digital'],
  [/landbouw|visserij|voedsel/i, 'agriculture'],
  [/handel|douane|tarief|import|export/i, 'trade'],
  [/financi|bank|monetair|belasting|begroting/i, 'finance'],
  [/transport|luchtvaart|spoor|scheepvaart|weg/i, 'transport'],
  [/milieu|biodiversiteit|vervuiling|afval|water|natuur/i, 'environment'],
  [/arbeid|werkgelegenheid|sociaal|pensioen/i, 'labour'],
  [/justitie|rechter|straf|rechtbank/i, 'justice'],
  [/onderwijs|school|universiteit|onderzoek/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function mapStatus(status: string | undefined, treatment: string | null | undefined): string {
  const value = `${status ?? ''} ${treatment ?? ''}`.toLowerCase();
  if (value.includes('aangenomen') || value.includes('afgedaan')) return 'adopted';
  if (value.includes('verworpen')) return 'rejected';
  if (value.includes('ingetrokken')) return 'withdrawn';
  if (value.includes('commissie')) return 'committee';
  if (value.includes('plenaire')) return 'parliamentary_deliberation';
  return 'consultation';
}

/**
 * Build a proposal row from one Tweede Kamer Zaak item.
 *
 * @param zaak OData zaak item
 * @returns proposal row or null
 */
export function buildProposalFromTweedeKamerZaak(zaak: TweedeKamerZaak): {
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
  const title = (zaak.Titel || zaak.Onderwerp || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const sourceUrl = zaak.Nummer
    ? `https://www.tweedekamer.nl/kamerstukken?cfg=tksearch&fld_prl_kamerstuk=${encodeURIComponent(zaak.Nummer)}`
    : `https://www.tweedekamer.nl/kamerstukken`;
  return {
    title: title.slice(0, 500),
    official_title: title,
    status: mapStatus(zaak.Status, zaak.HuidigeBehandelstatus),
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'NL',
    country_name: 'Netherlands',
    vote_date: null,
    submitted_date: (zaak.GestartOp || new Date().toISOString()).slice(0, 10),
    sponsors: zaak.Organisatie ? [zaak.Organisatie] : [],
    affected_laws: [],
    evidence_count: 1,
    summary: title,
    policy_area: detectPolicyArea(title),
    source_url: sourceUrl,
    data_source: 'tweedekamer',
  };
}
