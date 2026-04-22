#!/usr/bin/env bash
# Deploy database migrations plus every tracked edge function to the linked
# Supabase project.
#
# Local prerequisites:
#   1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
#   2. supabase login
#   3. supabase link --project-ref zygnkwyogazhwxfeatfc
#
# CI prerequisites:
#   - SUPABASE_ACCESS_TOKEN
#   - SUPABASE_DB_PASSWORD
#
# Usage:
#   bash scripts/deploy-supabase.sh
#
# Optional env:
#   SUPABASE_PROJECT_REF   Override project ref from supabase/config.toml
#   SUPABASE_DB_PASSWORD   Remote Postgres password for non-interactive db push
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found. Install it from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if [ ! -f supabase/config.toml ]; then
  echo "error: supabase/config.toml missing. Run 'supabase link --project-ref zygnkwyogazhwxfeatfc' first." >&2
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-$(awk -F'"' '/^project_id = "/ { print $2; exit }' supabase/config.toml)}"
if [ -z "$PROJECT_REF" ]; then
  echo "error: could not determine Supabase project ref from supabase/config.toml" >&2
  exit 1
fi

echo "==> Applying database migrations to $PROJECT_REF"
DB_PUSH_CMD=(supabase db push --linked)
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  DB_PUSH_CMD+=(--password "$SUPABASE_DB_PASSWORD")
fi
"${DB_PUSH_CMD[@]}"

FUNCTIONS=()
while IFS= read -r dir; do
  if [ -f "$dir/index.ts" ]; then
    FUNCTIONS+=("$(basename "$dir")")
  fi
done < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_shared' | LC_ALL=C sort)

if [ "${#FUNCTIONS[@]}" -eq 0 ]; then
  echo "error: no deployable edge functions found under supabase/functions" >&2
  exit 1
fi

echo "==> Deploying ${#FUNCTIONS[@]} edge functions"
for fn in "${FUNCTIONS[@]}"; do
  echo "    -> $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt
done

echo
echo "==> Done. Schema and edge functions are current on $PROJECT_REF."
