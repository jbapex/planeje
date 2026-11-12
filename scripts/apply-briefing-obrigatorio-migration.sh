#!/usr/bin/env bash
# Aplica migration Briefing Obrigatório estágio A
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL ou cole no SQL Editor:"
  echo "  supabase/migrations/20260804170000_briefing_obrigatorio_estagio_a.sql"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260804170000_briefing_obrigatorio_estagio_a.sql
echo "OK: briefing estágio A aplicado."
echo "Teste: select public.get_briefing_stage();"
echo "       select cobertura_geral, sem_briefing_total, briefing_completude_pct from public.resumo_cobertura_agregado('2026-08-01');"
