# Running locally

Poli-Track is a React SPA that reads from a Supabase project. Everything visible in the UI is rendered client-side against Supabase tables via TanStack Query.

## Prerequisites

- **Node.js ≥ 22** (a `.nvmrc` is in the repo root)
- **npm ≥ 10**
- A Supabase project URL + anon (publishable) key

## Clone and install

```bash
git clone https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track.git
cd poli-track
npm install
cp .env.example .env
```

`.env.example` ships with the public read credentials used by CI. If you are running against your own Supabase project, edit `.env` locally — don't commit it.

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (safe for the browser) |

The client fails fast with a readable error if either is missing (see [`src/integrations/supabase/client.ts`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/src/integrations/supabase/client.ts)).

## Dev server

```bash
npm run dev
```

Opens on <http://localhost:5173> with HMR. If you hit `EMFILE: too many open files` on Linux, raise the watch limit:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## Other scripts

```bash
npm run build       # Production bundle into dist/
npm run preview     # Serve the built bundle on :8080
npm run test        # Vitest unit tests
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run check       # lint + typecheck + test + build (what CI runs)
```

## Running the ingestion pipeline

The ingesters live as Supabase edge functions in [`supabase/functions/`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/tree/main/supabase/functions). To run them locally you need the Supabase CLI and a local Supabase stack. See [Ingestion Pipeline](Ingestion-Pipeline) for details.

The GitHub Action at [`.github/workflows/ingest.yml`](https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/blob/main/.github/workflows/ingest.yml) runs the same functions on a weekly cron against the hosted Supabase project. It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as repository secrets.
