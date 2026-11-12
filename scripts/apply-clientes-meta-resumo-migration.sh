#!/usr/bin/env bash
# Aplica coluna clientes.meta_resumo via psql.
set -euo pipefail
cd "$(dirname "$0")/.."

SQL="supabase/migrations/20260825180000_clientes_meta_resumo.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL ou cole o SQL no Dashboard → SQL Editor:"
  echo "  $SQL"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL"
echo "OK: coluna clientes.meta_resumo aplicada."
