#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SQL="supabase/migrations/20260901220000_equipe_agencia_remetentes_internos.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL ou cole no SQL Editor:"
  echo "  $SQL"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL"
echo "OK: equipe da agência cadastrada como remetentes internos globais."
