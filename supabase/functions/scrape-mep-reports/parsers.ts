// Pure parsers for EP MEP "main-activities/reports" pages. Kept third-party-
// free so this module loads under both Deno (the edge runtime) and Node
// (vitest).
//
// The earlier parser collected all <h3> titles in one pass and all A-number
// metas in another pass, then zipped them by index. Two things broke that:
//   1. If the page's <h3> count and A-number count drift apart for any
//      reason (extra promo card, missing committee line), every subsequent
//      row gets misattributed.
//   2. The date hunt used a ±500 char window around the A-number, which
//      can cross into the previous report when two cards are tightly
//      packed.
//
// The fix: walk the document one report at a time. For each <h3>REPORT...</h3>
// header, treat the slice from the end of that header to the start of the
// next REPORT header (or end-of-document) as ITS block, and pull the report
// id, committee, and date from inside that slice only.

export interface ReportEntry {
  title: string;
  reportId: string | null;
  committee: string | null;
  date: string | null;
}

interface HeaderMatch {
  blockStart: number;
  blockEndHint: number;
  title: string;
}

export function parseReports(html: string): ReportEntry[] {
  const headerRe = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const headers: HeaderMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(html))) {
    const title = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/^REPORT\b/i.test(title)) continue;
    headers.push({
      blockStart: m.index + m[0].length,
      blockEndHint: m.index, // refined below
      title,
    });
  }
  // Each header's block ends where the next REPORT header begins.
  for (let i = 0; i < headers.length; i++) {
    headers[i].blockEndHint = i + 1 < headers.length
      ? headers[i + 1].blockEndHint
      : html.length;
  }

  const reports: ReportEntry[] = [];
  for (const header of headers) {
    const block = html.slice(header.blockStart, header.blockEndHint);
    const flat = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Within this report's block, the metadata appears as
    //   "A10-0013/2026  PE745.123  JURI  04-02-2026"
    // The PE reference is optional; the committee short code is uppercase
    // and 3-6 letters.
    const idMatch = flat.match(/\b(A\d+-\d{4}\/\d{4})\s+(?:PE[\w.-]+\s+)?([A-Z]{3,6})\b/);
    const dateMatch = flat.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);

    reports.push({
      title: header.title,
      reportId: idMatch?.[1] ?? null,
      committee: idMatch?.[2] ?? null,
      date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
    });
  }

  return reports;
}

export function buildReportSourceUrl(externalId: string, reportId: string | null): string {
  return reportId
    ? `https://www.europarl.europa.eu/doceo/document/${reportId}_EN.html`
    : `https://www.europarl.europa.eu/meps/en/${externalId}/main-activities/reports`;
}

// When the report has no parseable filing date we still need a STABLE
// timestamp so the partial unique index `(politician_id, source_url,
// event_timestamp)` deduplicates on rerun. Wall-clock fallback would create
// a fresh row on every cron invocation. Use the Unix epoch as a sentinel
// "unknown date" — it is stable, sorts first in the timeline, and is
// trivially recognizable by humans inspecting the row.
export const STABLE_UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00Z";

export function reportEventTimestamp(date: string | null): string {
  return date ? `${date}T00:00:00Z` : STABLE_UNKNOWN_TIMESTAMP;
}
