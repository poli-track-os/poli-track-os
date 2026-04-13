# Explore (`/explore`)

Country-coverage overview. Shows which EU countries have data in Poli-Track and how much.

![Explore page](../docs/screenshots/explore.png)

## What you see

- Grid of countries with ISO flag, name, and number of tracked politicians / parties.
- Click a country to open [Country Detail](Page-Country-Detail).
- Continent grouping (Europe-first layout).

## Data sources used

| Hook | Table |
|---|---|
| `useCountryStats()` | `politicians` (grouped by `country_code`, `country_name`, `continent`, `party_name`) |
| `usePoliticians()` | `politicians` |

`useCountryStats` aggregates in JS, counting distinct parties per country.

## Code

- Route: `/explore` → `src/pages/Explore.tsx`
- Country card layout is inline in that file.
