import type { Actor } from '@/data/domain';

type LeadershipRule = {
  category: string;
  priority: number;
  patterns: string[];
};

const HEAD_OF_STATE_RULE: LeadershipRule = { category: 'head_of_state', priority: 120, patterns: [] };
const HEAD_OF_GOVERNMENT_RULE: LeadershipRule = { category: 'head_of_government', priority: 115, patterns: [] };
const VICE_HEAD_OF_GOVERNMENT_RULE: LeadershipRule = { category: 'vice_head_of_government', priority: 108, patterns: [] };
const LEGISLATIVE_LEADERSHIP_RULE: LeadershipRule = { category: 'legislative_leadership', priority: 110, patterns: [] };

const LEGISLATIVE_LEADERSHIP_PATTERNS = [
  'speaker',
  'president of the bundestag',
  'president of the chamber',
  'president of the chamber of deputies',
  'president of the national assembly',
  'president of the national council',
  'president of the parliament',
  'president of parliament',
  'president of the riigikogu',
  'president of the sejm',
  'president of the seimas',
  'president of the saeima',
  'president of the senate',
  'president of the lower house',
  'president of the assembly',
  'marshal of the sejm',
];

const HEAD_OF_STATE_PATTERNS = [
  'head of state',
  'president of the republic',
  'president of republic',
  'president of the french republic',
];

const HEAD_OF_GOVERNMENT_PATTERNS = [
  'head of government',
  'prime minister',
  'federal chancellor',
  'chancellor',
  'premier',
  'president of the government',
  'taoiseach',
];

const VICE_HEAD_OF_GOVERNMENT_PATTERNS = [
  'vice-chancellor',
  'vice chancellor',
  'vice prime minister',
  'deputy prime minister',
  'deputy prime-minister',
];

const LEADERSHIP_RULES: LeadershipRule[] = [
  { category: 'foreign_affairs', priority: 105, patterns: ['foreign', 'external affairs', 'international affairs', 'foreign relations'] },
  { category: 'finance', priority: 104, patterns: ['finance', 'treasury', 'budget', 'fiscal'] },
  { category: 'defense', priority: 103, patterns: ['defence', 'defense', 'war', 'national security'] },
  { category: 'interior', priority: 102, patterns: ['interior', 'internal affairs', 'home affairs', 'domestic affairs'] },
  { category: 'justice', priority: 101, patterns: ['justice', 'attorney general', 'prosecutor general'] },
  { category: 'health', priority: 100, patterns: ['health', 'healthcare', 'public health', 'medical', 'public welfare'] },
  { category: 'education', priority: 99, patterns: ['education', 'schools', 'research', 'science', 'higher education', 'public instruction'] },
  { category: 'labor', priority: 98, patterns: ['labour', 'labor', 'employment', 'workforce'] },
  { category: 'social', priority: 97, patterns: ['social affairs', 'family', 'children'] },
  { category: 'environment', priority: 96, patterns: ['environment', 'climate'] },
  { category: 'energy', priority: 95, patterns: ['energy'] },
  { category: 'transport', priority: 94, patterns: ['transport', 'infrastructure'] },
  { category: 'agriculture', priority: 93, patterns: ['agriculture', 'food'] },
  { category: 'economy', priority: 92, patterns: ['economy', 'economic', 'trade', 'industry', 'commerce', 'enterprise'] },
  { category: 'digital', priority: 91, patterns: ['digital', 'technology', 'communications'] },
  { category: 'secretary_of_state', priority: 90, patterns: ['secretary of state', 'state secretary', 'secretary for'] },
  { category: 'military', priority: 89, patterns: ['chief of defence', 'chief of defense', 'chief of staff', 'armed forces', 'military', 'general staff', 'commander', 'defence staff', 'defense staff'] },
  { category: 'minister', priority: 70, patterns: ['minister'] },
];

const LEADERSHIP_EXCLUSIONS = [
  'member of parliament',
  'member of bundestag',
  'member of european parliament',
  'vice president of the bundestag',
  'spouse',
  'judge',
  'court',
  'curia',
  'senator',
  'ambassador',
  'mayor',
  'governor',
  'commission',
  'ombudsman',
];

export interface LeadershipEntry {
  category: string;
  office: string;
  personName: string;
  href?: string;
  source: 'tracked' | 'reference';
  sourceUrl?: string;
  priority: number;
}

const PARTY_LEADERSHIP_PATTERNS = [
  'party',
  'alliance',
  'movement',
  'coalition',
  'cooperation',
  'social democracy',
  'democratic alignment',
];

function normalizeLeadershipLabel(label: string) {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(label: string, patterns: string[]) {
  return patterns.some((pattern) => label.includes(pattern));
}

function isExcludedLeadershipLabel(label: string) {
  if (!label) return true;
  if (label.includes('former ') || label.startsWith('former') || label.includes('previous ') || label.startsWith('ex-')) {
    return true;
  }
  if (label.includes('president of') && includesAny(label, PARTY_LEADERSHIP_PATTERNS)) return true;
  return LEADERSHIP_EXCLUSIONS.some((pattern) => label.includes(pattern));
}

function matchLeadershipRule(label: string) {
  const lower = normalizeLeadershipLabel(label);
  if (!lower) return undefined;
  if (isExcludedLeadershipLabel(lower)) return undefined;

  if (includesAny(lower, LEGISLATIVE_LEADERSHIP_PATTERNS)) {
    return LEGISLATIVE_LEADERSHIP_RULE;
  }

  if (includesAny(lower, VICE_HEAD_OF_GOVERNMENT_PATTERNS)) {
    return VICE_HEAD_OF_GOVERNMENT_RULE;
  }

  if (includesAny(lower, HEAD_OF_GOVERNMENT_PATTERNS)) {
    return HEAD_OF_GOVERNMENT_RULE;
  }

  if (
    lower === 'president' ||
    includesAny(lower, HEAD_OF_STATE_PATTERNS) ||
    /\b(king|queen|monarch|emir|grand duke)\b/.test(lower)
  ) {
    return HEAD_OF_STATE_RULE;
  }

  return LEADERSHIP_RULES.find((rule) => rule.patterns.some((pattern) => lower.includes(pattern)));
}

export function normalizePersonName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getLeadershipPriority(label: string) {
  return matchLeadershipRule(label)?.priority ?? -1;
}

export function getLeadershipCategory(label: string) {
  return matchLeadershipRule(label)?.category;
}

export function isLeadershipRole(label: string) {
  const lower = normalizeLeadershipLabel(label);
  if (isExcludedLeadershipLabel(lower)) return false;
  return Boolean(matchLeadershipRule(lower));
}

export function buildTrackedLeadershipEntries(actors: Actor[]): LeadershipEntry[] {
  return actors
    .filter((actor) => actor.role && isLeadershipRole(actor.role))
    .map((actor) => ({
      category: getLeadershipCategory(actor.role) || actor.role.toLowerCase(),
      office: actor.role,
      personName: actor.name,
      href: `/actors/${actor.id}`,
      sourceUrl: actor.sourceUrl || actor.wikipediaUrl,
      source: 'tracked' as const,
      priority: getLeadershipPriority(actor.role),
    }))
    .sort((left, right) => right.priority - left.priority || left.office.localeCompare(right.office));
}
