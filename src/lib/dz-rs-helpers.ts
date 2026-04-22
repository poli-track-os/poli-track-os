/**
 * Pure helpers for ingesting Slovenian legislative proposals from the official
 * Drzavni zbor XML bulk files.
 * No I/O, no Supabase.
 */

export interface DzRsBillCard {
  UNID?: string | null;
  KARTICA_EPA?: string | null;
  KARTICA_EVA?: string | null;
  KARTICA_MANDAT?: string | null;
  KARTICA_KONEC_POSTOPKA?: string | null;
  KARTICA_KRATICA?: string | null;
  KARTICA_NAZIV?: string | null;
  KARTICA_VRSTA?: string | null;
  KARTICA_DATUM?: string | null;
  KARTICA_PREDLAGATELJ?: string | null;
  KARTICA_POSTOPEK?: string | null;
  KARTICA_FAZA_POSTOPKA?: string | null;
  KARTICA_DELOVNA_TELESA?: string | null;
  KARTICA_SOP?: string | null;
  KARTICA_OBJAVA?: string | null;
  KARTICA_KLJUCNE_BESEDE?: string | null;
  KARTICA_SEJA?: string | null;
  KARTICA_KLASIFIKACIJSKA_STEVILKA?: string | null;
}

export interface DzRsBillRecord {
  KARTICA_PREDPISA?: DzRsBillCard | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/\benerg|\belektr|\bplin|\bpodnebn|\bemisij/i, 'energy'],
  [/\bzdrav|\bbolnis|\bcepiv|\bmedicin/i, 'health'],
  [/\bmigrac|\bazil|\bmej|\btujc/i, 'migration'],
  [/\bobramb|\bvojas|\bvarnost/i, 'defence'],
  [/\bdigital|\bpodatk|\bkibern|\bumetn/i, 'digital'],
  [/\bkmetij|\bgozd|\bribis|\bprehran/i, 'agriculture'],
  [/\btrgov|\bcarin|\bgospodars/i, 'trade'],
  [/\bproracun|\bdavk|\bfinanc|\bbank/i, 'finance'],
  [/\bpromet|\bzelezn|\bcest|\bletal|\bpristan/i, 'transport'],
  [/\bokolj|\bnarav|\bodpad|\bvod/i, 'environment'],
  [/\bdelovn|\bzaposl|\bsocial|\bplac|\bpokojn/i, 'labour'],
  [/\bpravosod|\bkazen|\bsodisc|\bpolic/i, 'justice'],
  [/\bizobrazev|\bsol|\buniverz|\bznanost/i, 'education'],
];

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectPolicyArea(title: string, keywords: string[]): string | null {
  const haystack = foldText(`${title} ${keywords.join(' ')}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function normalizeStatus(card: DzRsBillCard): string {
  const phase = foldText(card.KARTICA_FAZA_POSTOPKA ?? '');
  const publication = foldText(card.KARTICA_OBJAVA ?? '');
  const completed = String(card.KARTICA_KONEC_POSTOPKA ?? '').trim() === '1';

  if (phase.includes('umakn')) return 'withdrawn';
  if (phase.includes('zavrnj')) return 'rejected';
  if (phase.includes('sprejet') || publication) return 'adopted';
  if (phase.includes('obravnava') || phase.includes('postopek') || phase.includes('vlozen')) return 'parliamentary_deliberation';
  if (completed) return 'adopted';
  return 'consultation';
}

export function buildDzRsSourceUrl(unid: string | null | undefined, mandate: string | null | undefined): string {
  const uid = String(unid ?? '').split('|').at(-1)?.trim() ?? '';
  const mandat = String(mandate ?? '').trim();
  if (!uid || !mandat) {
    return 'https://www.dz-rs.si/wps/portal/Home/zakonodaja/vObravnavi/predlogiZakonov';
  }
  return `https://www.dz-rs.si/wps/portal/Home/zakonodaja/izbran?db=pre_zak&mandat=${encodeURIComponent(mandat)}&uid=${encodeURIComponent(uid)}`;
}

/**
 * Build a proposal row from one Slovenian XML `PREDPIS` record.
 */
export function buildProposalFromDzRsRecord(
  record: DzRsBillRecord,
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
  const card = record.KARTICA_PREDPISA ?? {};
  const title = String(card.KARTICA_NAZIV ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const sponsor = String(card.KARTICA_PREDLAGATELJ ?? '').replace(/\s+/g, ' ').trim();
  const procedure = String(card.KARTICA_POSTOPEK ?? '').replace(/\s+/g, ' ').trim();
  const phase = String(card.KARTICA_FAZA_POSTOPKA ?? '').replace(/\s+/g, ' ').trim();
  const publication = String(card.KARTICA_OBJAVA ?? '').replace(/\s+/g, ' ').trim();
  const keywords = String(card.KARTICA_KLJUCNE_BESEDE ?? '').split(',').map((entry) => entry.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const submittedDate = String(card.KARTICA_DATUM ?? '').trim() || new Date().toISOString().slice(0, 10);
  const summary = [phase, procedure, publication].filter(Boolean).join(' | ') || title;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status: normalizeStatus(card),
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'SI',
    country_name: 'Slovenia',
    vote_date: null,
    submitted_date: submittedDate.slice(0, 10),
    sponsors: sponsor ? [sponsor] : [],
    affected_laws: [],
    evidence_count: 1,
    summary,
    policy_area: detectPolicyArea(title, keywords),
    source_url: buildDzRsSourceUrl(card.UNID, card.KARTICA_MANDAT),
    data_source: 'dz_rs',
  };
}
