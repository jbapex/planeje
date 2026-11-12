#!/usr/bin/env bash
# Aplica migration do RPC admin_cleanup_team_user via psql (quando DATABASE_URL está definida).

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702180000_admin_delete_team_user_rpc.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702190000_admin_delete_team_user_client_documents.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702200000_admin_delete_team_user_detach_fks.sql
echo "✅ Migrations admin_delete_team_user aplicadas."
