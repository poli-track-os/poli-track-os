import { normalizePersonName } from '@/lib/country-leadership';
import { slugifyPartyName } from '@/lib/party-summary';

function cleanValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildCountryRoute(countryCode: string | null | undefined) {
  const code = cleanValue(countryCode)?.toLowerCase();
  return code ? `/country/${code}` : undefined;
}

export function buildPartyRoute(countryCode: string | null | undefined, partyName: string | null | undefined) {
  const countryRoute = buildCountryRoute(countryCode);
  const name = cleanValue(partyName);
  if (!countryRoute || !name) return undefined;
  return `${countryRoute}/party/${slugifyPartyName(name)}`;
}

export function buildActorRoute(actorId: string | null | undefined) {
  const id = cleanValue(actorId);
  return id ? `/actors/${id}` : undefined;
}

export function buildActorSearchRoute(
  personName: string | null | undefined,
  options?: { countryCode?: string | null | undefined },
) {
  const name = cleanValue(personName);
  if (!name) return undefined;

  const params = new URLSearchParams();
  const countryCode = cleanValue(options?.countryCode)?.toLowerCase();
  if (countryCode) params.set('country', countryCode);
  params.set('q', name);
  return `/actors?${params.toString()}`;
}

export function buildInternalPersonRoute(options: {
  actorId?: string | null | undefined;
  countryCode?: string | null | undefined;
  personName?: string | null | undefined;
}) {
  return buildActorRoute(options.actorId) || buildActorSearchRoute(options.personName, { countryCode: options.countryCode });
}

export function isSamePersonName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = cleanValue(left);
  const normalizedRight = cleanValue(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizePersonName(normalizedLeft) === normalizePersonName(normalizedRight);
}
