#!/usr/bin/env bash
# Aplica colunas cidade/estado em public.clientes via psql.
set -euo pipefail
cd "$(dirname "$0")/.."

SQL="supabase/migrations/20260816140000_clientes_cidade_estado.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  echo "Ou cole o SQL no Dashboard → SQL Editor:"
  echo "  $SQL"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL"
echo "OK: colunas clientes.estado e clientes.cidade aplicadas."
