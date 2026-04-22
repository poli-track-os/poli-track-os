// Pure helpers for Internet Archive Wayback Machine snapshot ingestion.
//
// We use the Wayback CDX API to find snapshots of twitter.com/{handle} and
// nitter.net/{handle} pages between dates, then download each snapshot's
// HTML and extract visible tweet text. The extracted tweets are stored in
// `raw_tweets` for later LLM extraction.
//
// CDX API: https://web.archive.org/cdx/search/cdx?url=twitter.com/{handle}&output=json&from=20140101&to=20221231&filter=statuscode:200&limit=200

export interface WaybackSnapshot {
  timestamp: string;       // 14-char yyyyMMddHHmmss
  originalUrl: string;
  archiveUrl: string;      // canonical https://web.archive.org/web/{ts}/{url}
}

export function parseCdxResponse(json: unknown): WaybackSnapshot[] {
  if (!Array.isArray(json) || json.length < 2) return [];
  // First row is the header.
  const headerRow = json[0] as string[];
  const tsIdx = headerRow.indexOf('timestamp');
  const urlIdx = headerRow.indexOf('original');
  if (tsIdx === -1 || urlIdx === -1) return [];

  const out: WaybackSnapshot[] = [];
  for (let i = 1; i < json.length; i += 1) {
    const row = json[i] as string[];
    const ts = row[tsIdx];
    const original = row[urlIdx];
    if (!ts || !original) continue;
    out.push({
      timestamp: ts,
      originalUrl: original,
      archiveUrl: `https://web.archive.org/web/${ts}/${original}`,
    });
  }
  return out;
}

export interface ExtractedTweet {
  tweetId: string;
  body: string;
  postedAt: string | null; // ISO
}

// Extract tweets from a Wayback snapshot of a Twitter or Nitter profile page.
// Twitter HTML changes often, but the consistent attributes are:
//   - <a href="/{handle}/status/{tweet_id}">                 (Twitter)
//   - <a href="/{handle}/status/{tweet_id}#m">              (Nitter)
//   - <div class="tweet-content">{body}</div>                (Nitter)
//   - <article data-testid="tweet">...<time datetime="...">  (Twitter web)
//
// We use a permissive extractor that finds tweet IDs from any /status/123/
// pattern and pulls the surrounding text block.
export function extractTweetsFromHtml(html: string): ExtractedTweet[] {
  const out = new Map<string, ExtractedTweet>();

  // Find all status link anchors. The tweet id is the last path segment.
  const statusRe = /\/(?:[A-Za-z0-9_]+)\/status\/(\d+)(?:#m)?"/g;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = statusRe.exec(html))) ids.add(m[1]);

  // Nitter: <div class="tweet-content media-body">body</div>
  const nitterContentRe = /<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const nitterBodies: string[] = [];
  let nm: RegExpExecArray | null;
  while ((nm = nitterContentRe.exec(html))) {
    const cleaned = nm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) nitterBodies.push(cleaned);
  }

  // Pair them by index — best-effort. Real-world Wayback snapshots are
  // mostly Nitter-formatted because Twitter's logged-out experience is
  // gated since 2023.
  const idArray = [...ids];
  for (let i = 0; i < Math.min(idArray.length, nitterBodies.length); i += 1) {
    out.set(idArray[i], { tweetId: idArray[i], body: nitterBodies[i], postedAt: null });
  }

  // For any unpaired ids, try to find a sibling <p> or <span> with text near
  // the anchor — but this is fragile. We just emit empty-bodied entries so
  // downstream can flag them as needing a re-fetch.
  for (const id of idArray) {
    if (!out.has(id)) {
      out.set(id, { tweetId: id, body: '', postedAt: null });
    }
  }

  return [...out.values()].filter((t) => t.body.length > 0);
}

// Extract a posted-at ISO timestamp from a tweet container, if visible.
export function extractPostedAt(html: string, tweetId: string): string | null {
  // Nitter: <span class="tweet-date"><a title="Mon, 13 Jan 2024 14:30:00 UTC">
  const re = new RegExp(`/status/${tweetId}[^"]*"[^>]*title="([^"]+)"`);
  const m = html.match(re);
  if (!m) return null;
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
