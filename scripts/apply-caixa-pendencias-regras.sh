#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  echo "Ou cole no Dashboard → SQL Editor:"
  echo "  supabase/migrations/20260823120000_caixa_pendencias_regras.sql"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260823120000_caixa_pendencias_regras.sql

echo "OK: regras da Caixa aplicadas (active, fila 2, 7 dias, arquivar, nomes)."
