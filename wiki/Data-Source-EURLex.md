# Data source: EUR-Lex

EU secondary legislation.

## Upstream URL & license

- URL: <https://eur-lex.europa.eu>
- Access: SPARQL endpoint at `https://publications.europa.eu/webapi/rdf/sparql` (CELEX sector 3 — secondary legislation).
- License: European Union legal notice, free re-use with attribution per Commission Decision 2011/833/EU.

## What it provides

CELEX sector 3 covers adopted EU secondary legislation — directives, regulations, decisions, and recommendations. Poli-Track pulls:

- CELEX identifier
- Title and official title
- Act type (L = regulation / directive, R = recommendation, D = decision, H = opinion/other)
- Adoption date
- Link back to the EUR-Lex document

## Ingestion function

The Deno edge function [supabase/functions/scrape-eu-legislation/](../supabase/functions/scrape-eu-legislation/) runs a SPARQL query filtering CELEX types L, R, D, H, then inserts rows into `proposals` with a keyword-based policy area detection. Rows are deduped on `source_url`.

Manual invocation:

```bash
curl -fsSL -X POST "$SUPABASE_URL/functions/v1/scrape-eu-legislation" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -d '{}'
```

## Tables populated

- `proposals` — EU-level legislation with `country_code='EU'`.
- `scrape_runs` — one row per run.

## Refresh cadence

Scheduled weekly via [.github/workflows/ingest.yml](https://github.com/poli-track-os/poli-track-os/blob/main/.github/workflows/ingest.yml).

## Known quirks / rate limits

- SPARQL is expressive but slow; the function uses a conservative `LIMIT` per run.
- Policy area detection is keyword-based — a regulation whose title does not mention "energy" will not be tagged `energy` even if its body is about energy policy.
- `sponsors[]` is always empty for EU legislation since the CELEX record does not carry a rapporteur. The Parltrack dossier feed ([Parltrack](Data-Source-Parltrack)) is where sponsor info actually lives.
- Poli-Track intentionally excludes sector 1 (EU treaties) and sector 2 (international agreements).

## Attribution requirements

Credit "Source: EUR-Lex" with a link back to <https://eur-lex.europa.eu> whenever the data is rendered.
