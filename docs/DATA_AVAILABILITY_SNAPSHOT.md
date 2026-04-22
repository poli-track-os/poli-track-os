# Data Availability Snapshot

Snapshot generated on 2026-04-15 from production Supabase using service-role queries.

## Core Table Counts

| Table | Rows |
|---|---:|
| `politicians` | 1,599 |
| `political_events` | 27,094 |
| `proposals` | 7,525 |
| `claims` | 3,530 |
| `politician_finances` | 718 |
| `politician_investments` | 0 |
| `lobby_organisations` | 30 |
| `lobby_spend` | 347 |
| `lobby_meetings` | 3,581 |

## Proposal Counts by `data_source`

| data_source | Rows |
|---|---:|
| `riksdag` | 2,000 |
| `sejm` | 1,860 |
| `parlamento_pt` | 1,000 |
| `oireachtas` | 1,000 |
| `bundestag_dip` | 696 |
| `congreso_es` | 421 |
| `eurlex` | 300 |
| `tweedekamer` | 200 |
| `assemblee_nationale` | 48 |

## Lobby-Specific Status

- Lobby organisations are present.
- Lobby spend history is present and non-empty.
- Lobby meetings are populated from LobbyFacts CSV exports.
- Most rows are Commission-side meetings and do not map to tracked politicians.
- Current mapped rows with non-null `politician_id`: 5.

## Important Interpretation Notes

- This is a point-in-time snapshot, not a continuously updated report.
- Some pipelines are intentionally capped by run parameters (`--max-pages`, `--max-orgs`) during iterative testing.
- Source availability and schema changes can shift counts without code changes.
