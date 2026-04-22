# Data source: Eurostat

COFOG government expenditure and macro indicators.

## Upstream URL & license

- URL: <https://ec.europa.eu/eurostat>
- API: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}`
- License: Eurostat's re-use policy (essentially free re-use with attribution, subject to the Commission Decision 2011/833/EU). Attribution text: "Source: Eurostat".

## What it provides

Three JSON-stat datasets drive the [Budgets page](Page-Budgets) and the per-capita / per-GDP ratios on the [Data page](Page-Data):

- **`gov_10a_exp`** — general government expenditure by function (COFOG). Three units per row: `MIO_EUR` (million euros), `PC_GDP` (percent of GDP), `PC_TOT` (percent of total). Covers 27 EU member states plus the `EU27_2020` aggregate, typically from 1995 to t-2.
- **`nama_10_gdp`** — headline GDP at current prices.
- **`demo_pjan`** — population on 1 January, per country.

COFOG functions ingested: `GF01`…`GF10` plus the `GFTOT` total row.

## Ingestion script

Two scripts:

- [scripts/sync-eurostat-budgets.ts](../scripts/sync-eurostat-budgets.ts) — COFOG expenditure.
- [scripts/sync-eurostat-macro.ts](../scripts/sync-eurostat-macro.ts) — GDP + population.

```bash
node --experimental-strip-types scripts/sync-eurostat-budgets.ts --apply
node --experimental-strip-types scripts/sync-eurostat-budgets.ts --apply --countries DE,FR
node --experimental-strip-types scripts/sync-eurostat-macro.ts --apply
```

The JSON-stat response is decoded by [src/lib/jsonstat-parser.ts](../src/lib/jsonstat-parser.ts) into a flat row format before upsert.

## Tables populated

- `government_expenditure` — country × year × COFOG function × unit.
- `country_demographics` — population and GDP per country × year.
- `cofog_functions` — reference seed table of COFOG codes, labels, and chart colors.

See [Data model](Data-Model).

## Refresh cadence

Eurostat updates `gov_10a_exp` roughly twice a year; the macro datasets are more frequent. The ingesters are run on demand — no fixed cron is attached today.

## Known quirks / rate limits

- The Eurostat REST API returns JSON-stat, which is a sparse encoding; the parser walks the dimension hierarchy to produce row-shaped output. Changes to the dimension order on the upstream side would break parsing silently.
- Most countries start around 1995 and land at t-2 for the current year, so the "latest year" on the [Budgets page](Page-Budgets) may already be two years behind the press.
- The aggregator row `EU27_2020` is kept in `government_expenditure` but filtered out of the cross-country comparison chart on the Budgets page.
- `GFTOT` is the sum row; the breakdown chart strips it to avoid double-counting.

## Attribution requirements

Credit "Source: Eurostat" alongside any reuse of these datasets, per the Commission Decision on the re-use of Commission documents.
