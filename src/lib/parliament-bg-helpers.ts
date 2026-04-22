/**
 * Pure helpers for ingesting Bulgarian parliamentary bills from the official
 * National Assembly JSON API.
 * No I/O, no Supabase.
 */

export interface BgBillSponsor {
  A_ns_MP_id?: number | null;
  A_ns_MPL_Name1?: string | null;
  A_ns_MPL_Name2?: string | null;
  A_ns_MPL_Name3?: string | null;
  A_ns_C_id?: number | null;
}

export interface BgBillRow {
  L_Act_id?: number | null;
  L_Act_sign?: string | null;
  L_Act_date?: string | null;
  L_Act_date2?: string | null;
  L_Act_dv_iss?: string | null;
  L_Act_dv_year?: number | null;
  L_ActL_title?: string | null;
  L_ActL_final?: string | null;
  withdrawn?: boolean | null;
  imp_list?: BgBillSponsor[] | null;
  imp_list_min?: BgBillSponsor[] | null;
  dist_list?: unknown[] | null;
  stan_list?: unknown[] | null;
  stan_list2?: unknown[] | null;
  stan_list2_1?: unknown[] | null;
  standp_list?: unknown[] | null;
  activity?: unknown[] | null;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/енерг|електр|газ|климат|емиси/i, 'energy'],
  [/здрав|болниц|лекар|медицин|ваксин/i, 'health'],
  [/миграц|убежищ|границ|чужден/i, 'migration'],
  [/отбран|военн|сигурност/i, 'defence'],
  [/дигитал|данн|кибер|изкуствен интелект/i, 'digital'],
  [/земедел|горск|рибар|хран/i, 'agriculture'],
  [/търгов|митниц|икономичес|индустр/i, 'trade'],
  [/данък|бюджет|финанс|осигурител|банков/i, 'finance'],
  [/транспорт|железоп|пътн|въздухоплав|пристан/i, 'transport'],
  [/околна среда|отпад|вода|природ/i, 'environment'],
  [/труд|заетост|социал|пенси|заплат/i, 'labour'],
  [/наказател|правосъд|съд|полици|затвор/i, 'justice'],
  [/образован|училищ|университет|наука/i, 'education'],
];

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function detectPolicyArea(title: string, finalTitle: string): string | null {
  const haystack = `${title} ${finalTitle}`;
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function isRealDate(value: string | null | undefined): boolean {
  const text = cleanText(value);
  return Boolean(text && !text.startsWith('0000-00-00') && !text.startsWith('0001-01-01'));
}

function normalizeStatus(row: BgBillRow): string {
  if (row.withdrawn) return 'withdrawn';
  if (isRealDate(row.L_Act_date2) || cleanText(row.L_Act_dv_iss) || row.L_Act_dv_year || cleanText(row.L_ActL_final)) return 'adopted';
  if ((row.activity?.length ?? 0) > 0 || (row.stan_list?.length ?? 0) > 0 || (row.stan_list2?.length ?? 0) > 0 || (row.dist_list?.length ?? 0) > 0) {
    return 'parliamentary_deliberation';
  }
  return 'consultation';
}

function extractSponsors(row: BgBillRow): string[] {
  const sponsors = new Set<string>();
  for (const sponsor of row.imp_list ?? []) {
    const fullName = [sponsor.A_ns_MPL_Name1, sponsor.A_ns_MPL_Name2, sponsor.A_ns_MPL_Name3].map((part) => cleanText(part)).filter(Boolean).join(' ');
    if (fullName) sponsors.add(fullName);
  }
  for (const sponsor of row.imp_list_min ?? []) {
    if (sponsor.A_ns_C_id) sponsors.add(`A_ns_C_id:${sponsor.A_ns_C_id}`);
  }
  return [...sponsors];
}

export function buildParliamentBgSourceUrl(id: number | string): string {
  return `https://www.parliament.bg/api/v1/bill/${encodeURIComponent(String(id).trim())}`;
}

/**
 * Build a proposal row from one Bulgarian bill detail row.
 */
export function buildProposalFromParliamentBgRow(
  row: BgBillRow,
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
  const id = row.L_Act_id;
  const title = cleanText(row.L_ActL_title);
  if (!id || !title) return null;

  const finalTitle = cleanText(row.L_ActL_final);
  const status = normalizeStatus(row);
  const submittedDate = cleanText(row.L_Act_date).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const voteDate = isRealDate(row.L_Act_date2) ? cleanText(row.L_Act_date2).slice(0, 10) : null;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'BG',
    country_name: 'Bulgaria',
    vote_date: status === 'adopted' ? voteDate : null,
    submitted_date: submittedDate,
    sponsors: extractSponsors(row),
    affected_laws: [],
    evidence_count: 1,
    summary: finalTitle || title,
    policy_area: detectPolicyArea(title, finalTitle),
    source_url: buildParliamentBgSourceUrl(id),
    data_source: 'parliament_bg',
  };
}
