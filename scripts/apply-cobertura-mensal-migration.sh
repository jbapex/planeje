#!/usr/bin/env bash
# Aplica migration de Cobertura Mensal via psql.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  echo "Ou cole o SQL no Dashboard → SQL Editor:"
  echo "  supabase/migrations/20260804160000_resumo_cobertura_mensal.sql"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260804160000_resumo_cobertura_mensal.sql
echo "OK: resumo_cobertura_mensal + resumo_cobertura_agregado aplicados."
echo "Teste: select * from public.resumo_cobertura_agregado('2026-08-01');"
