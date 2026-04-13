# Data Ingestion Pipeline — Exhaustive Analysis

> Scope: every source, transform, table, and consumer path that moves external political data into Poli-Track and out to the UI.
>
> Everything below is derived from the code currently in this repo (`supabase/functions/*`, `supabase/migrations/*`, `src/hooks/*`, `src/integrations/supabase/*`). Nothing is inferred from documentation or external assumptions.

---

## Table of Contents

1. [High-Level Topology](#1-high-level-topology)
2. [Ingestion Surface: Edge Functions Plus Official-Roster Sync](#2-ingestion-surface-edge-functions-plus-official-roster-sync)
3. [Source-by-Source Deep Dive](#3-source-by-source-deep-dive)
   - 3.1 [`scrape-eu-parliament`](#31-scrape-eu-parliament)
   - 3.2 [`scrape-national-parliament`](#32-scrape-national-parliament)
   - 3.3 [`enrich-wikipedia`](#33-enrich-wikipedia)
   - 3.4 [`scrape-twitter`](#34-scrape-twitter-misnamed)
   - 3.5 [`scrape-un-votes`](#35-scrape-un-votes)
4. [Database Schema: Where Data Lands](#4-database-schema-where-data-lands)
5. [Field-Level Provenance Matrix](#5-field-level-provenance-matrix)
6. [Run Logging & Observability](#6-run-logging--observability)
7. [Chaining & Orchestration](#7-chaining--orchestration)
8. [Consumer Path: From Tables to UI](#8-consumer-path-from-tables-to-ui)
9. [Authoritative Risk Register](#9-authoritative-risk-register)
10. [What Is NOT Ingested (Dead/Manual Paths)](#10-what-is-not-ingested-deadmanual-paths)

---

## 1. High-Level Topology

```
                            EXTERNAL SOURCES
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │  europarl.europa.eu       en.wikipedia.org         ec.europa.eu   │
  │  (MEP XML directory)      (REST + Action API)      (press RSS)    │
  │         │                       │                       │         │
  │         │                       │                       │         │
  │  digitallibrary.un.org    europarl.europa.eu/rss  (no API keys)   │
  │  (HTML search page)       (top-stories feed)                       │
  │         │                       │                                  │
  └─────────┼───────────────────────┼──────────────────────────────────┘
            │                       │
            v                       v
  ┌─────────────────────────────────────────────────────────────────────┐
  │                    SUPABASE EDGE FUNCTIONS (Deno)                   │
  │                                                                     │
  │  scrape-eu-parliament  ──┐                                          │
  │  scrape-nat-parliament ──┼──> enrich-wikipedia (chained)            │
  │  scrape-twitter          │                                          │
  │  scrape-un-votes         │                                          │
  │                          │                                          │
  │  All functions run with SUPABASE_SERVICE_ROLE_KEY and bypass RLS.   │
  │  No public trigger from frontend code — invoked manually or by     │
  │  an external scheduler (not present in this repo).                  │
  └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      v
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        SUPABASE POSTGRES                             │
  │                                                                     │
  │  politicians   ◄── eu_parliament / parliamentary_record / wiki       │
  │  political_events ◄── twitter / un_digital_library                   │
  │  data_sources  ◄── last_synced_at / total_records counters           │
  │  scrape_runs   ◄── one row per function execution                    │
  │                                                                     │
  │  politician_finances       (schema present, no ingester)            │
  │  politician_investments    (schema present, no ingester)            │
  │  politician_positions      (schema present, no ingester)            │
  │  politician_associations   (schema present, no ingester)            │
  │  proposals                 (schema present, no ingester)            │
  │                                                                     │
  │  RLS: public SELECT on all tables.                                  │
  └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      │  anon key
                                      v
  ┌─────────────────────────────────────────────────────────────────────┐
  │                       FRONTEND (React SPA)                           │
  │                                                                     │
  │  TanStack Query hooks in src/hooks/use-politicians.ts              │
  │  and src/hooks/use-proposals.ts translate rows → Actor / DbProposal │
  │  view models consumed by pages.                                     │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ingestion Surface: Edge Functions Plus Official-Roster Sync

The repo now has two ingestion execution paths:

1. Supabase edge functions under [`supabase/functions/`](./supabase/functions/) for EU, Wikipedia, UN, and derived refresh jobs.
2. A Node-based official roster sync under [`scripts/sync-official-rosters.ts`](./scripts/sync-official-rosters.ts) for country-specific government/parliament sources that are awkward to consume from Deno edge functions, such as the Bundestag XML ZIP feed.

The official roster sync writes directly to `politicians` using the same service-role credentials as the other maintenance scripts. It records run-level status in `scrape_runs` and field-level provenance in `politicians.source_attribution`.

### Current Official Roster Registry

The official roster sync currently has country-specific adapters for:

| Country | Upstream source | Why this source is used | Stored provenance |
|---|---|---|---|
| `PT` | Assembleia da Republica open-data registry under `DARegistoBiografico.aspx` plus deputy biography pages | Official legislature registry with stable deputy IDs and parliamentary display names | `_official_record.record_id`, `source_url`, `dataset_url`, `alternate_names`, `constituency`, per-field source blocks |
| `DE` | Bundestag open-data ZIP `MdB-Stammdaten.zip` | Official member dataset with current Wahlperiode and mandate dates | `_official_record.record_id`, `source_url`, `dataset_url`, `constituency`, per-field source blocks |

`politicians.source_attribution` is the contract for "which source filled which field". The sync stores one `_official_record` summary block for the upstream row plus field-level entries such as `name`, `party_name`, `party_abbreviation`, `external_id`, and `source_url`, each carrying the fetch timestamp and upstream URLs that supplied that value.

All ingestion code lives in [`supabase/functions/`](./supabase/functions/). Each function is a self-contained Deno HTTP handler that:

1. Reads request body for batching parameters.
2. Instantiates a service-role Supabase client from env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Writes a `scrape_runs` row with `status = 'running'`.
4. Fetches upstream data (no authentication, no API keys).
5. Upserts or inserts rows into domain tables.
6. Updates the `scrape_runs` row to `completed` or `failed`.
7. Optionally updates `data_sources.last_synced_at` / `total_records`.
8. Returns a JSON summary over CORS.

### Function Inventory

| Function | File | Upstream Endpoint | Target Table(s) | Auth | Chained Call |
|---|---|---|---|---|---|
| `scrape-eu-parliament` | [functions/scrape-eu-parliament/index.ts](./supabase/functions/scrape-eu-parliament/index.ts) | `europarl.europa.eu/meps/en/full-list/xml` | `politicians` | none | → `enrich-wikipedia` on create |
| `scrape-national-parliament` | [functions/scrape-national-parliament/index.ts](./supabase/functions/scrape-national-parliament/index.ts) | `en.wikipedia.org/w/api.php` (categorymembers) | `politicians` | none | → `enrich-wikipedia` on create |
| `enrich-wikipedia` | [functions/enrich-wikipedia/index.ts](./supabase/functions/enrich-wikipedia/index.ts) | `en.wikipedia.org/api/rest_v1/page/summary` + `en.wikipedia.org/w/api.php` | `politicians` (update only) | none | terminal |
| `scrape-twitter` | [functions/scrape-twitter/index.ts](./supabase/functions/scrape-twitter/index.ts) | EU Commission press RSS + EP top-stories RSS | `political_events` | none | terminal |
| `scrape-un-votes` | [functions/scrape-un-votes/index.ts](./supabase/functions/scrape-un-votes/index.ts) | `digitallibrary.un.org/search` | `political_events` | none | terminal |

### Shared Hard Constraints

```
Request timeouts:       8–15s per upstream fetch (AbortSignal.timeout)
Batch sizes:            capped inside each function (e.g. EU parl: ≤200, Wiki: ≤50)
Rate limiting:          200–300ms setTimeout between Wikipedia calls only
Retries:                none — single attempt per upstream call
Idempotency:            only eu-parliament checks for existing external_id;
                        national-parliament checks by (name, country_code);
                        enrich-wikipedia filters on enriched_at IS NULL.
Transactionality:       none — partial-batch writes are possible on failure.
Backpressure:           manual — client must paginate via `offset` / `next_offset`.
```

### Trigger Mechanism

**There is no scheduler in this repo.** There is no cron file, no GitHub Action that calls these functions, no frontend code that invokes them. A grep for `.functions.invoke(` in `src/` returns zero matches. The functions can only be triggered by:

- Manual HTTP POST from the Supabase dashboard / `curl`.
- An external scheduler (Lovable console, Supabase pg_cron, or an off-repo cron job) that is not version-controlled here.
- A chained call from `scrape-eu-parliament` or `scrape-national-parliament` to `enrich-wikipedia`.

---

## 3. Source-by-Source Deep Dive

### 3.1 `scrape-eu-parliament`

**Source:** `https://www.europarl.europa.eu/meps/en/full-list/xml`
**Record type:** All currently-seated Members of the European Parliament (~718 entries).
**Trigger body:**
```json
{ "offset": 0, "batchSize": 100 }
```

#### Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. INSERT scrape_runs (source_type='eu_parliament',        │
│                          status='running')                   │
├─────────────────────────────────────────────────────────────┤
│  2. GET europarl.europa.eu/meps/en/full-list/xml  (15s TO)  │
├─────────────────────────────────────────────────────────────┤
│  3. parseXmlMeps(xml)                                        │
│     — split on "</mep>"                                      │
│     — regex-extract <fullName>, <country>, <politicalGroup>,│
│       <nationalPoliticalGroup>, <id>                         │
│     — NOT a real XML parser; regex-based, fragile            │
├─────────────────────────────────────────────────────────────┤
│  4. slice(offset, offset + batchSize)                        │
├─────────────────────────────────────────────────────────────┤
│  5. For each MEP:                                            │
│     a. map mep.country → ISO2 via COUNTRY_CODES table       │
│        (27 EU members hardcoded; fallback "EU")              │
│     b. SELECT id FROM politicians WHERE external_id = mep.id│
│     c. if exists → UPDATE                                    │
│        else     → INSERT                                     │
│     d. no error handling for per-row failures                │
├─────────────────────────────────────────────────────────────┤
│  6. UPDATE scrape_runs SET status='completed',              │
│     records_fetched = allMeps.length,                        │
│     records_created, records_updated                        │
├─────────────────────────────────────────────────────────────┤
│  7. UPDATE data_sources SET last_synced_at, total_records   │
│     WHERE source_type='eu_parliament'                        │
├─────────────────────────────────────────────────────────────┤
│  8. If created > 0: POST /functions/v1/enrich-wikipedia     │
│     with { batchSize: min(created, 15) }                     │
│     — fire-and-forget (25s timeout, non-blocking)            │
├─────────────────────────────────────────────────────────────┤
│  9. Return { total_meps, batch_processed, created,          │
│              updated, next_offset, has_more,                 │
│              enrichment_triggered }                          │
└─────────────────────────────────────────────────────────────┘
```

#### Field Mapping (MEP → `politicians` row)

| XML field | Column | Notes |
|---|---|---|
| `<id>` | `external_id` | MEP numeric ID, also suffix of portrait URL |
| `<fullName>` | `name` | No normalization |
| `<country>` | `country_name` | Raw string, e.g. `"Germany"` |
| (lookup) | `country_code` | From `COUNTRY_CODES[mep.country]`, fallback `"EU"` |
| (constant) | `role` | `"Member of European Parliament"` |
| (constant) | `jurisdiction` | `"eu"` |
| (constant) | `continent` | `"Europe"` |
| `<politicalGroup>` | `party_name` | EP group, e.g. `"Group of the European People's Party"` |
| `<nationalPoliticalGroup>` | `party_abbreviation` | National party label, NOT an abbreviation despite column name |
| (constant) | `data_source` | `"eu_parliament"` |
| (derived) | `source_url` | `https://www.europarl.europa.eu/meps/en/${id}` |
| (derived) | `photo_url` | `https://www.europarl.europa.eu/mepphoto/${id}.jpg` |

All other politician columns (`birth_year`, `twitter_handle`, `in_office_since`, `committees`, `wikipedia_*`, `biography`, `net_worth`, `top_donors`) are left untouched — they become the job of `enrich-wikipedia` or remain NULL.

#### Country Code Mapping Table

```
AT Austria    BE Belgium    BG Bulgaria   HR Croatia
CY Cyprus     CZ Czechia    DK Denmark    EE Estonia
FI Finland    FR France     DE Germany    GR Greece
HU Hungary    IE Ireland    IT Italy      LV Latvia
LT Lithuania  LU Luxembourg MT Malta      NL Netherlands
PL Poland     PT Portugal   RO Romania    SK Slovakia
SI Slovenia   ES Spain      SE Sweden
```

Note: `"Czech Republic"` and `"Czechia"` both resolve to `CZ`. No mapping exists for UK, Norway, Switzerland, etc. — any unmapped country becomes `"EU"`.

---

### 3.2 `scrape-national-parliament`

**Source:** Wikipedia Category API — `en.wikipedia.org/w/api.php?action=query&list=categorymembers`
**Record type:** Members of 22 hardcoded national parliaments, one country per invocation.
**Trigger body:**
```json
{ "countryCode": "DE", "batchSize": 100, "offset": 0 }
```

#### Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. Validate countryCode against PARLIAMENT_CONFIG (22 EU)  │
│     — returns 400 with `supported` list if unknown          │
├─────────────────────────────────────────────────────────────┤
│  2. INSERT scrape_runs (source_type='parliamentary_record') │
├─────────────────────────────────────────────────────────────┤
│  3. For each category in config.categories:                 │
│     getCategoryMembers(category):                            │
│       — paginate via cmcontinue (max 10 pages × 500 = 5000) │
│       — filter out "List of", "Category:", "*election*"     │
│       — returns list of Wikipedia page titles                │
│     concat + dedupe via Set                                 │
├─────────────────────────────────────────────────────────────┤
│  4. batch = allMembers.slice(offset, offset + batchSize)    │
├─────────────────────────────────────────────────────────────┤
│  5. SELECT name FROM politicians WHERE country_code=cc     │
│     → existingNames Set for dedupe by NAME (not wiki title)│
├─────────────────────────────────────────────────────────────┤
│  6. INSERT politicians for each new member:                 │
│     50 rows per INSERT chunk                                │
│     (no ON CONFLICT — duplicate names WILL collide if       │
│     another country inserts same name)                      │
├─────────────────────────────────────────────────────────────┤
│  7. UPDATE scrape_runs → completed                          │
├─────────────────────────────────────────────────────────────┤
│  8. If created > 0: POST enrich-wikipedia fire-and-forget   │
├─────────────────────────────────────────────────────────────┤
│  9. Return batch summary + next_offset                      │
└─────────────────────────────────────────────────────────────┘
```

#### The 22 Hardcoded Parliament Configs

| Code | Country | Parliament | Wikipedia Category | Role assigned |
|---|---|---|---|---|
| PT | Portugal | Assembleia da República | `Members of the Assembly of the Republic (Portugal)` + `Portuguese politicians` | `Member of Parliament` |
| DE | Germany | Bundestag | `Members of the Bundestag 2021–2025` | `Member of Bundestag` |
| FR | France | Assemblée nationale | `Deputies of the 17th National Assembly of the French Fifth Republic` | `Member of National Assembly` |
| IT | Italy | Parlamento italiano | `Deputies of Legislature XIX of Italy` + `Senators of Legislature XIX of Italy` | `Member of Parliament` |
| ES | Spain | Congreso de los Diputados | `Members of the 15th Congress of Deputies (Spain)` | `Member of Congress` |
| PL | Poland | Sejm | `Members of the Polish Sejm 2023–2027` | `Member of Sejm` |
| NL | Netherlands | Tweede Kamer | `Dutch MPs 2025–present` | `Member of House of Representatives` |
| BE | Belgium | Chambre des représentants | `Members of the Belgian Federal Parliament` | `Member of Federal Parliament` |
| CZ | Czechia | Poslanecká sněmovna | `Members of the Chamber of Deputies of the Czech Republic (2021–2025)` | `Member of Chamber of Deputies` |
| GR | Greece | Hellenic Parliament | `Greek MPs 2023–` | `Member of Hellenic Parliament` |
| SE | Sweden | Riksdag | `Members of the Riksdag 2022–2026` | `Member of Riksdag` |
| HU | Hungary | Országgyűlés | `Members of the National Assembly of Hungary (2022–2026)` | `Member of National Assembly` |
| AT | Austria | Nationalrat | `Members of the 28th National Council (Austria)` | `Member of National Council` |
| BG | Bulgaria | National Assembly | `Members of the National Assembly (Bulgaria)` | `Member of National Assembly` |
| DK | Denmark | Folketing | `Members of the Folketing` | `Member of Folketing` |
| FI | Finland | Eduskunta | `Members of the Parliament of Finland (2023–2027)` | `Member of Parliament` |
| SK | Slovakia | Národná rada | `Members of the National Council (Slovakia) 2023–2027` | `Member of National Council` |
| IE | Ireland | Dáil Éireann | `Members of the 34th Dáil` | `Teachta Dála` |
| SI | Slovenia | Državni zbor | `Members of the 9th National Assembly of Slovenia` | `Member of National Assembly` |
| LV | Latvia | Saeima | `Deputies of the 14th Saeima` | `Member of Saeima` |
| CY | Cyprus | House of Representatives | `Members of the House of Representatives (Cyprus)` | `Member of House of Representatives` |
| LU | Luxembourg | Chambre des Députés | `Members of the Chamber of Deputies (Luxembourg)` | `Member of Chamber of Deputies` |

Missing from config: Croatia (HR), Estonia (EE), Lithuania (LT), Malta (MT), Romania (RO).

#### Field Mapping (Category entry → `politicians` row)

| Input | Column | Notes |
|---|---|---|
| Wikipedia title | `name` | Raw page title; no disambiguation stripping |
| param | `country_code` | Uppercase, user-provided |
| config | `country_name` | From `PARLIAMENT_CONFIG[cc].countryName` |
| config | `role` | From `PARLIAMENT_CONFIG[cc].role` |
| constant | `jurisdiction` | `"federal"` (EU-parl function uses `"eu"`) |
| constant | `continent` | `"Europe"` |
| constant | `data_source` | `"parliamentary_record"` |
| derived | `source_url` | `https://en.wikipedia.org/wiki/${encoded}` |
| derived | `wikipedia_url` | Same as above |

No party data, no photo, no external ID — everything else is left for `enrich-wikipedia` to fill in.

---

### 3.3 `enrich-wikipedia`

**Sources:**
- `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` (summary + thumbnail + coordinates)
- `https://en.wikipedia.org/w/api.php?action=query&list=search` (disambiguation by search)
- `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|categories|links|extlinks` (3000-char extract)
- `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvsection=0` (raw infobox wikitext)

**Record type:** Enrichment-only. Does not create new politicians.

**Trigger bodies:**
```json
{ "batchSize": 20 }
```
or to target one row:
```json
{ "politicianId": "<uuid>" }
```

#### Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. Parse body (default batchSize=20, cap 50)               │
├─────────────────────────────────────────────────────────────┤
│  2. Select targets:                                          │
│     - if politicianId: single row fetch                     │
│     - else: SELECT * FROM politicians WHERE enriched_at IS  │
│       NULL ORDER BY role ASC LIMIT batchSize                │
├─────────────────────────────────────────────────────────────┤
│  3. For each politician (serial, ~300ms between calls):     │
│     a. searchWikipedia(`${name} politician ${country_name}`)│
│        → returns best title via list=search (limit=3)       │
│     b. if no title → log + continue                         │
│     c. Promise.all([                                         │
│          getWikiSummary(title),                              │
│          getWikiExtracts(title),                             │
│          getWikiInfobox(title),                              │
│        ])                                                    │
│     d. If no summary → log + continue                       │
│     e. Build updateData:                                     │
│          wikipedia_url, wikipedia_summary, biography,        │
│          wikipedia_image_url, wikipedia_data (JSONB),        │
│          enriched_at = now()                                 │
│          photo_url (only if wikiImage present)               │
│          birth_year (only if infobox birth_date matches \d4)│
│     f. UPDATE politicians SET ... WHERE id=id                │
├─────────────────────────────────────────────────────────────┤
│  4. COUNT remaining enriched_at IS NULL                     │
├─────────────────────────────────────────────────────────────┤
│  5. Return { enriched, failed, remaining }                  │
└─────────────────────────────────────────────────────────────┘
```

#### Infobox Extraction

The function fetches raw wikitext of the lead section and runs 14 regexes to harvest:

```
birth_date, birth_place, alma_mater, spouse, children,
occupation, party, office, term_start, term_end,
predecessor, successor, nationality, religion
```

For each match it:
1. Strips `[[link|display]]` → `display`
2. Removes all `{{template}}` blocks
3. Stores under the field key in `wikipedia_data.infobox`.

Only `birth_date` is further parsed — a `\d{4}` regex extracts the year into `politicians.birth_year`. Everything else lives as free-form JSONB under `wikipedia_data.infobox.*` and is read verbatim by the UI (`src/pages/ActorDetail.tsx` line 68 reads `infobox` as `Record<string, string>`).

#### Field Mapping (Wikipedia → `politicians` row update)

| Source | Column | Write condition |
|---|---|---|
| `summary.content_urls.desktop.page` (or derived) | `wikipedia_url` | always |
| `summary.extract` | `wikipedia_summary` | always |
| `fullExtract \|\| summary.extract` | `biography` | always |
| `summary.originalimage.source \|\| summary.thumbnail.source` | `wikipedia_image_url` | only if image exists |
| same image URL | `photo_url` | **overwrites** existing EP photo if present |
| composite JSONB | `wikipedia_data` | always; includes `{ title, description, infobox, coordinates, last_fetched }` |
| `now()` | `enriched_at` | always |
| infobox `birth_date` → `\d{4}` | `birth_year` | only if infobox field present |

**Important side effect:** the function unconditionally overwrites `photo_url` with the Wikipedia image, replacing MEP portraits scraped by `scrape-eu-parliament`. Comment in source says "Use Wikipedia image if we don't have a photo or it's an EP placeholder" but the actual guard is `if (wikiImage)` — there's no check for whether the current `photo_url` is already set.

---

### 3.4 `scrape-twitter` (misnamed)

**Sources — despite the name, no Twitter/X is touched:**
- `https://ec.europa.eu/commission/presscorner/api/files/RSS` (European Commission press)
- `https://www.europarl.europa.eu/rss/doc/top-stories/en.xml` (European Parliament top stories)

**Record type:** `political_events` rows with `event_type = 'public_statement'`, `source = 'news'`.
**Trigger body:** `{}` (no parameters)

#### Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. INSERT scrape_runs (source_type='twitter')              │
│     — note: source_type enum value is literally 'twitter'   │
│       even though data is press-release RSS                 │
├─────────────────────────────────────────────────────────────┤
│  2. SELECT id, name, country_name FROM politicians          │
│     — loads ALL politicians into memory                     │
├─────────────────────────────────────────────────────────────┤
│  3. Build nameMap: Map<lowercased_name → politician_id>     │
│     Also indexed by last-name-only (string split on " ")    │
│     → "Angela Merkel" produces entries for                  │
│        "angela merkel" AND "merkel"                         │
├─────────────────────────────────────────────────────────────┤
│  4. For each feed in PUBLIC_FEEDS:                          │
│     fetchRSSFeed(url): regex /<item>...<\/item>/g           │
│       extract <title>, <description>, <link>, <pubDate>     │
│       limit 20 items per feed                               │
│     For each item:                                           │
│       fullText = (title + description).toLowerCase()        │
│       For each [name → id] in nameMap:                      │
│         if name.length > 3 && fullText.includes(name)       │
│         INSERT political_events {                            │
│           politician_id: id,                                 │
│           event_type: 'public_statement',                    │
│           title: "${feedName}: \"${item.title[:80]}...\"",  │
│           description: item.description,                     │
│           source: 'news',                                    │
│           source_url: item.link,                             │
│           sentiment: analyzeSentiment(title+desc),           │
│           entities: extractEntities(title+desc)[:10],        │
│           evidence_count: 1,                                 │
│           event_timestamp: parsed pubDate or now(),          │
│         }                                                    │
│         break; // only first matching politician             │
├─────────────────────────────────────────────────────────────┤
│  5. UPDATE scrape_runs → completed                          │
│  6. UPDATE data_sources WHERE source_type='twitter'         │
│  7. Return { items_fetched, events_created }                │
└─────────────────────────────────────────────────────────────┘
```

#### Sentiment Analyzer (in-file)

Two hardcoded word lists, compared by `.includes()`:

```
positive (19 words):
  great, proud, success, support, progress, celebrate, win,
  passed, achievement, growth, opportunity, welcome, agree,
  cooperation, unity, invest, innovation, reform

negative (18 words):
  oppose, against, fail, crisis, corrupt, shame, disaster,
  attack, reject, condemn, threat, concern, decline, block,
  veto, warn, danger, violation
```

Result: `posCount > negCount → positive`, inverse → `negative`, else `neutral`. Stored in `political_events.sentiment` as the enum value. **No lemmatization, no negation handling, no domain tuning.**

#### Entity Extractor

```
#hashtag → regex /#\w+/g   (max 5)
@mention → regex /@\w+/g   (max 5)
```

Stored as `political_events.entities TEXT[]`. Since the sources are official press RSS — not user-generated content — this almost always returns zero entities.

#### Matching Risks (Encoded In Source)

1. **Last-name collision.** Loading every politician into a single map keyed by surname guarantees false positives — `"Macron"` applied to any press release mentioning *Emmanuel Macron* is attributed to whichever French row was last indexed, not all rows.
2. **Substring matching.** `"Costa"` (a real surname) will match press releases discussing *costs*, *costa rica*, etc.
3. **First-match-wins.** The inner loop `break`s on the first politician match, so multi-person press releases are attributed to only one politician.
4. **Case + diacritics.** `nameMap` keys are lowercased but the politician names are inserted verbatim from Wikipedia titles, which keep diacritics — `"Sánchez"` will not match an RSS headline with `"Sanchez"`.

---

### 3.5 `scrape-un-votes`

**Source:** `https://digitallibrary.un.org/search` (HTML scraping)
**Record type:** `political_events` rows with `event_type = 'vote'`, `source = 'un_digital_library'`.
**Trigger body:** `{}`

#### Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. INSERT scrape_runs (source_type='un_digital_library')   │
├─────────────────────────────────────────────────────────────┤
│  2. Try JSON endpoint:                                       │
│     GET /search?cc=Voting+Data&sf=latest+first&so=d&rg=25   │
│         &of=recjson&fct__2=General+Assembly                  │
│     — Accept: application/json                               │
├─────────────────────────────────────────────────────────────┤
│  3a. If OK: parse JSON records array                        │
│      For each (first 20):                                    │
│        extract title, date, symbol                           │
│        SELECT politicians LIMIT 10                           │
│        For each politician: INSERT political_events {        │
│          event_type: 'vote',                                 │
│          title: `UN: ${title[:150]}`,                        │
│          source: 'un_digital_library',                       │
│          raw_data: <entire record>,                          │
│        }                                                     │
├─────────────────────────────────────────────────────────────┤
│  3b. If NOT OK (fallback HTML scrape):                      │
│      GET /search?...&of=hb                                   │
│      Regex /A\/RES\/\d+\/\d+/g → resolution list            │
│      Regex /Yes:\s*(\d+)\s*\|\s*No:\s*(\d+)\s*\|            │
│             \s*Abstentions:\s*(\d+)/g → vote tallies        │
│      For first 10 resolutions, attach to first 20 politicians│
│        INSERT political_events                              │
├─────────────────────────────────────────────────────────────┤
│  4. UPDATE scrape_runs → completed                          │
│  5. UPDATE data_sources WHERE source_type='un_digital_library'│
│  6. Return { records_fetched, events_created }              │
└─────────────────────────────────────────────────────────────┘
```

#### Attribution Model — **Broken By Design**

Both the JSON path and HTML fallback share the same behavior:

```
for (first 20 resolutions) {
  for (first 10-20 politicians in the table, unordered) {
    INSERT political_events { politician_id: <this politician>, ... }
  }
}
```

The function creates a vote event on each of the first N politicians regardless of whether the politician's country actually voted on the resolution, and regardless of how they voted. The `description` field is a templated string like `"General Assembly vote on A/RES/78/123. Results: Yes 120, No 5, Abstain 48."` — but there is no per-country voting data in the payload. **Every politician gets the same description.**

Effective semantics: this function records "there was a UN vote" as a fake per-politician event. It is not a voting record.

---

## 4. Database Schema: Where Data Lands

All tables live in the `public` schema. Row-Level Security is enabled on every table with a single `FOR SELECT USING (true)` policy — fully public read, writes only via service-role key.

### 4.1 Entity-Relationship Diagram

```
                        ┌────────────────────┐
                        │    politicians     │
                        │────────────────────│
                        │ id (uuid, PK)      │◄──┐ (self-ref both sides)
                        │ external_id        │   │
                        │ name               │   │
                        │ country_code       │   │
                        │ country_name       │   │
                        │ party_name         │   │
                        │ party_abbreviation │   │
                        │ role               │   │
                        │ jurisdiction       │   │
                        │ city               │   │
                        │ continent          │   │
                        │ twitter_handle     │   │
                        │ photo_url          │   │
                        │ birth_year         │   │
                        │ in_office_since    │   │
                        │ committees[]       │   │
                        │ top_donors[]       │   │
                        │ net_worth          │   │
                        │ data_source        │   │
                        │ source_url         │   │
                        │ wikipedia_url      │◄──┐
                        │ wikipedia_summary  │   │ populated by
                        │ biography          │   │ enrich-wikipedia
                        │ wikipedia_image_url│   │
                        │ wikipedia_data     │◄──┘
                        │ enriched_at        │
                        │ created_at         │
                        │ updated_at         │
                        └──────────┬─────────┘
                                   │
           ┌───────────────────────┼────────────────────────┐
           │                       │                        │
           v                       v                        v
┌───────────────────┐  ┌─────────────────────┐  ┌────────────────────────┐
│ political_events  │  │ politician_finances │  │ politician_investments │
│───────────────────│  │─────────────────────│  │────────────────────────│
│ id (PK)           │  │ id (PK)             │  │ id (PK)                │
│ politician_id FK  │  │ politician_id FK    │  │ politician_id FK       │
│ hash (md5 6-char) │  │ annual_salary       │  │ company_name           │
│ event_type (enum) │  │ currency            │  │ sector                 │
│ title             │  │ side_income         │  │ investment_type        │
│ description       │  │ declared_assets     │  │ estimated_value        │
│ source (enum)     │  │ property_value      │  │ currency               │
│ source_url        │  │ declared_debt       │  │ is_active              │
│ source_handle     │  │ salary_source       │  │ disclosure_date        │
│ sentiment (enum)  │  │ declaration_year    │  │ notes                  │
│ entities[]        │  │ notes               │  │ created_at             │
│ evidence_count    │  │ UNIQUE(pol_id,year) │  └────────────────────────┘
│ diff_removed      │  └─────────────────────┘
│ diff_added        │
│ event_timestamp   │  ┌─────────────────────┐  ┌────────────────────────┐
│ raw_data (jsonb)  │  │ politician_positions│  │ politician_associations│
│ created_at        │  │─────────────────────│  │────────────────────────│
└───────────────────┘  │ politician_id UQ FK │  │ politician_id FK       │
                       │ economic_score      │  │ associate_id FK        │
                       │ social_score        │  │ relationship_type      │
                       │ eu_integration      │  │ strength               │
                       │ environmental       │  │ context                │
                       │ immigration         │  │ is_domestic            │
                       │ education_priority  │  │ UNIQUE(pol_id,assoc_id)│
                       │ science_priority    │  └────────────────────────┘
                       │ healthcare_priority │
                       │ defense_priority    │
                       │ economy_priority    │
                       │ justice_priority    │
                       │ social_welfare_prio │
                       │ environment_prio    │
                       │ ideology_label      │
                       │ key_positions (json)│
                       │ data_source         │
                       └─────────────────────┘

┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  data_sources    │   │  scrape_runs     │   │   proposals      │
│──────────────────│   │──────────────────│   │──────────────────│
│ id (PK)          │◄──│ source_id FK     │   │ id (PK)          │
│ name             │   │ source_type      │   │ title            │
│ source_type enum │   │ status           │   │ official_title   │
│ base_url         │   │ records_fetched  │   │ status           │
│ description      │   │ records_created  │   │ proposal_type    │
│ last_synced_at   │   │ records_updated  │   │ jurisdiction     │
│ total_records    │   │ error_message    │   │ country_code     │
│ is_active        │   │ started_at       │   │ country_name     │
└──────────────────┘   │ completed_at     │   │ vote_date        │
                       └──────────────────┘   │ submitted_date   │
                                              │ sponsors[]       │
                                              │ affected_laws[]  │
                                              │ evidence_count   │
                                              │ summary          │
                                              │ policy_area      │
                                              │ source_url       │
                                              └──────────────────┘
```

### 4.2 Enum Types

```sql
-- defined in 20260410090851_*.sql
political_event_type:
  vote, speech, committee_join, committee_leave, election,
  appointment, resignation, scandal, policy_change, party_switch,
  legislation_sponsored, foreign_meeting, lobbying_meeting,
  corporate_event, financial_disclosure, social_media, travel,
  donation_received, public_statement, court_case, media_appearance

data_source_type:
  eu_parliament, un_digital_library, twitter, official_record,
  news, financial_filing, parliamentary_record, court_filing,
  lobby_register

sentiment_type:
  positive, negative, neutral
```

Only a subset of `political_event_type` is ever written by ingestion code today:

| Written by | event_type values actually inserted |
|---|---|
| `scrape-twitter` | `public_statement` only |
| `scrape-un-votes` | `vote` only |
| everything else | — (other enum values are unused) |

### 4.3 Migration Timeline

```
20260410090851  │  Base schema: politicians, political_events, data_sources,
                │  scrape_runs, enums, RLS, seed data_sources rows, updated_at
                │  trigger function + trigger on politicians.
                │
20260410094556  │  ALTER politicians ADD wikipedia_url, wikipedia_summary,
                │  biography, wikipedia_image_url, wikipedia_data (jsonb),
                │  enriched_at.
                │
20260410101746  │  CREATE politician_finances (one row per year, UNIQUE
                │  (politician_id, declaration_year)).
                │  CREATE politician_investments.
                │  RLS public-read, indexes, updated_at trigger.
                │
20260410103008  │  CREATE politician_positions (compass scores + priority
                │  sliders + key_positions JSON). UNIQUE(politician_id).
                │  RLS, updated_at trigger.
                │
20260410103524  │  CREATE politician_associations (self-referential with
                │  strength score, relationship_type, is_domestic).
                │  UNIQUE(politician_id, associate_id). RLS.
                │
20260410103922  │  CREATE proposals (title, status, country, policy_area,
                │  sponsors[], affected_laws[]). RLS, indexes, updated_at
                │  trigger.
```

### 4.4 Seed Data (from base migration)

```sql
INSERT INTO data_sources (name, source_type, base_url, description) VALUES
  ('EU Parliament Open Data', 'eu_parliament',
   'https://data.europarl.europa.eu/api/v2',
   'Official EU Parliament API - MEPs, votes, speeches, declarations'),
  ('UN Digital Library', 'un_digital_library',
   'https://digitallibrary.un.org',
   'UN General Assembly voting records and resolutions'),
  ('Twitter/X API', 'twitter',
   'https://api.x.com/2',
   'Politician social media activity tracking');
```

Note: the seeded `base_url` for `eu_parliament` is the v2 Open Data API — but the actual function uses `europarl.europa.eu/meps/en/full-list/xml`, a totally different endpoint. Similarly `Twitter/X API` is seeded but never consumed; the scraper reads RSS instead. **Seed data is documentation fiction, not a source of truth.**

---

## 5. Field-Level Provenance Matrix

For each column on `politicians`, which ingester writes it?

| Column | EU-parl | Nat-parl | Wiki | Other | Result if no ingester |
|---|---|---|---|---|---|
| `id` | default | default | — | — | uuid auto |
| `external_id` | ✓ (MEP id) | — | — | — | NULL on national rows |
| `name` | ✓ | ✓ (wiki title) | — | — | — |
| `country_code` | ✓ (map) | ✓ (param) | — | — | — |
| `country_name` | ✓ | ✓ (config) | — | — | — |
| `party_name` | ✓ (EP group) | — | — | — | NULL on national rows |
| `party_abbreviation` | ✓ (national group name) | — | — | — | NULL on national rows |
| `role` | constant `"Member of European Parliament"` | constant per country | — | — | — |
| `jurisdiction` | `"eu"` | `"federal"` | — | — | schema default `"federal"` |
| `city` | — | — | — | — | **always NULL** |
| `continent` | `"Europe"` | `"Europe"` | — | — | NULL for non-EU |
| `twitter_handle` | — | — | — | — | **always NULL** |
| `photo_url` | ✓ MEP portrait | — | ✓ overwrites | — | NULL on national rows pre-enrichment |
| `birth_year` | — | — | ✓ (infobox regex) | — | NULL if no infobox match |
| `in_office_since` | — | — | — | — | **always NULL** |
| `committees[]` | — | — | — | — | always `{}` |
| `top_donors[]` | — | — | — | — | always `{}` |
| `net_worth` | — | — | — | — | **always NULL** |
| `data_source` | `"eu_parliament"` | `"parliamentary_record"` | — | — | — |
| `source_url` | EP member page | Wiki article | — | — | — |
| `wikipedia_url` | — | ✓ (pre-enrichment guess) | ✓ (authoritative) | — | NULL until enriched |
| `wikipedia_summary` | — | — | ✓ | — | NULL until enriched |
| `biography` | — | — | ✓ (3000 chars) | — | NULL until enriched |
| `wikipedia_image_url` | — | — | ✓ | — | NULL until enriched |
| `wikipedia_data` | — | — | ✓ (JSONB) | — | NULL until enriched |
| `enriched_at` | — | — | ✓ | — | NULL = unenriched |
| `created_at` | default | default | — | — | now() |
| `updated_at` | default / trigger | default / trigger | trigger | — | now() |

**Columns that no ingester ever populates:**
`city`, `twitter_handle`, `in_office_since`, `committees[]`, `top_donors[]`, `net_worth`. These are read by the UI (`src/hooks/use-politicians.ts` maps them into `Actor`) but will always be empty until a manual SQL update or future ingester writes them.

---

## 6. Run Logging & Observability

Every function writes exactly one row to `scrape_runs`. The lifecycle:

```
 ┌───────────────┐  function start
 │   'running'   │◄──────────────────────
 │  records_*=0  │
 └───────┬───────┘
         │
         │ function body
         v
 ┌───────────────┐              ┌───────────────┐
 │  'completed'  │     or       │   'failed'    │
 │ records_fetched│              │ error_message │
 │ records_created│              │ completed_at  │
 │ records_updated│              └───────────────┘
 │ completed_at  │
 └───────────────┘
```

| Field | Written by | Meaning |
|---|---|---|
| `source_id` | — | never written (always NULL) |
| `source_type` | all | enum value per function |
| `status` | all | `running` → `completed` / `failed` |
| `records_fetched` | all | source rows pulled from upstream |
| `records_created` | eu-parl, nat-parl, twitter, un-votes | inserted rows (enrich-wiki does not log its own run) |
| `records_updated` | eu-parl, nat-parl | updated rows |
| `error_message` | all (on failure) | `error.message \|\| String(error)` |
| `started_at` | default | `now()` |
| `completed_at` | all (on finish) | `now()` |

**Observability gaps:**
- `enrich-wikipedia` writes nothing to `scrape_runs`. Its executions are invisible to the observability table.
- `status='partial'` is allowed by the CHECK constraint but never written.
- No duration column — must be computed from `completed_at - started_at`.
- No correlation ID between the chained scrape + enrich runs.
- No per-error row — one aggregated `error_message` per run.

---

## 7. Chaining & Orchestration

### Explicit Chains

```
scrape-eu-parliament     ─── fire-and-forget ───┐
                                                 v
                                         enrich-wikipedia
                                                 ^
scrape-national-parliament ─── fire-and-forget ─┘
```

Both scrapers conditionally invoke `enrich-wikipedia` when `created > 0`. The calls are HTTP `POST`s to `${SUPABASE_URL}/functions/v1/enrich-wikipedia` with the service-role key in the `Authorization` header. Body: `{ batchSize: min(created, 15) }`. In `scrape-eu-parliament` this is awaited with a 25s timeout; in `scrape-national-parliament` it is un-awaited (`fetch(...).catch(() => {})`). Failures are swallowed.

**Consequence:** because `enrich-wikipedia` processes `enriched_at IS NULL LIMIT batchSize` rather than a specific ID list, the newly created politicians are not guaranteed to be the ones enriched — any older unenriched row will be picked up first (ordered by `role ASC`).

### Missing Chains

- `scrape-twitter` and `scrape-un-votes` do not chain anything.
- Nothing re-invokes a scraper for the next batch — the caller must poll `next_offset` manually.
- There is no retry logic; a failed upstream fetch kills the run.

---

## 8. Consumer Path: From Tables to UI

### 8.1 Query Layer ([`src/hooks/use-politicians.ts`](./src/hooks/use-politicians.ts))

| Hook | Table(s) | Query | Output type |
|---|---|---|---|
| `usePoliticians()` | `politicians` | `SELECT * ORDER BY name` | `Actor[]` |
| `usePolitician(id)` | `politicians` | `WHERE id = ?` | `Actor \| null` |
| `usePoliticiansByCountry(cc)` | `politicians` | `WHERE country_code = ?` | `Actor[]` |
| `useCountryStats()` | `politicians` | `SELECT country_code, country_name, continent, party_name` — aggregated in JS | country rollup |
| `usePoliticianFinances(id)` | `politician_finances` | latest `declaration_year` | `PoliticianFinance \| null` |
| `usePoliticianInvestments(id)` | `politician_investments` | `ORDER BY estimated_value DESC` | `PoliticianInvestment[]` |
| `usePoliticianEvents(id)` | `political_events` | `WHERE politician_id = ? ORDER BY event_timestamp DESC` | `ActorEvent[]` |
| `usePoliticianPosition(id)` | `politician_positions` | single row | row \| null |
| `useAllPositions()` | `politician_positions` | inner join `politicians` | rows with denormalized name/party/country |
| `usePoliticianAssociates(id)` | `politician_associations` | both directions joined to `politicians` | deduped `PoliticianAssociate[]` |

| Hook | Table(s) | Query | Output type |
|---|---|---|---|
| `useProposals(filters)` | `proposals` | optional country/status/area filter | `DbProposal[]` |
| `useProposal(id)` | `proposals` | `WHERE id = ?` | `DbProposal \| null` |
| `useProposalsByCountry(cc)` | `proposals` | `WHERE country_code = ? LIMIT 20` | `DbProposal[]` |
| `useProposalsByPolicyAreas([])` | `proposals` | `WHERE policy_area IN ... LIMIT 10` | `DbProposal[]` |
| `useProposalStats()` | `proposals` | aggregated in JS | rollup |

### 8.2 Mapping Functions

Two mapping functions in [`use-politicians.ts`](./src/hooks/use-politicians.ts) translate DB shape → app shape:

```ts
// DB row → Actor (used by every politician page)
mapPoliticianToActor(p):
  id                 = p.id
  partyId            = p.party_abbreviation ?? 'unknown'
  party              = p.party_abbreviation ?? p.party_name ?? 'Independent'
  canton             = p.city ?? p.country_name          // ← city never populated
  countryId          = p.country_code.toLowerCase()
  role               = p.role ?? 'Politician'
  jurisdiction       = p.jurisdiction ?? 'federal'
  committees         = p.committees ?? []                // ← never populated
  recentVotes        = []                                // ← NEVER loaded from political_events
  revisionId         = 'rev-' + p.id.slice(0, 6)         // ← synthetic
  photoUrl           = p.photo_url
  birthYear          = p.birth_year
  inOfficeSince      = p.in_office_since                 // ← never populated
  twitterHandle      = p.twitter_handle                  // ← never populated
  netWorth           = p.net_worth                        // ← never populated
  topDonors          = p.top_donors                       // ← always []
  wikipediaUrl       = p.wikipedia_url
  wikipediaSummary   = p.wikipedia_summary
  biography          = p.biography
  wikipediaImageUrl  = p.wikipedia_image_url
  wikipediaData      = p.wikipedia_data                   // JSONB → any
  enrichedAt         = p.enriched_at

// political_events row → ActorEvent
mapEventToActorEvent(e):
  id, actorId = politician_id, hash, timestamp = event_timestamp
  type        = e.event_type                             // cast to ActorEvent['type']
  title, description
  diff        = { removed, added }   // constructed only if either is non-null
  evidenceCount, sourceUrl, source, sourceHandle, sentiment, entities
```

### 8.3 Pages Consuming Ingested Data

| Page | Ingested data visible |
|---|---|
| [`src/pages/Index.tsx`](./src/pages/Index.tsx) | `usePoliticians`, `useCountryStats`, `useProposals` |
| [`src/pages/Explore.tsx`](./src/pages/Explore.tsx) | `useCountryStats`, `usePoliticians` |
| [`src/pages/CountryDetail.tsx`](./src/pages/CountryDetail.tsx) | `useCountryStats`, `usePoliticiansByCountry` |
| [`src/pages/Actors.tsx`](./src/pages/Actors.tsx) | `usePoliticians` |
| [`src/pages/ActorDetail.tsx`](./src/pages/ActorDetail.tsx) | `usePolitician`, `usePoliticianEvents`, `usePoliticianFinances`, `usePoliticianInvestments`, `usePoliticianPosition`, `usePoliticianAssociates`, `useProposalsByCountry` |
| [`src/pages/Proposals.tsx`](./src/pages/Proposals.tsx) | `useProposals`, `useProposalStats` |
| [`src/pages/ProposalDetail.tsx`](./src/pages/ProposalDetail.tsx) | `useProposal` |
| [`src/pages/Relationships.tsx`](./src/pages/Relationships.tsx) | `usePoliticians`, `useCountryStats`, `useAllPositions` |
| [`src/pages/Data.tsx`](./src/pages/Data.tsx) | all of the above + local EU reference constants |

`ActorDetail.tsx` specifically renders `actor.wikipediaSummary` and reads `actor.wikipediaData.infobox` as a `Record<string, string>` (line 68) — confirming that the `enrich-wikipedia` infobox JSONB is surfaced verbatim to users.

---

## 9. Authoritative Risk Register

Risks are listed as they exist in the code **today**, not as hypothetical failure modes.

| # | Severity | Location | Problem |
|---|---|---|---|
| 1 | HIGH | [`scrape-twitter/index.ts:130-134`](./supabase/functions/scrape-twitter/index.ts) | Name map keyed by last name only → every `"Merkel"` mention attributed to a single hardcoded Merkel row; all other Merkels invisible. |
| 2 | HIGH | [`scrape-twitter/index.ts:148-171`](./supabase/functions/scrape-twitter/index.ts) | `fullText.includes(name)` with `name.length > 3` — triggers on substring collisions (`"Costa"` ↔ `"cost"`, `"Rey"` ↔ `"grey"`). |
| 3 | HIGH | [`scrape-un-votes/index.ts:88-106`](./supabase/functions/scrape-un-votes/index.ts) | Fake per-politician attribution — vote events are inserted for the first ≤20 politicians regardless of their country or actual vote. |
| 4 | HIGH | [`enrich-wikipedia/index.ts:185-187`](./supabase/functions/enrich-wikipedia/index.ts) | `photo_url` is unconditionally overwritten with Wikipedia image even when an EP portrait is already present. |
| 5 | MED | [`scrape-eu-parliament/index.ts:28-44`](./supabase/functions/scrape-eu-parliament/index.ts) | Regex XML parser — any CDATA, escaped tags, or schema change breaks extraction silently. |
| 6 | MED | [`scrape-national-parliament/index.ts:299-308`](./supabase/functions/scrape-national-parliament/index.ts) | Dedupe by `name` within `country_code` only. Two countries can still insert the same name as separate rows; no `ON CONFLICT` clause exists. |
| 7 | MED | [`enrich-wikipedia/index.ts:242-248`](./supabase/functions/enrich-wikipedia/index.ts) | Wikipedia disambiguation uses only first search result — wrong page for common names (e.g. "John Smith, politician, UK"). |
| 8 | MED | [`scrape-twitter/index.ts:34-53`](./supabase/functions/scrape-twitter/index.ts) | Sentiment is a 37-word substring check with no negation handling — publishes misleading `sentiment` to the UI. |
| 9 | MED | none | `enrich-wikipedia` writes no `scrape_runs` row. Observability gap: no durable trace of enrichment jobs. |
| 10 | MED | [`scrape-eu-parliament/index.ts:131-134`](./supabase/functions/scrape-eu-parliament/index.ts) | `data_sources.total_records` stores `allMeps.length` every batch, not a cumulative count — meaning is ambiguous. |
| 11 | LOW | [`20260410090851_*.sql:115-118`](./supabase/migrations/20260410090851_b70e59f4-ca05-4057-892d-8cd0367a877c.sql) | `data_sources` seed URLs (`data.europarl.europa.eu/api/v2`, `api.x.com/2`) are stale and don't reflect what the functions actually fetch. |
| 12 | LOW | — | No idempotency key on `political_events` — reruns of `scrape-twitter` or `scrape-un-votes` will duplicate rows indefinitely. |
| 13 | LOW | [`enrich-wikipedia/index.ts:246-248`](./supabase/functions/enrich-wikipedia/index.ts) | Batch ordering `.order('role', { ascending: true })` happens before `LIMIT`; priority-by-role only works because NULL roles sort last, which is Postgres default but not explicit. |
| 14 | LOW | — | No per-row error capture. Partial failures during batch inserts produce a successful `scrape_runs` row with inflated `created` counts. |

---

## 10. What Is NOT Ingested (Dead/Manual Paths)

The following tables have schemas, indexes, RLS policies, and UI consumers — but **no ingestion code in this repo writes to them**:

| Table | Used by | Populated by |
|---|---|---|
| `politician_finances` | [`ActorDetail.tsx`](./src/pages/ActorDetail.tsx) via `usePoliticianFinances` | — manual SQL only |
| `politician_investments` | [`ActorDetail.tsx`](./src/pages/ActorDetail.tsx) via `usePoliticianInvestments` | — manual SQL only |
| `politician_positions` | [`Relationships.tsx`](./src/pages/Relationships.tsx), [`PoliticalCompass.tsx`](./src/components/PoliticalCompass.tsx), [`PolicyRadar.tsx`](./src/components/PolicyRadar.tsx) | — manual SQL only (default scores 0 / priorities 5) |
| `politician_associations` | `usePoliticianAssociates` | — manual SQL only |
| `proposals` | [`Proposals.tsx`](./src/pages/Proposals.tsx), [`ProposalDetail.tsx`](./src/pages/ProposalDetail.tsx), [`Index.tsx`](./src/pages/Index.tsx), [`ActorDetail.tsx`](./src/pages/ActorDetail.tsx) | — manual SQL only |

Additionally, these `politicians` columns have no writer anywhere:

```
city, twitter_handle, in_office_since, committees[],
top_donors[], net_worth
```

And these `political_event_type` enum values are never written:

```
speech, committee_join, committee_leave, election, appointment,
resignation, scandal, policy_change, party_switch,
legislation_sponsored, foreign_meeting, lobbying_meeting,
corporate_event, financial_disclosure, social_media, travel,
donation_received, court_case, media_appearance
```

The UI has labels and badges for all of them ([`src/data/domain.ts:96-128`](./src/data/domain.ts)) but the data pipeline will never produce them. They exist as forward-compatible slots for ingesters that have not been written.

---

## Appendix A: Running the Pipeline End-to-End

The only commands needed to exercise the full ingestion today (assuming Supabase env is configured):

```bash
# 1. Scrape all current MEPs (paginated; call until has_more=false)
curl -X POST "$SUPABASE_URL/functions/v1/scrape-eu-parliament" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offset": 0, "batchSize": 200}'
# → auto-triggers enrich-wikipedia for first 15 new rows

# 2. Scrape one country's national parliament
curl -X POST "$SUPABASE_URL/functions/v1/scrape-national-parliament" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"countryCode": "DE", "batchSize": 100, "offset": 0}'
# → auto-triggers enrich-wikipedia fire-and-forget

# 3. Backfill Wikipedia enrichment for any unenriched rows
curl -X POST "$SUPABASE_URL/functions/v1/enrich-wikipedia" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50}'

# 4. Pull EU press release RSS and attribute statements (risky — see §3.4)
curl -X POST "$SUPABASE_URL/functions/v1/scrape-twitter" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}'

# 5. Pull UN GA resolution list and fake-attribute votes (broken — see §3.5)
curl -X POST "$SUPABASE_URL/functions/v1/scrape-un-votes" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}'
```

No wrapper script, no cron, no CI job calls any of these. The pipeline's execution cadence is whatever a human (or an external scheduler outside the repo) decides to run.

## Appendix B: Glossary

- **MEP** — Member of the European Parliament (an elected member of the Brussels/Strasbourg body).
- **EP** — European Parliament.
- **Category API (Wikipedia)** — `action=query&list=categorymembers`, lists pages in a category.
- **Infobox** — the sidebar fact-box on Wikipedia biographical articles. Parsed here by regex on raw wikitext from the lead section.
- **Service role key** — the elevated Supabase API key that bypasses RLS. All edge functions use it.
- **RLS** — Row-Level Security. Every table in this schema has a permissive `SELECT USING (true)` policy plus no INSERT/UPDATE/DELETE policies, meaning only the service role can write.
- **Fire-and-forget chain** — a chained HTTP call that is not awaited and whose errors are swallowed; used by the national-parl → enrich-wiki chain.
