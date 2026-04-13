export interface OfficialRosterRecord {
  alternateNames: string[];
  countryCode: string;
  countryName: string;
  role: string;
  jurisdiction: string;
  recordId: string;
  sourceLabel: string;
  sourceUrl: string;
  datasetUrl: string;
  name: string;
  partyAbbreviation: string | null;
  partyName: string | null;
  constituency: string | null;
  inOfficeSince: string | null;
}

const PORTUGAL_ROSTER_URL = 'https://www.parlamento.pt/DeputadoGP/Paginas/Deputados_ef.aspx';
const PORTUGAL_OPEN_DATA_ROOT_URL = 'https://www.parlamento.pt/Cidadania/Paginas/DARegistoBiografico.aspx';
const PORTUGAL_SOURCE_LABEL = 'Assembleia da Republica roster';

const GERMANY_DATASET_URL = 'https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip';
const GERMANY_SOURCE_URL = 'https://www.bundestag.de/open-data-inhalt-472740';
const GERMANY_SOURCE_LABEL = 'Bundestag open data';

const PORTUGAL_PARTY_NAMES: Record<string, string> = {
  BE: 'Bloco de Esquerda',
  CDS: 'CDS - Partido Popular',
  'CDS-PP': 'CDS - Partido Popular',
  CH: 'Chega',
  IL: 'Iniciativa Liberal',
  JPP: 'Juntos Pelo Povo',
  L: 'Livre',
  PAN: 'Pessoas-Animais-Natureza',
  PCP: 'Partido Comunista Portugues',
  PEV: 'Partido Ecologista "Os Verdes"',
  PS: 'Partido Socialista',
  PSD: 'Partido Social Democrata',
};

const GERMANY_PARTY_NAMES: Record<string, string> = {
  AfD: 'Alternative for Germany',
  BSW: 'Bundnis Sahra Wagenknecht',
  CDU: 'Christian Democratic Union of Germany',
  CSU: 'Christian Social Union in Bavaria',
  FDP: 'Free Democratic Party',
  SPD: 'Social Democratic Party of Germany',
  'Die Linke': 'The Left',
  'Die Grunen': 'Alliance 90/The Greens',
  'Bundnis 90/Die Grunen': 'Alliance 90/The Greens',
  'Bundnis 90/Die Grünen': 'Alliance 90/The Greens',
  'Bündnis 90/Die Grünen': 'Alliance 90/The Greens',
};

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeDisplayText(value: string | null | undefined) {
  if (!value) return '';
  return cleanWhitespace(decodeHtmlEntities(stripTags(value)));
}

function normalizePartyLabel(label: string | null | undefined, countryCode: string) {
  const cleaned = normalizeDisplayText(label);
  if (!cleaned) return { abbreviation: null, name: null };

  if (countryCode === 'PT') {
    return {
      abbreviation: cleaned,
      name: PORTUGAL_PARTY_NAMES[cleaned] ?? cleaned,
    };
  }

  if (countryCode === 'DE') {
    return {
      abbreviation: cleaned,
      name: GERMANY_PARTY_NAMES[cleaned] ?? cleaned,
    };
  }

  return { abbreviation: cleaned, name: cleaned };
}

function parseGermanDate(value: string | null | undefined) {
  const cleaned = normalizeDisplayText(value);
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string | null | undefined) {
  const cleaned = normalizeDisplayText(value);
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return cleaned;
}

function getSingleTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return normalizeDisplayText(match?.[1] ?? '');
}

function getTagBlocks(block: string, tagName: string) {
  return [...block.matchAll(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'g'))].map((match) => match[1]);
}

function joinNameParts(parts: Array<string | null | undefined>) {
  return cleanWhitespace(parts.filter((part) => part && part.trim().length > 0).join(' '));
}

function chooseActiveNameBlock(block: string) {
  const nameBlocks = getTagBlocks(block, 'NAME');
  if (nameBlocks.length === 0) return null;
  return (
    nameBlocks.find((nameBlock) => {
      const until = getSingleTag(nameBlock, 'HISTORIE_BIS');
      return until.length === 0;
    }) ?? nameBlocks[nameBlocks.length - 1]
  );
}

function isActiveCurrentMandate(periodBlock: string, currentWp: number, referenceDate: Date) {
  const wp = Number.parseInt(getSingleTag(periodBlock, 'WP'), 10);
  if (!Number.isFinite(wp) || wp !== currentWp) return false;

  const mandateEnd = parseGermanDate(getSingleTag(periodBlock, 'MDBWP_BIS'));
  if (!mandateEnd) return true;

  const referenceIso = referenceDate.toISOString().slice(0, 10);
  return mandateEnd >= referenceIso;
}

