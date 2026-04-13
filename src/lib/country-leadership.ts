import type { Actor } from '@/data/domain';

const LEADERSHIP_RULES = [
  { category: 'head_of_state', priority: 120, patterns: ['head of state', 'president', 'king', 'queen', 'monarch', 'emir'] },
  { category: 'head_of_government', priority: 115, patterns: ['head of government', 'prime minister', 'chancellor', 'premier'] },
  { category: 'vice_head_of_government', priority: 108, patterns: ['vice chancellor', 'vice prime minister', 'deputy prime minister'] },
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
  'speaker',
  'judge',
  'court',
  'senator',
  'ambassador',
  'mayor',
  'governor',
  'commission',
];

export interface LeadershipEntry {
  category: string;
  office: string;
  personName: string;
  href?: string;
  source: 'tracked' | 'wikidata';
  priority: number;
}

function matchLeadershipRule(label: string) {
  const lower = label.toLowerCase();
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
  const lower = label.toLowerCase();
  if (lower.includes('former ') || lower.startsWith('former') || lower.includes('previous ') || lower.startsWith('ex-')) {
    return false;
  }
  if (LEADERSHIP_EXCLUSIONS.some((pattern) => lower.includes(pattern))) return false;
  return LEADERSHIP_RULES.some((rule) => rule.patterns.some((pattern) => lower.includes(pattern)));
}

export function buildTrackedLeadershipEntries(actors: Actor[]): LeadershipEntry[] {
  return actors
    .filter((actor) => actor.role && isLeadershipRole(actor.role))
    .map((actor) => ({
      category: getLeadershipCategory(actor.role) || actor.role.toLowerCase(),
      office: actor.role,
      personName: actor.name,
      href: `/actors/${actor.id}`,
      source: 'tracked' as const,
      priority: getLeadershipPriority(actor.role),
    }))
    .sort((left, right) => right.priority - left.priority || left.office.localeCompare(right.office));
}
