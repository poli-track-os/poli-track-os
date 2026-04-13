export function isWikidataEntityId(value: string | undefined) {
  return Boolean(value && /^Q\d+$/i.test(value.trim()));
}

export function decodeWikipediaTitle(title: string | undefined) {
  if (!title) return undefined;

  try {
    return decodeURIComponent(title.replace(/_/g, ' ')).trim();
  } catch {
    return title.replace(/_/g, ' ').trim();
  }
}

export function deriveNameFromWikipediaUrl(url: string | undefined) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const marker = '/wiki/';
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return undefined;

    return decodeWikipediaTitle(parsed.pathname.slice(index + marker.length));
  } catch {
    return undefined;
  }
}

export function resolvePersonName(personName: string | undefined, wikipediaUrl?: string) {
  const trimmed = personName?.trim();
  if (trimmed && !isWikidataEntityId(trimmed)) {
    return trimmed;
  }

  return deriveNameFromWikipediaUrl(wikipediaUrl);
}

export function getDisplayPersonName(personName: string | undefined, wikipediaUrl?: string, fallback = 'Unresolved profile') {
  return resolvePersonName(personName, wikipediaUrl) || fallback;
}
