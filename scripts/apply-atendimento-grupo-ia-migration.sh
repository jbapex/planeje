#!/usr/bin/env bash
# Aplica migration de análise IA em grupos via psql (quando DATABASE_URL está definida).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260804140000_atendimento_grupo_ia_analise.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260804150000_atendimento_grupo_remetentes_internos.sql
echo "OK: migrations de IA em grupos aplicadas."
