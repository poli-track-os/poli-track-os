#!/usr/bin/env bash
# Deploy all ingestion assets to the linked Supabase project.
#
# Prereqs (one-time):
#   1. Install the Supabase CLI:    https://supabase.com/docs/guides/cli
#   2. supabase login               (OAuth in browser)
#   3. supabase link --project-ref jwhffgsoigbgshwkkxta
#
# Then run this script from the repo root:
#   bash scripts/deploy-supabase.sh
#
# What it does, in order:
#   1. supabase db push              — applies every migration under supabase/migrations
#   2. supabase functions deploy ... — deploys every edge function under supabase/functions
#
# The functions use the service_role key already stored as a Supabase
# function secret (Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
# automatically — you don't need to set them here).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found. Install it from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if [ ! -f supabase/config.toml ]; then
  echo "error: supabase/config.toml missing. Run 'supabase link --project-ref jwhffgsoigbgshwkkxta' first." >&2
  exit 1
fi

echo "==> Applying database migrations"
supabase db push

FUNCTIONS=(
  scrape-eu-parliament
  scrape-national-parliament
  enrich-wikipedia
  scrape-twitter
  scrape-un-votes
  scrape-eu-legislation
  scrape-mep-committees
  scrape-mep-reports
  scrape-mep-declarations
  seed-positions
  seed-associations
)

echo "==> Deploying ${#FUNCTIONS[@]} edge functions"
for fn in "${FUNCTIONS[@]}"; do
  echo "    -> $fn"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo
echo "==> Done. You can now trigger the ingest workflow:"
echo "    gh workflow run ingest.yml -f target=eu-parliament"
echo "    (or via https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track/actions/workflows/ingest.yml)"
