import { describe, expect, it } from "vitest";
import {
  buildReportSourceUrl,
  parseReports,
  reportEventTimestamp,
  STABLE_UNKNOWN_TIMESTAMP,
} from "../../supabase/functions/scrape-mep-reports/parsers";

// Two adjacent report cards on a real EP main-activities/reports page.
// The dates of each card sit INSIDE its own block. The previous parser
// hunted within ±500 chars of the A-number — which on a packed page can
// reach into the previous card's date. Each test below pins one independent
// failure mode of that approach.

const TWO_REPORT_PAGE = `
<div>
  <h3>REPORT on the proposal for a regulation on widgets</h3>
  <div class="meta">
    <span>A10-0013/2026</span>
    <span>PE745.123</span>
    <span>JURI</span>
    <time>04-02-2026</time>
  </div>
</div>
<div>
  <h3>REPORT on a directive concerning industrial gizmos</h3>
  <div class="meta">
    <span>A10-0099/2025</span>
    <span>ITRE</span>
    <time>15-11-2025</time>
  </div>
</div>
`;

describe("parseReports — per-block", () => {
  it("returns one entry per REPORT h3", () => {
    const out = parseReports(TWO_REPORT_PAGE);
    expect(out).toHaveLength(2);
  });

  it("binds each date to its own report card (no ±500 char drift)", () => {
    const [first, second] = parseReports(TWO_REPORT_PAGE);
    expect(first.reportId).toBe("A10-0013/2026");
    expect(first.committee).toBe("JURI");
    expect(first.date).toBe("2026-02-04");

    expect(second.reportId).toBe("A10-0099/2025");
    expect(second.committee).toBe("ITRE");
    expect(second.date).toBe("2025-11-15");
  });

  it("does not crash when a card is missing the date", () => {
    const html = `
      <h3>REPORT on the proposal X</h3>
      <span>A10-0001/2026</span><span>JURI</span>
    `;
    const [r] = parseReports(html);
    expect(r.reportId).toBe("A10-0001/2026");
    expect(r.committee).toBe("JURI");
    expect(r.date).toBeNull();
  });

  it("returns an empty list when the page has no REPORT headers", () => {
    expect(parseReports("<h3>OPINION on something</h3>")).toEqual([]);
  });
});

describe("source URL + stable timestamp", () => {
  it("uses doceo URL when reportId present", () => {
    expect(buildReportSourceUrl("12345", "A10-0013/2026")).toBe(
      "https://www.europarl.europa.eu/doceo/document/A10-0013/2026_EN.html",
    );
  });

  it("falls back to the MEP activities page when reportId is null", () => {
    expect(buildReportSourceUrl("12345", null)).toBe(
      "https://www.europarl.europa.eu/meps/en/12345/main-activities/reports",
    );
  });

  it("returns a STABLE epoch timestamp when date is null (idempotency!)", () => {
    expect(reportEventTimestamp(null)).toBe(STABLE_UNKNOWN_TIMESTAMP);
    // Calling it again must return the SAME string, otherwise the unique
    // index `(politician_id, source_url, event_timestamp)` will not dedupe.
    expect(reportEventTimestamp(null)).toBe(reportEventTimestamp(null));
  });

  it("formats a known date as midnight UTC", () => {
    expect(reportEventTimestamp("2026-02-04")).toBe("2026-02-04T00:00:00Z");
  });
});
