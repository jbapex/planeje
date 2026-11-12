#!/bin/bash
# Aplica migration Google Drive via psql se DATABASE_URL estiver definida,
# ou imprime o caminho do SQL para colar no SQL Editor.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/supabase/migrations/20260805140000_cliente_google_drive.sql"

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
