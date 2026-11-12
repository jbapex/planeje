#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL ou cole no SQL Editor:"
  echo "  supabase/migrations/20260827140000_solicitacoes_admin_delete.sql"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260827140000_solicitacoes_admin_delete.sql

echo "OK: exclusão de solicitações liberada para admin/superadmin."
