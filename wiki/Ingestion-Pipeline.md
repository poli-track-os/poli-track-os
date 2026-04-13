# Ingestion pipeline

Seven Supabase edge functions handle everything that moves data into Poli-Track. They live under [`supabase/functions/`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/tree/main/supabase/functions) and are scheduled by [`.github/workflows/ingest.yml`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/.github/workflows/ingest.yml).

> For a byte-level breakdown — every field, every regex, every table write — see [INGESTION.md](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/INGESTION.md).

## The functions

| Function | Source | Target | Chains to |
|---|---|---|---|
| `scrape-eu-parliament` | `europarl.europa.eu/meps/en/full-list/xml` | `politicians` | `enrich-wikipedia` |
| `scrape-national-parliament` | Wikipedia category pages for 22 EU parliaments | `politicians` | `enrich-wikipedia` |
| `enrich-wikipedia` | Wikipedia REST + Action API | `politicians` (update) | — |
| `scrape-twitter` | EU Commission + Parliament press RSS | `political_events` | — |
| `scrape-un-votes` | UN Digital Library voting records | `political_events` | — |
| `seed-positions` | Party-family mapping (local table) | `politician_positions` | — |
| `seed-associations` | Shared party / committee joins | `politician_associations` | — |

Every function writes a `scrape_runs` row at start (`status='running'`) and updates it on completion or failure.

## Scheduled execution

`.github/workflows/ingest.yml` runs weekly (Mondays 03:00 UTC) and hits every ingester via `curl` using repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It also supports manual runs with `workflow_dispatch` and a per-function target selector.

## Running a single function by hand

```bash
# Scrape MEPs (call until has_more=false)
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-eu-parliament" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offset": 0, "batchSize": 200}'

# Scrape one national parliament
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-national-parliament" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"countryCode": "DE", "batchSize": 100, "offset": 0}'

# Backfill Wikipedia enrichment
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/enrich-wikipedia" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"batchSize": 50}'

# Pull EU press RSS
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-twitter" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -d '{}'

# Pull UN GA voting records
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-un-votes" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -d '{}'

# Seed per-politician compass positions from party family
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/seed-positions" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"batchSize": 500}'

# Seed associations from shared party + committee
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/seed-associations" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -d '{}'
```

## Observability

Every run produces a row in `scrape_runs`:

```sql
select source_type, status, records_fetched, records_created, records_updated,
       error_message, started_at, completed_at
from scrape_runs
order by started_at desc
limit 20;
```

`data_sources.last_synced_at` is kept up to date per source so the UI can display "last refresh" timestamps.

## Caveats

- **No per-row transactions.** A crash mid-batch leaves partial state. The run row will be marked `failed` with the error message.
- **Wikipedia disambiguation is best-effort.** Common names can occasionally resolve to the wrong article; see [INGESTION.md](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/INGESTION.md) for the guardrails.
- **`political_events` has no idempotency key.** Re-running `scrape-twitter` or `scrape-un-votes` without additional dedupe will insert duplicate event rows. Scheduling is spaced to make this unlikely in practice.
