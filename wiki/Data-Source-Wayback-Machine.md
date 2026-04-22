# Data source: Wayback Machine

Internet Archive CDX API for historical Twitter archives.

## Upstream URL & license

- URL: <https://web.archive.org>
- CDX API: `https://web.archive.org/cdx/search/cdx`
- License: Internet Archive Terms of Use — read-only re-use is permitted for research and journalism with attribution.

## What it provides

The Internet Archive's Wayback Machine CDX API lets you enumerate snapshots of a given URL in a date range. Poli-Track uses it to reconstruct historical twitter.com profile timelines when a politician has since deleted, locked, or lost their account. For each snapshot we parse the archived HTML and extract individual tweets (text, timestamp) plus the capture date.

This is an operator tool — you target a specific handle and a date range, not a bulk fleet.

## Ingestion script

[scripts/import-archive-twitter.ts](../scripts/import-archive-twitter.ts)

```bash
node --experimental-strip-types scripts/import-archive-twitter.ts \
  --handle janeexample \
  --politician-id 00000000-0000-0000-0000-000000000000 \
  --apply \
  --from 20140101 --to 20221231 --max-snapshots 10
```

Parsing helpers live in [src/lib/wayback-helpers.ts](../src/lib/wayback-helpers.ts) (`parseCdxResponse`, `extractTweetsFromHtml`, `extractPostedAt`).

## Tables populated

- `raw_tweets` — archived tweet text with capture timestamps.
- `scrape_runs` — one row per run.

## Refresh cadence

Operator-driven. Never scheduled — runs are kicked off by hand on a per-politician basis, typically as part of investigating a specific handle.

## Known quirks / rate limits

- The CDX API is slow and lightly rate-limited; one snapshot per HTTP call, so even 10 snapshots can take several minutes.
- Archived HTML has changed shape over the years — the extractor has to cover multiple historical Twitter front-ends. Some older snapshots parse partially or not at all.
- Snapshots are deduplicated by exact capture timestamp; near-identical pages from adjacent minutes both land in `raw_tweets`.
- `--max-snapshots` is a courtesy cap to avoid hammering the Archive during exploratory runs.

## Attribution requirements

Credit "Internet Archive / Wayback Machine" with a link to the specific snapshot URL. Observe the Internet Archive's [terms of use](https://archive.org/about/terms.php) for research re-use.