function extractCurrentFaction(periodBlock: string) {
  const institutions = getTagBlocks(periodBlock, 'INSTITUTION');
  for (const institution of institutions) {
    const institutionType = getSingleTag(institution, 'INSART_LANG').toLowerCase();
    if (institutionType.includes('fraktion') || institutionType.includes('gruppe')) {
      return getSingleTag(institution, 'INS_LANG');
    }
  }
  return '';
}

export function normalizeNameForMatch(value: string) {
  return value
    .replace(/\s+\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(dr|prof|professor|sir|doutor|doctor)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseRomanNumeral(value: string | null | undefined) {
  const cleaned = normalizeDisplayText(value).toUpperCase();
  if (!cleaned) return null;

  const values: Record<string, number> = {
    C: 100,
    D: 500,
    I: 1,
    L: 50,
    M: 1000,
    V: 5,
    X: 10,
  };

  let total = 0;
  let previous = 0;
  for (let index = cleaned.length - 1; index >= 0; index -= 1) {
    const current = values[cleaned[index]];
    if (!current) return null;
    if (current < previous) total -= current;
    else total += current;
    previous = current;
  }

  return total;
}

export function extractPortugalCurrentLegislatureUrl(html: string) {
  const matches = [...html.matchAll(/title="Pasta ([IVXLCDM]+) Legislatura"[^>]*href="([^"]*DARegistoBiografico\.aspx\?[^"]+)"/g)];
  if (matches.length === 0) return null;

  const sorted = matches
    .map((match) => ({
      href: match[2],
      numeral: match[1],
      rank: parseRomanNumeral(match[1]) ?? -1,
    }))
    .sort((left, right) => right.rank - left.rank);

  if (!sorted[0]?.href) return null;
  return {
    legislature: sorted[0].numeral,
    url: new URL(sorted[0].href.replace(/&amp;/g, '&'), PORTUGAL_OPEN_DATA_ROOT_URL).toString(),
  };
}

export function extractPortugalRegistryJsonUrl(html: string) {
  const match = html.match(/https:\/\/app\.parlamento\.pt\/webutils\/docs\/doc\.txt\?[^"']*fich=RegistoBiografico[^"']+_json\.txt[^"']*Inline=true/);
  if (!match) return null;
  return match[0].replace(/&amp;/g, '&');
}

export function parsePortugalAssemblyRoster(html: string): OfficialRosterRecord[] {
  const records: OfficialRosterRecord[] = [];
  const blockRegex =
    /<div class="TextoRegular-Titulo">Nome<\/div>\s*<a[^>]+href="(?<href>[^"]*Biografia\.aspx\?BID=(?<bid>\d+))"[^>]*>(?<name>[^<]+)<\/a>[\s\S]*?<div class="TextoRegular-Titulo">Círculo Eleitoral<\/div>\s*<span[^>]*>(?<constituency>[^<]*)<\/span>[\s\S]*?<div class="TextoRegular-Titulo">Grupo Parlamentar \/ Partido<\/div>\s*<span[^>]*>(?<party>[^<]*)<\/span>/g;

  for (const match of html.matchAll(blockRegex)) {
    const bid = match.groups?.bid?.trim();
    const rawHref = match.groups?.href?.trim();
    const name = normalizeDisplayText(match.groups?.name);
    const constituency = normalizeDisplayText(match.groups?.constituency) || null;
    const { abbreviation, name: partyName } = normalizePartyLabel(match.groups?.party, 'PT');

    if (!bid || !rawHref || !name) continue;

    records.push({
      alternateNames: [name],
      countryCode: 'PT',
      countryName: 'Portugal',
      role: 'Member of Parliament',
      jurisdiction: 'federal',
      recordId: `pt-ar:${bid}`,
      sourceLabel: PORTUGAL_SOURCE_LABEL,
      sourceUrl: new URL(rawHref, PORTUGAL_ROSTER_URL).toString(),
      datasetUrl: PORTUGAL_ROSTER_URL,
      name,
      partyAbbreviation: abbreviation,
      partyName,
      constituency,
      inOfficeSince: null,
    });
  }

  return records;
}

type PortugalDeputyLegislature = {
  CeDes?: string | null;
  DepNomeParlamentar?: string | null;
  GpDes?: string | null;
  GpSigla?: string | null;
  IndData?: string | null;
  LegDes?: string | null;
  ParDes?: string | null;
  ParSigla?: string | null;
};

type PortugalDeputyRecord = {
  CadDeputadoLegis?: PortugalDeputyLegislature[] | null;
  CadId?: number | string | null;
  CadNomeCompleto?: string | null;
};

