// Pure helpers for GDELT v1 Events CSV ingestion.
//
// GDELT publishes a daily Events table covering global news events. Each row
// is a tab-separated record with 58 fixed columns documented at:
//   http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
//
// We only care about a handful of columns:
//   1   GLOBALEVENTID  (unique id)
//   2   SQLDATE        (YYYYMMDD)
//   ... (skipping)
//   7   Actor1Name     (named entity, uppercased, e.g. "ANGELA MERKEL")
//   17  Actor2Name
//   27  EventCode      (CAMEO event code, e.g. "043" = consult)
//   34  GoldsteinScale (numeric -10..10 cooperation/conflict scale)
//   ... (skipping)
//   53  AvgTone        (sentiment, -100..+100)
//   58  SOURCEURL      (the news article URL the event was extracted from)
//
// We filter to rows where either Actor1Name or Actor2Name matches a known
// politician (case-insensitive whole-word). Matching uses an in-memory set
// of normalized politician names that the caller supplies. To avoid false
// positives on common surnames ("Costa") we require BOTH first and last
// name tokens to appear in the actor string.

export interface GdeltEvent {
  globalEventId: string;
  sqlDate: string;            // YYYY-MM-DD
  actor1Name: string | null;
  actor2Name: string | null;
  eventCode: string | null;
  goldsteinScale: number | null;
  avgTone: number | null;
  sourceUrl: string | null;
}

export function parseGdeltLine(line: string): GdeltEvent | null {
  const cols = line.split('\t');
  if (cols.length < 58) return null;
  const sqlDate = cols[1]?.trim();
  if (!sqlDate || !/^\d{8}$/.test(sqlDate)) return null;
  return {
    globalEventId: cols[0]?.trim() || '',
    sqlDate: `${sqlDate.slice(0, 4)}-${sqlDate.slice(4, 6)}-${sqlDate.slice(6, 8)}`,
    actor1Name: cols[6]?.trim() || null,
    actor2Name: cols[16]?.trim() || null,
    eventCode: cols[26]?.trim() || null,
    goldsteinScale: parseFloatOrNull(cols[33]),
    avgTone: parseFloatOrNull(cols[52]),
    sourceUrl: cols[57]?.trim() || null,
  };
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// Normalize a name to the form GDELT uses: uppercase ASCII with spaces.
export function normalizeForGdeltMatch(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((t) => t.length >= 3);
}

// Return true if ALL non-trivial tokens of `politicianName` appear inside
// `actorString`. Whole-word, ASCII-folded, length >= 3.
export function matchesPolitician(actorString: string | null, politicianTokens: string[]): boolean {
  if (!actorString || politicianTokens.length === 0) return false;
  const folded = actorString.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  for (const token of politicianTokens) {
    // Whole-word match: bounded by non-letter or string ends.
    const re = new RegExp(`(?:^|[^A-Z])${token}(?:[^A-Z]|$)`);
    if (!re.test(folded)) return false;
  }
  return true;
}

// CAMEO event code → poli-track event_type mapping. Best-effort coarse
// bucketing; full CAMEO has ~300 codes.
export function mapEventCodeToType(code: string | null): 'media_appearance' | 'public_statement' | 'foreign_meeting' | 'speech' {
  if (!code) return 'media_appearance';
  // 04x = consult / discuss, 05x = engage in diplomatic cooperation
  if (/^04|^05/.test(code)) return 'foreign_meeting';
  // 01x = make public statement
  if (/^01/.test(code)) return 'public_statement';
  // 06x = engage in material cooperation, 07x = provide aid
  if (/^03/.test(code)) return 'speech';
  return 'media_appearance';
}
