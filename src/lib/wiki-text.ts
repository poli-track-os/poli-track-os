// Pure cleanup of MediaWiki source markup for display in plain-text contexts.
//
// Background: enrich-wikipedia stores raw infobox values in
// politicians.wikipedia_data.infobox as the source text it pulled from
// Wikipedia. The values look like:
//
//   "[[Social Democratic Party of Germany|SPD]]"
//   "{{birth date and age|1971|3|14|df=y}}"
//   "[[Member of the [[Assembly]]]]"
//   "| constituency = [[Po..."
//
// The frontend needs to render these in a key/value details panel as
// readable strings. The downstream parsers (parseBirthYear, parseInOffice
// Since, parsePartyName, etc.) each apply their own field-specific cleanup
// when they extract structured values; this helper is for the GENERIC
// "show me whatever the raw infobox said" rendering.
//
// Pure, no DOM, no React.

const PIPED_LINK_RE = /\[\[([^[\]|]+)\|([^[\]|]+)\]\]/g;
const SIMPLE_LINK_RE = /\[\[([^[\]|]+)\]\]/g;
const TEMPLATE_RE = /\{\{([^{}]*)\}\}/g;
const HTML_TAG_RE = /<[^<>]+>/g;
const HTML_ENTITY_NBSP_RE = /&nbsp;/gi;
const TRIPLE_OR_DOUBLE_QUOTE_RE = /''+/g;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const REF_RE = /<ref[\s\S]*?<\/ref>|<ref[^/]*\/>/gi;

/**
 * Special-case rendering for known wiki templates. Returns the cleaned
 * string, or null if we don't have a special-case (caller falls through
 * to the generic "drop the template" behavior).
 */
function renderTemplate(inner: string): string | null {
  const parts = inner.split('|').map((p) => p.trim());
  const name = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);

  // {{birth date|YYYY|MM|DD}} or {{birth date and age|YYYY|MM|DD|df=y}}
  if (name === 'birth date' || name === 'birth date and age' || name === 'birth-date' || name === 'birth-date and age') {
    const numericArgs = args.filter((a) => /^\d+$/.test(a));
    if (numericArgs.length >= 3) {
      const [y, m, d] = numericArgs;
      const month = parseInt(m, 10);
      const day = parseInt(d, 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(Date.UTC(parseInt(y, 10), month - 1, day));
        if (!Number.isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('en', {
            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
          }).format(date);
        }
      }
    }
    // Fall back to just the year if we can find one.
    const year = numericArgs.find((a) => /^(1[6-9]\d{2}|20\d{2})$/.test(a));
    return year ?? null;
  }

  // {{start date|YYYY|MM|DD}} / {{end date|YYYY|MM|DD}}
  if (name === 'start date' || name === 'end date' || name === 'start date and age') {
    const numericArgs = args.filter((a) => /^\d+$/.test(a));
    if (numericArgs.length >= 1) {
      const [y, m, d] = numericArgs;
      if (numericArgs.length >= 3 && m && d) {
        const date = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
        if (!Number.isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('en', {
            year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
          }).format(date);
        }
      }
      return y;
    }
    return null;
  }

  // {{nowrap|X}} → X
  if (name === 'nowrap' || name === 'noflag' || name === 'small') {
    return args.join(', ');
  }

  // {{plainlist | * a | * b}} or {{ubl|a|b|c}} → "a, b, c"
  if (name === 'plainlist' || name === 'plain list' || name === 'ubl' || name === 'flatlist' || name === 'flat list') {
    return args
      .map((a) => a.replace(/^\*\s*/, '').trim())
      .filter(Boolean)
      .join(', ');
  }

  // {{flag|Country}} → Country
  if (name === 'flag' || name === 'flagicon' || name === 'flagcountry') {
    return args[0] || null;
  }

  // {{convert|N|km}} → "N km"
  if (name === 'convert') {
    return args.slice(0, 2).join(' ');
  }

  // {{age|YYYY|MM|DD}} → just the years
  if (name === 'age') return null;

  return null;
}

/**
 * Resolve all {{templates}} in `value` to either their special-case
 * rendering or an empty string. Repeats until no templates remain so
 * nested templates are handled.
 */
function stripTemplates(value: string): string {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(TEMPLATE_RE, (_match, inner: string) => {
      const rendered = renderTemplate(inner);
      return rendered ?? '';
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Resolve [[piped links]] and [[simple links]] to their visible text.
 * Repeats until no links remain so nested links are handled.
 */
function stripLinks(value: string): string {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    const before = out;
    out = out.replace(PIPED_LINK_RE, (_match, _target, label) => label);
    out = out.replace(SIMPLE_LINK_RE, (_match, label) => label);
    if (out === before) break;
  }
  return out;
}

/**
 * Clean a raw MediaWiki infobox value to a display-ready string.
 *
 * Returns an empty string when the input is empty or only whitespace.
 * Returns null when the value can't be cleaned to anything useful (rare).
 */
export function cleanWikiText(raw: string | null | undefined): string {
  if (raw == null) return '';
  let value = String(raw);

  // Strip leading "| field = " noise that sometimes leaks through when the
  // infobox parser captures wrong (the leading pipe + key = is part of the
  // NEXT field's syntax, not this field's value).
  value = value.replace(/^\s*\|\s*[a-z_]+\s*=\s*/i, '');

  // Drop comments and <ref>...</ref> blocks before any other parsing.
  value = value.replace(COMMENT_RE, '');
  value = value.replace(REF_RE, '');

  // Replace <br /> with comma+space before stripping HTML tags so list-like
  // values stay readable.
  value = value.replace(/<br\s*\/?>/gi, ', ');

  // Strip HTML tags after handling <br>.
  value = value.replace(HTML_TAG_RE, '');

  // Resolve templates and links.
  value = stripTemplates(value);
  value = stripLinks(value);

  // HTML entities and italic/bold markers.
  value = value.replace(HTML_ENTITY_NBSP_RE, ' ');
  value = value.replace(TRIPLE_OR_DOUBLE_QUOTE_RE, '');

  // Collapse whitespace.
  value = value.replace(/\s+/g, ' ').trim();

  // Strip trailing commas/dashes left over from removed templates.
  value = value.replace(/^[,;\s-]+|[,;\s-]+$/g, '');

  return value;
}

/**
 * Convenience: clean an entire infobox object's values in one pass.
 * Returns a new object; never mutates the input.
 */
export function cleanInfoboxValues(infobox: Record<string, string> | null | undefined): Record<string, string> {
  if (!infobox) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(infobox)) {
    const cleaned = cleanWikiText(value);
    if (cleaned) out[key] = cleaned;
  }
  return out;
}
