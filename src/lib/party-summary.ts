import type { Actor } from '@/data/domain';

export function slugifyPartyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function getTopCommittees(members: Actor[], limit = 3) {
  const committeeCounts = members.reduce<Record<string, number>>((counts, member) => {
    for (const committee of member.committees) {
      counts[committee] = (counts[committee] || 0) + 1;
    }
    return counts;
  }, {});

  return Object.entries(committeeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([committee]) => committee);
}

export function buildPartyDescription(party: string, countryName: string, members: Actor[]) {
  const roles = Array.from(new Set(members.map((member) => member.role).filter(Boolean))).slice(0, 3);
  const committees = getTopCommittees(members);
  const memberLabel = members.length === 1 ? 'politician' : 'politicians';

  const fragments = [
    `${party} is represented by ${members.length} tracked ${memberLabel} in ${countryName}.`,
  ];

  if (roles.length > 0) {
    fragments.push(`Key roles: ${roles.join(', ')}.`);
  }

  if (committees.length > 0) {
    fragments.push(`Most visible committees: ${committees.join(', ')}.`);
  }

  return fragments.join(' ');
}
