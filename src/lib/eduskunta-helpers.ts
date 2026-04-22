import { XMLParser } from 'fast-xml-parser';

export type EduskuntaListRow = unknown[];
export type EduskuntaDetailRow = unknown[];

export type EduskuntaListEntry = {
  id: string;
  reference: string;
  createdAt: string;
  language: string | null;
};

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/\benergia|\bsahko|\bkaasu|\bilmasto|\bpaasto|\bvet(y|yyn)/i, 'energy'],
  [/\bterveys|\bsairaa|\blaake|\bhoito|\bsairaala/i, 'health'],
  [/\bmaahanmuut|\bturvapaik|\bulkomaalais|\bkotout|\braja/i, 'migration'],
  [/\bpuolustus|\bsotila|\bturvallisuus|\bvarusmies|\basevelvoll/i, 'defence'],
  [/\bdigita|\btieto|\btekoaly|\bkyber|\bverkko/i, 'digital'],
  [/\bmaatalou|\bmetsatalou|\bkalastus|\belintarvik/i, 'agriculture'],
  [/\bkauppa|\btulli|\byritys|\bteollis/i, 'trade'],
  [/\btalousarvio|\bvero|\bverotus|\bmaksu|\brahoit|\bpankki|\bbudjet/i, 'finance'],
  [/\bliikenne|\brautatie|\btie|\bilmailu|\bsatama|\bmerenkulku/i, 'transport'],
  [/\bymparisto|\bluonnon|\bjate|\bvesi|\bpaasto/i, 'environment'],
  [/\btyo|\btyollisy|\bsosiaal|\bpalkka|\belake/i, 'labour'],
  [/\boikeus|\brikos|\btuomio|\bpoliisi|\bvankeus/i, 'justice'],
  [/\bopetus|\bkoulu|\byliopisto|\btiede|\bvarhaiskasv/i, 'education'],
];

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned ? [cleaned] : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => collectText(entry));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith('@_'))
      .flatMap(([, entry]) => collectText(entry));
  }
  return [];
}

function normalizeStatus(value: string | null | undefined): string {
  const folded = foldText(value ?? '');
  if (!folded) return 'consultation';
  if (folded.includes('peruut')) return 'withdrawn';
  if (folded.includes('rauen')) return 'rejected';
  if (folded.includes('kasittely')) return 'parliamentary_deliberation';
  if (folded.includes('hyvaksy') || folded.includes('vahvist')) return 'adopted';
  return 'consultation';
}

function detectPolicyArea(title: string, summary: string): string | null {
  const haystack = foldText(`${title} ${summary}`);
  for (const [pattern, area] of TITLE_TO_POLICY) {
    if (pattern.test(haystack)) return area;
  }
  return null;
}

function extractSummary(value: unknown): string {
  const parts = collectText(value);
  if (parts.length === 0) return '';
  let summary = '';
  for (const part of parts) {
    const next = summary ? `${summary} ${part}` : part;
    if (next.length > 1200) {
      summary = next.slice(0, 1197).trimEnd() + '...';
      break;
    }
    summary = next;
  }
  return summary;
}

function extractSponsors(value: unknown): string[] {
  const sponsors = new Set<string>();
  for (const signer of asArray(value as Record<string, unknown> | null | undefined)) {
    const person = typeof signer === 'object' && signer ? (signer as Record<string, unknown>).Henkilo : null;
    if (!person || typeof person !== 'object') continue;
    const first = String((person as Record<string, unknown>).EtuNimi ?? '').replace(/\s+/g, ' ').trim();
    const last = String((person as Record<string, unknown>).SukuNimi ?? '').replace(/\s+/g, ' ').trim();
    const fullName = `${first} ${last}`.trim();
    if (fullName) sponsors.add(fullName);
  }
  return [...sponsors];
}

export function normalizeEduskuntaReference(value: string | null | undefined): string {
  return String(value ?? '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildEduskuntaDetailUrl(id: string | number): string {
  return `https://avoindata.eduskunta.fi/api/v1/tables/VaskiData/rows?columnName=Id&columnValue=${encodeURIComponent(String(id).trim())}`;
}

export function buildEduskuntaListEntry(row: EduskuntaListRow): EduskuntaListEntry | null {
  const id = String(row[0] ?? '').trim();
  const reference = normalizeEduskuntaReference(String(row[1] ?? ''));
  const createdAt = String(row[2] ?? '').trim();
  const language = String(row[7] ?? '').trim() || null;
  if (!id || !reference) return null;
  return { id, reference, createdAt, language };
}

export function pickPreferredEduskuntaListEntry(
  current: EduskuntaListEntry | null,
  candidate: EduskuntaListEntry,
): EduskuntaListEntry {
  if (!current) return candidate;
  if (candidate.createdAt > current.createdAt) return candidate;
  if (candidate.createdAt === current.createdAt && Number(candidate.id) > Number(current.id)) return candidate;
  return current;
}

/**
 * Build a proposal row from one official Eduskunta government-proposal XML row.
 *
 * The Eduskunta list endpoint is only used to find the current authoritative
 * detail row per parliamentary reference. The actual bill fields come from the
 * XML payload returned by the detail endpoint.
 */
export function buildProposalFromEduskuntaDetail(
  entry: EduskuntaListEntry,
  row: EduskuntaDetailRow,
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
  const id = String(row[0] ?? entry.id).trim();
  const xml = String(row[1] ?? '').trim();
  if (!id || !xml) return null;

  const document = XML.parse(xml) as {
    Siirto?: {
      SiirtoMetatieto?: {
        JulkaisuMetatieto?: Record<string, unknown>;
      };
      SiirtoAsiakirja?: {
        RakenneAsiakirja?: {
          HallituksenEsitys?: Record<string, unknown>;
        };
      };
    };
  };

  const metadata = document.Siirto?.SiirtoMetatieto?.JulkaisuMetatieto ?? {};
  const proposal = document.Siirto?.SiirtoAsiakirja?.RakenneAsiakirja?.HallituksenEsitys ?? {};
  const ident = (proposal.IdentifiointiOsa as Record<string, unknown> | undefined)
    ?? (metadata.IdentifiointiOsa as Record<string, unknown> | undefined)
    ?? {};
  const title =
    String((ident.Nimeke as Record<string, unknown> | undefined)?.NimekeTeksti ?? '').replace(/\s+/g, ' ').trim()
    || String(metadata['@_eduskuntaTunnus'] ?? entry.reference).trim();
  if (!title) return null;

  const status = normalizeStatus(String(metadata['@_tilaKoodi'] ?? row[2] ?? ''));
  const submittedDate =
    String(metadata['@_laadintaPvm'] ?? '').trim()
    || String(row[3] ?? '').slice(0, 10)
    || entry.createdAt.slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  const summary =
    extractSummary((proposal.SisaltoKuvaus as Record<string, unknown> | undefined)?.KappaleKooste)
    || extractSummary((proposal.SisaltoKuvaus as Record<string, unknown> | undefined)?.OtsikkoTeksti)
    || title;

  return {
    title: title.slice(0, 500),
    official_title: title,
    status,
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'FI',
    country_name: 'Finland',
    vote_date: null,
    submitted_date: submittedDate.slice(0, 10),
    sponsors: extractSponsors((proposal.AllekirjoitusOsa as Record<string, unknown> | undefined)?.Allekirjoittaja),
    affected_laws: [],
    evidence_count: 1,
    summary,
    policy_area: detectPolicyArea(title, summary),
    source_url: buildEduskuntaDetailUrl(id),
    data_source: 'eduskunta',
  };
}
