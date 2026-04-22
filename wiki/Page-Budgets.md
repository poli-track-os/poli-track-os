# Budgets

National budget explorer, backed by Eurostat COFOG.

## What it shows

The Budgets page turns Eurostat's "general government expenditure by function" (COFOG) into an interactive explorer for one country at a time. You pick a country and a year and get:

- A headline total (e.g. €X.X T total general government expenditure).
- A breakdown bar chart of spending per COFOG function (defence, health, education, social protection, …) in both absolute euros and % of total.
- A 20-year time series of the total, to see how the budget has grown or shrunk in nominal terms.
- A cross-country comparison for one reference function (Health / GF07 today) as a share of GDP in the selected year, with the selected country highlighted.

Country and year are held in URL query params (`?country=DE&year=2023`), so a URL is shareable.

## Route

`/budgets`

## Data sources

- `government_expenditure` — COFOG rows (country × year × function × unit). Populated by [Eurostat](Data-Source-Eurostat).
- `country_demographics` — population and GDP used to derive per-capita and per-GDP ratios.
- `cofog_functions` — seed table of COFOG codes (`GF01`…`GF10`, `GFTOT`) with labels and colors.
- `politicians` grouped by country — reused to populate the country picker labels.

## React components

- Page: [Budgets.tsx](../src/pages/Budgets.tsx)
- Hooks: [useGovernmentExpenditure](../src/hooks/use-government-expenditure.ts), [useCountryDemographics](../src/hooks/use-government-expenditure.ts), [useCofogFunctions](../src/hooks/use-government-expenditure.ts), [useExpenditureByFunction](../src/hooks/use-government-expenditure.ts), [useCountryStats](../src/hooks/use-politicians.ts)
- Chart helpers: `buildBreakdownForYear`, `buildTimeSeries` in [use-government-expenditure.ts](../src/hooks/use-government-expenditure.ts)

## API equivalent

`GET /functions/v1/page/budget/{country}/{year?}` — expenditure for the given country and year plus demographics and a cross-country health comparison. See [API reference](API-Reference).

## MCP tool equivalent

`get_budget({ country, year? })` — returns `{ total, breakdown: [{cofog, amount, pct_gdp, pct_total, per_capita}], demographics }`. See [MCP server](MCP-Server).

## Screenshots

(not captured yet)

## Known issues

- Coverage is whatever Eurostat publishes: most countries stop around 1995 and land at t-2 for the current year, so the "latest year" selector may point to a year that is already two years behind the press.
- The EU27 aggregate row (`EU27_2020`) is filtered out of the health comparison chart; a user who wanted to compare a country to the bloc has to read the absolute-EUR figures instead.
- `GFTOT` rows are stripped from the per-function breakdown on purpose (they represent the sum), so the bar chart will not add up to the headline number if you eyeball it.
