import { describe, expect, it } from "vitest";
import {
  extractPostedAt,
  extractTweetsFromHtml,
  parseCdxResponse,
} from "../lib/wayback-helpers";

describe("parseCdxResponse", () => {
  it("parses a CDX JSON response into snapshots", () => {
    const cdxJson = [
      ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
      ["com,twitter)/janeexample", "20191101120000", "https://twitter.com/janeexample", "text/html", "200", "abc", "1234"],
      ["com,twitter)/janeexample", "20210315080000", "https://twitter.com/janeexample", "text/html", "200", "def", "5678"],
    ];
    const snapshots = parseCdxResponse(cdxJson);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].timestamp).toBe("20191101120000");
    expect(snapshots[0].archiveUrl).toBe("https://web.archive.org/web/20191101120000/https://twitter.com/janeexample");
  });

  it("returns empty array for malformed input", () => {
    expect(parseCdxResponse(null)).toEqual([]);
    expect(parseCdxResponse([])).toEqual([]);
    expect(parseCdxResponse("not an array")).toEqual([]);
  });
});

describe("extractTweetsFromHtml — Nitter format", () => {
  const NITTER_HTML = `
<div class="timeline">
  <div class="timeline-item">
    <a class="tweet-link" href="/janeexample/status/1234567890#m">link</a>
    <div class="tweet-content media-body">Voted YES on the Digital Services Act today. Big day for digital rights.</div>
  </div>
  <div class="timeline-item">
    <a class="tweet-link" href="/janeexample/status/9876543210#m">link</a>
    <div class="tweet-content media-body">Met with civil society on AI Act amendments.</div>
  </div>
</div>
`;

  it("extracts tweet id + body pairs", () => {
    const tweets = extractTweetsFromHtml(NITTER_HTML);
    expect(tweets).toHaveLength(2);
    expect(tweets[0].tweetId).toBe("1234567890");
    expect(tweets[0].body).toContain("Digital Services Act");
    expect(tweets[1].tweetId).toBe("9876543210");
    expect(tweets[1].body).toContain("AI Act");
  });

  it("ignores tweet ids with no body", () => {
    const html = '<a href="/foo/status/111">x</a>';
    expect(extractTweetsFromHtml(html)).toEqual([]);
  });
});

describe("extractPostedAt", () => {
  it("parses a title attribute on the tweet date anchor", () => {
    // Use an RFC-2822 / Date.parse-compatible format. Real Nitter uses
    // "Mon, 13 Jan 2024 14:30:00 UTC".
    const html = '<a href="/janeexample/status/1234567890#m" title="Mon, 13 Jan 2024 14:30:00 UTC">date</a>';
    const ts = extractPostedAt(html, "1234567890");
    expect(ts).not.toBeNull();
    expect(new Date(ts!).toISOString()).toMatch(/2024-01-13/);
  });

  it("returns null when no anchor matches", () => {
    expect(extractPostedAt("<html></html>", "1234567890")).toBeNull();
  });

  it("returns null when the title is not a parseable date", () => {
    const html = '<a href="/janeexample/status/1234567890#m" title="not a date">date</a>';
    expect(extractPostedAt(html, "1234567890")).toBeNull();
  });
});