function pickPortugalLegislature(
  legislatures: PortugalDeputyLegislature[] | null | undefined,
  currentLegislature: string | null,
) {
  if (!Array.isArray(legislatures) || legislatures.length === 0) return null;

  const normalizedCurrent = normalizeDisplayText(currentLegislature);
  if (normalizedCurrent) {
    return legislatures.find((entry) => normalizeDisplayText(entry.LegDes) === normalizedCurrent) ?? null;
  }

  return [...legislatures].sort((left, right) => {
    const leftRank = parseRomanNumeral(left.LegDes) ?? -1;
    const rightRank = parseRomanNumeral(right.LegDes) ?? -1;
    return rightRank - leftRank;
  })[0];
}

export function parsePortugalBiographicalRegistryJson(
  jsonText: string,
  currentLegislature: string | null,
): OfficialRosterRecord[] {
  const payload = JSON.parse(jsonText) as PortugalDeputyRecord[];
  if (!Array.isArray(payload)) return [];

  const records: OfficialRosterRecord[] = [];
  for (const row of payload) {
    const legislature = pickPortugalLegislature(row.CadDeputadoLegis, currentLegislature);
    const deputyId = row.CadId == null ? null : String(row.CadId).trim();
    const legalName = normalizeDisplayText(row.CadNomeCompleto);
    if (!deputyId || !legalName || !legislature) continue;

    const partyAbbreviation = normalizeDisplayText(legislature.GpSigla || legislature.ParSigla) || null;
    const partyName = normalizeDisplayText(legislature.GpDes || legislature.ParDes) || null;
    const displayName = normalizeDisplayText(legislature.DepNomeParlamentar) || legalName;
    const alternateNames = [...new Set([displayName, legalName].filter((value) => value.length > 0))];

    records.push({
      alternateNames,
      countryCode: 'PT',
      countryName: 'Portugal',
      role: 'Member of Parliament',
      jurisdiction: 'federal',
      recordId: `pt-ar:${deputyId}`,
      sourceLabel: PORTUGAL_SOURCE_LABEL,
      sourceUrl: `https://www.parlamento.pt/DeputadoGP/Paginas/Biografia.aspx?BID=${encodeURIComponent(deputyId)}`,
      datasetUrl: PORTUGAL_OPEN_DATA_ROOT_URL,
      name: displayName,
      partyAbbreviation,
      partyName,
      constituency: normalizeDisplayText(legislature.CeDes) || null,
      inOfficeSince: parseIsoDate(legislature.IndData),
    });
  }

  return records;
}

export function parseBundestagMembersXml(xml: string, referenceDate = new Date()): OfficialRosterRecord[] {
  const wpValues = [...xml.matchAll(/<WP>(\d+)<\/WP>/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));

  if (wpValues.length === 0) return [];

  const currentWp = Math.max(...wpValues);
  const blocks = getTagBlocks(xml, 'MDB');
  const records: OfficialRosterRecord[] = [];

  for (const block of blocks) {
    const currentPeriod = getTagBlocks(block, 'WAHLPERIODE').find((periodBlock) =>
      isActiveCurrentMandate(periodBlock, currentWp, referenceDate)
    );

    if (!currentPeriod) continue;

    const id = getSingleTag(block, 'ID');
    const nameBlock = chooseActiveNameBlock(block);
    const firstName = nameBlock ? getSingleTag(nameBlock, 'VORNAME') : '';
    const prefix = nameBlock ? getSingleTag(nameBlock, 'PRAEFIX') : '';
    const nobility = nameBlock ? getSingleTag(nameBlock, 'ADEL') : '';
    const lastName = nameBlock ? getSingleTag(nameBlock, 'NACHNAME') : '';
    const locality = nameBlock ? getSingleTag(nameBlock, 'ORTSZUSATZ') : '';
    const name = joinNameParts([firstName, prefix, nobility, lastName, locality]);

    if (!id || !name) continue;

    const partyFromBio = getSingleTag(block, 'PARTEI_KURZ');
    const currentFaction = extractCurrentFaction(currentPeriod);
    const constituency = cleanWhitespace(
      [getSingleTag(currentPeriod, 'WKR_NAME'), getSingleTag(currentPeriod, 'WKR_LAND')]
        .filter((value) => value.length > 0)
        .join(' / ')
    ) || null;
    const inOfficeSince = parseGermanDate(getSingleTag(currentPeriod, 'MDBWP_VON'));
    const { abbreviation, name: partyName } = normalizePartyLabel(partyFromBio || currentFaction, 'DE');

    records.push({
      alternateNames: [name],
      countryCode: 'DE',
      countryName: 'Germany',
      role: 'Member of Bundestag',
      jurisdiction: 'federal',
      recordId: `de-bundestag:${id}`,
      sourceLabel: GERMANY_SOURCE_LABEL,
      sourceUrl: GERMANY_SOURCE_URL,
      datasetUrl: GERMANY_DATASET_URL,
      name,
      partyAbbreviation: abbreviation,
      partyName,
      constituency,
      inOfficeSince,
    });
  }

  return records;
}
