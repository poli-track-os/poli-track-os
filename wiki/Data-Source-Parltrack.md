# Data source: Parltrack

The single largest upstream for EU Parliament activity in Poli-Track.

## Upstream URL & license

- URL: <https://parltrack.org/dumps>
- License: Open Database License (ODbL) v1.0. Attribution goes to the Parltrack project; attribution copy lives in [INGESTION.md](https://github.com/poli-track-os/poli-track-os/blob/main/INGESTION.md) and in the frontend footer.

## What it provides

Parltrack publishes nightly zstd-compressed NDJSON dumps of the European Parliament's public data:

- **MEPs** — per-MEP identity records with committee assignments, group memberships, and a full party history.
- **Activities** — speeches, questions (written + oral), reports, opinions, amendments, motions for resolution, and more, with timestamps and URLs back to europarl.europa.eu.
- **Dossiers** — legislative files with status, rapporteurs, committees, and document references.
- **Votes** — roll-call votes on adopted dossiers.

This is the dataset that replaces the original `scrape-mep-reports` edge function for anything activity-related — it is structurally cleaner than scraping the EP site directly.

## Ingestion script

[scripts/sync-parltrack.ts](../scripts/sync-parltrack.ts)

Streams each dump through the external `zstd` binary into an NDJSON reader. By default the script runs both the MEP and activity passes; individual `--meps` / `--activities` flags let you run just one.

```bash
node --experimental-strip-types scripts/sync-parltrack.ts --apply
node --experimental-strip-types scripts/sync-parltrack.ts --apply --meps
node --experimental-strip-types scripts/sync-parltrack.ts --apply --activities
```

Dry-run (no `--apply`) prints what would be written.

## Tables populated

- `politicians` — MEP rows with party history extracted via `extractPartyHistory`. See [Data model](Data-Model).
- `political_events` — activities mapped to typed events (`speech`, `legislation_sponsored`, `public_statement`, …) via `buildEventRowFromActivity`.
- `proposals` — dossiers mapped via `buildProposalFromDossier`.
- `claims` — per-field provenance claims.
- `scrape_runs` — one row per script execution.

## Refresh cadence

Parltrack regenerates dumps daily. The Poli-Track ingester is typically rerun weekly through the same slot as the rest of the ingestion CI (see [Ingestion pipeline](Ingestion-Pipeline)).

## Known quirks / rate limits

- Dumps are large (hundreds of MB). You need the `zstd` binary on PATH; the script spawns it as a child process.
- Some activity entries do not carry a stable numeric ID, so dedup relies on `(politician_id, source_url, event_timestamp)`.
- The dump schema is stable but undocumented — fields can appear or disappear without notice. `parseParltrackLine` tolerates missing keys.
- Dossier → proposal mapping is one-way; Parltrack carries more state transitions than `proposals.status` currently represents.

## Attribution requirements

Any redistribution of Parltrack data must carry the ODbL v1.0 notice and a link back to <https://parltrack.org>. Poli-Track surfaces this in the footer and in each affected row's `source_url` field.
