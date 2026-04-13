# Actors (`/actors`)

The directory of every tracked politician.

![Actors page](../docs/screenshots/actors.png)

## What you see

- A dense grid of actor cards, each with name, role, party, country, and last update timestamp.
- Click any card to open [Actor Detail](Page-Actor-Detail).

## Data sources used

| Hook | Query |
|---|---|
| `usePoliticians()` | `politicians ORDER BY name` |

Rows are mapped from the raw Supabase shape to the app's `Actor` type via `mapPoliticianToActor` in [`src/hooks/use-politicians.ts`](https://github.com/poli-track-os/poli-track-os/blob/main/src/hooks/use-politicians.ts). That mapping is where defaults like `party = party_abbreviation ?? party_name ?? 'Independent'` happen.

## Code

- Route: `/actors` → `src/pages/Actors.tsx`
- Card: `src/components/ActorCard.tsx`
