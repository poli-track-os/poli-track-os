// EP committee + delegation name → official URL resolver.
//
// MEPs' committee membership is stored in `politicians.committees[]` as
// an array of free-form strings like "Committee on Foreign Affairs" or
// "Delegation to the Euro-Latin American Parliamentary Assembly". The
// European Parliament publishes each committee and delegation at a stable
// URL keyed by a 3-6 letter abbreviation.
//
// Committees:   https://www.europarl.europa.eu/committees/en/{abbr}/home/highlights
// Delegations:  https://www.europarl.europa.eu/delegations/en/{code}/home
//
// We keep a name → abbreviation map. Unknown names return null and the
// caller renders plain text.

// Committee name (lowercased) → EP committee abbreviation.
// Source: https://www.europarl.europa.eu/committees/en/home
const COMMITTEE_ABBR: Record<string, string> = {
  'committee on foreign affairs': 'afet',
  'foreign affairs committee': 'afet',
  'subcommittee on human rights': 'droi',
  'subcommittee on security and defence': 'sede',
  'committee on development': 'deve',
  'committee on international trade': 'inta',
  'committee on budgets': 'budg',
  'committee on budgetary control': 'cont',
  'committee on economic and monetary affairs': 'econ',
  'subcommittee on tax matters': 'fisc',
  'committee on employment and social affairs': 'empl',
  'committee on the environment, public health and food safety': 'envi',
  'committee on the environment, climate and food safety': 'envi',
  'committee on environment, public health and food safety': 'envi',
  'committee on environment, climate and food safety': 'envi',
  'committee on industry, research and energy': 'itre',
  'committee on internal market and consumer protection': 'imco',
  'committee on the internal market and consumer protection': 'imco',
  'committee on transport and tourism': 'tran',
  'committee on regional development': 'regi',
  'committee on agriculture and rural development': 'agri',
  'committee on fisheries': 'pech',
  'committee on culture and education': 'cult',
  'committee on legal affairs': 'juri',
  'committee on civil liberties, justice and home affairs': 'libe',
  'committee on constitutional affairs': 'afco',
  "committee on women's rights and gender equality": 'femm',
  "committee on women’s rights and gender equality": 'femm', // curly apostrophe
  'committee on petitions': 'peti',
  'special committee on beating cancer': 'beca',
  'committee on security and defence': 'sede',
};

// Delegations are too numerous for an exhaustive map; we do pattern
// matching on the country or region in the name.
// Canonical pattern: "Delegation to ..." / "Delegation for ..." / "Delegation for relations with ..."
// The EP URL path code is a short mnemonic like D-US, D-CN, D-MED, etc.
// When we can't confidently map, we return the generic delegations index.
const DELEGATIONS_INDEX = 'https://www.europarl.europa.eu/delegations/en/list-delegations/chairs';

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a committee / delegation name to its official EP URL.
 * Returns null if we don't have a confident mapping.
 */
export function resolveEpCommitteeUrl(rawName: string): string | null {
  const name = normalizeName(rawName);
  if (!name) return null;

  // Direct lookup.
  const abbr = COMMITTEE_ABBR[name];
  if (abbr) return `https://www.europarl.europa.eu/committees/en/${abbr}/home/highlights`;

  // Delegations — we can at least link to the delegations index so users
  // can drill down to the specific one.
  if (name.startsWith('delegation') || name.includes('parliamentary assembly')) {
    return DELEGATIONS_INDEX;
  }

  // Fuzzy match on the committee suffix. Many national rosters spell
  // "Committee on X" slightly differently; try to find any prefix match.
  for (const [label, code] of Object.entries(COMMITTEE_ABBR)) {
    if (name.includes(label) || label.includes(name)) {
      return `https://www.europarl.europa.eu/committees/en/${code}/home/highlights`;
    }
  }

  return null;
}

/**
 * Return the EP abbreviation for a committee name, or null.
 * Useful for displaying a short badge next to the full name.
 */
export function resolveEpCommitteeAbbr(rawName: string): string | null {
  const name = normalizeName(rawName);
  return COMMITTEE_ABBR[name]?.toUpperCase() || null;
}
