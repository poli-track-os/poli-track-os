# Data (`/data`)

Comparative dashboards. Heavy Recharts usage — the tallest page in the app.

![Data page](../docs/screenshots/data.png)

## What you see

- Proposals by country (bar chart).
- Proposals by status and policy area.
- Politicians by country and by party family.
- Per-capita and GDP-normalized ratios where local EU reference constants are available.

## Data sources used

| Hook | Table |
|---|---|
| `usePoliticians()` | `politicians` |
| `useCountryStats()` | `politicians` grouped |
| `useProposals()` | `proposals` |
| `useProposalStats()` | `proposals` aggregated |

The page also blends in a local EU reference table (population, GDP) that ships inside `src/pages/Data.tsx`. Those values are not in the database — they're hardcoded to support comparative metrics until a real geo/econ data source is wired in.

## Code

- Route: `/data` → `src/pages/Data.tsx`
- Reference constants: inline at the top of the file.
