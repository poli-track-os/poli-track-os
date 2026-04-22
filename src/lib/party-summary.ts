import type { Actor } from '@/data/domain';

export function slugifyPartyName(value: string) {
  // NFD-normalize so accented characters are folded to ASCII before the
  // [^a-z0-9]+ replace eats them. Without this:
  //   "Bündnis 90/Die Grünen" → "b-ndnis-90-die-gr-nen" (each umlaut
  //   becomes a dash). With NFD normalization → "bundnis-90-die-grunen".
  // The slug is used as a URL parameter in /country/:countryId/party/:partyId
  // and as a key in PartyDetail's lookup, so a more readable + injective
  // slug is meaningfully better.
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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
