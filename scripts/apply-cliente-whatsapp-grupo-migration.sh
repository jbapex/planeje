#!/bin/bash
# Aplica a tabela cliente_whatsapp_grupo (vínculo grupo WhatsApp ↔ ficha do cliente).
# Uso: DATABASE_URL='postgresql://...' bash scripts/apply-cliente-whatsapp-grupo-migration.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/migrations/20260825010000_cliente_whatsapp_grupo.sql"

if [ ! -f "$SQL" ]; then
  echo "Migration não encontrada: $SQL"
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Aplicando via psql..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL"
  echo "OK"
else
  echo "Defina DATABASE_URL ou execute no SQL Editor do Supabase:"
  echo "  $SQL"
fi
