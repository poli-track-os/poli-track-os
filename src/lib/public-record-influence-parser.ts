const PCAST_FALLBACK_NAMES = [
  'Marc Andreessen',
  'Sergey Brin',
  'Safra Catz',
  'Michael Dell',
  'Jacob DeWitte',
  'Fred Ehrsam',
  'Larry Ellison',
  'David Friedberg',
  'Jensen Huang',
  'John Martinis',
  'Bob Mumgaard',
  'Lisa Su',
  'Mark Zuckerberg',
];

export const EU_GCSA_FALLBACK_NAMES = [
  'Dimitra Simeonidou',
  'Rémy Slama',
  'Mangala Srinivas',
  'Adam Izdebski',
  'Martin Kahanec',
  'Rafał Łukasik',
  'Naomi Ellemers',
];

export function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&Eacute;/g, 'É');
}

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parsePcastNames(html: string) {
  const match = html.match(/The following individuals have been appointed:<\/p>\s*<p>([\s\S]*?)<\/p>/i);
  if (!match) return PCAST_FALLBACK_NAMES;
  const names = decodeHtml(match[1])
    .split(/<br\s*\/?>|\n/i)
    .map((part) => stripTags(part))
    .filter((part) => /^[A-Z][A-Za-z .'-]+$/.test(part));
  return names.length >= 5 ? names : PCAST_FALLBACK_NAMES;
}

export function parseStrongNames(html: string, fallback: string[]) {
  const names = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)]
    .map((match) => stripTags(match[1]))
    .filter((name) => name.length > 2 && !/^(Chair|Vice-Chair)$/i.test(name));
  return names.length >= 5 ? [...new Set(names)] : fallback;
}

export function parseEgeMembers(html: string) {
  return [...html.matchAll(/ecl-list-illustration__title">([^<]+)<\/div>[\s\S]*?ecl-list-illustration__description"><div class="ecl">([\s\S]*?)<\/div><\/div>/g)]
    .map((match) => ({
      name: stripTags(match[1]),
      description: stripTags(match[2]),
      role: /<strong>([^<]+)<\/strong>/.exec(match[2])?.[1] || null,
    }))
    .filter((member) => member.name.length > 2);
}
