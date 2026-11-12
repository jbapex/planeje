#!/bin/bash
# Aplica migration de tokens MCP por usuário da equipe.
# Uso: DATABASE_URL='postgresql://...' bash scripts/apply-mcp-user-tokens-migration.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL (postgresql://postgres.[ref]:SENHA@...pooler.supabase.com:6543/postgres)"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260811120000_mcp_user_tokens.sql
echo "✅ Migration 20260811120000_mcp_user_tokens aplicada."
