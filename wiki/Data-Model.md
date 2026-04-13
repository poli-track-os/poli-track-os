# Data model

All data lives in a single Postgres schema (`public`). Row-Level Security is enabled on every table with a permissive `SELECT USING (true)` policy — anonymous reads are allowed; writes require the service-role key.

## Core tables

### `politicians`

The central entity. One row per tracked legislator.

| Column | Type | Source |
|---|---|---|
| `id` | `uuid` | generated |
| `external_id` | `text` | MEP numeric ID (EU Parliament rows) |
| `name` | `text` | upstream |
| `country_code` | `text` | ISO2 |
| `country_name` | `text` | upstream |
| `party_name` | `text` | EP group for MEPs |
| `party_abbreviation` | `text` | national party label |
| `role` | `text` | `Member of European Parliament`, `Member of Bundestag`, etc. |
| `jurisdiction` | `text` | `eu` / `federal` / `state` / `city` |
| `committees` | `text[]` | Wikipedia infobox (if present) |
| `photo_url` | `text` | EP portrait, or Wikipedia image if no portrait |
| `birth_year` | `int` | Wikipedia infobox |
| `in_office_since` | `date` | Wikipedia infobox `term_start` |
| `twitter_handle` | `text` | Wikipedia infobox |
| `wikipedia_url` | `text` | enrich-wikipedia |
| `wikipedia_summary` | `text` | enrich-wikipedia (~300 chars) |
| `biography` | `text` | enrich-wikipedia (~3000 chars) |
| `wikipedia_image_url` | `text` | enrich-wikipedia |
| `wikipedia_data` | `jsonb` | `{ title, description, infobox, coordinates, last_fetched }` |
| `enriched_at` | `timestamptz` | when Wikipedia enrichment last ran |
| `data_source` | `enum` | which ingester created the row |

### `political_events`

A git-log-style event stream per politician.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | generated |
| `politician_id` | `uuid` | FK → `politicians.id` |
| `event_type` | `enum` | `vote`, `public_statement`, `speech`, `committee_join`, ... |
| `title` | `text` | short headline |
| `description` | `text` | longer body |
| `source` | `enum` | `twitter`, `official_record`, `news`, `parliamentary_record`, ... |
| `source_url` | `text` | evidence link |
| `sentiment` | `enum` | `positive` / `negative` / `neutral` (only on RSS-derived events) |
| `entities` | `text[]` | hashtags + mentions |
| `raw_data` | `jsonb` | upstream payload snapshot |
| `event_timestamp` | `timestamptz` | when the event occurred upstream |

### `proposals`

Parliamentary proposals (bills, referendums, initiatives, counter-proposals).

| Column | Type | Notes |
|---|---|---|
| `title` / `official_title` | `text` | user-facing + official |
| `status` | `text` | `committee`, `plenary`, `adopted`, `rejected`, `withdrawn`, etc. |
| `proposal_type` | `text` | `bill`, `referendum`, ... |
| `country_code` / `country_name` | `text` | jurisdiction identity |
| `vote_date` / `submitted_date` | `date` | lifecycle |
| `sponsors[]` / `affected_laws[]` | `text[]` | freeform lists |
| `policy_area` | `text` | e.g. `energy`, `health` |
| `source_url` | `text` | evidence link |

### Per-politician extensions

| Table | Purpose |
|---|---|
| `politician_finances` | one row per `(politician_id, declaration_year)` with salary, assets, debts |
| `politician_investments` | individual stock/company holdings |
| `politician_positions` | political-compass axes + policy priorities + ideology label |
| `politician_associations` | self-referential `(politician_id, associate_id)` with `relationship_type` and `strength` |

### Operational tables

| Table | Purpose |
|---|---|
| `data_sources` | one row per upstream source; tracks `last_synced_at` and `total_records` |
| `scrape_runs` | one row per edge function execution; tracks `status`, `records_fetched/created/updated`, and `error_message` |

## Enum types

- **`political_event_type`** — 21 values including `vote`, `speech`, `committee_join`, `committee_leave`, `election`, `appointment`, `resignation`, `scandal`, `policy_change`, `party_switch`, `legislation_sponsored`, `foreign_meeting`, `lobbying_meeting`, `corporate_event`, `financial_disclosure`, `social_media`, `travel`, `donation_received`, `public_statement`, `court_case`, `media_appearance`.
- **`data_source_type`** — `eu_parliament`, `un_digital_library`, `twitter`, `official_record`, `news`, `financial_filing`, `parliamentary_record`, `court_filing`, `lobby_register`, `wikipedia`.
- **`sentiment_type`** — `positive`, `negative`, `neutral`.

## Migrations

All schema changes live under [`supabase/migrations/`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/tree/main/supabase/migrations) and are applied in timestamp order. Generated TypeScript types are in [`src/integrations/supabase/types.ts`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/src/integrations/supabase/types.ts).
