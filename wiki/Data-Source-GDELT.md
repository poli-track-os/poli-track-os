# Data source: GDELT

Global event database.

## Upstream URL & license

- URL: <https://www.gdeltproject.org/>
- Daily exports: `http://data.gdeltproject.org/events/{YYYYMMDD}.export.CSV.zip`
- License: GDELT 1.0 is redistributable with attribution ("Source: The GDELT Project, https://www.gdeltproject.org/").

## What it provides

GDELT v1 publishes one zipped CSV per day with 58 tab-separated columns per row: a CAMEO-coded event type, two actors (names + country + sector tags), a date, a geo-located mention, and a URL back to the source article. Poli-Track treats GDELT as a coarse-grained "who did what where" fire-hose and matches rows to tracked politicians by full-name match.

## Ingestion script

[scripts/sync-gdelt.ts](../scripts/sync-gdelt.ts)

Streams the daily zip via the external `unzip` binary (also used by the Bundestag sync), then parses the 58-column TSV line by line with helpers in [src/lib/gdelt-helpers.ts](../src/lib/gdelt-helpers.ts).

```bash
node --experimental-strip-types scripts/sync-gdelt.ts --apply
node --experimental-strip-types scripts/sync-gdelt.ts --apply --date 20240315
```

Default date is "yesterday UTC".

## Tables populated

- `political_events` — matched rows as typed events (event_type derived from CAMEO code via `mapEventCodeToType`).
- `scrape_runs` — one row per run.

## Refresh cadence

GDELT publishes one export every 15 minutes; Poli-Track only ingests daily snapshots on demand.

## Known quirks / rate limits

- Name matching is whole-word ASCII-normalized — `matchesPolitician` in [gdelt-helpers.ts](../src/lib/gdelt-helpers.ts). Common names can produce false positives, which is why GDELT-sourced events carry a lower trust level than official-record events.
- The CAMEO code space is large and only loosely mapped to Poli-Track's `political_event_type` enum; unmapped codes fall into a generic bucket.
- The zip is ~30 MB per day and contains a single CSV — the script spawns `unzip` rather than pulling in a JS zip library.
- GDELT 2.0 (the richer GKG stream) is deliberately out of scope today.

## Attribution requirements

Credit "The GDELT Project" with a link to <https://www.gdeltproject.org/> on any public rendering of GDELT-derived rows.
