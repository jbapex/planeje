#!/bin/bash
# Aplica migration do webhook de entrada via psql (quando DATABASE_URL está definida).
# Senha: Supabase Dashboard → Project Settings → Database → Connection string (URI)

set -e
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260526120000_cliente_ingress_webhook.sql
echo "✅ Migration 20260526120000_cliente_ingress_webhook aplicada."
