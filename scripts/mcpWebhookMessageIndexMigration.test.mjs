import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20261029163156_mcp_webhook_log_evidence_index.sql', 'utf8');

test('webhook evidence projection is private to service role, indexed, and kept current by its trigger', () => {
  for (const fragment of [
    'create table public.cliente_whatsapp_webhook_message_ids',
    'alter table public.cliente_whatsapp_webhook_message_ids enable row level security',
    'revoke all on public.cliente_whatsapp_webhook_message_ids from public, anon, authenticated',
    'grant all on public.cliente_whatsapp_webhook_message_ids to service_role',
    'using gin (message_ids)',
    'private.mcp_webhook_message_ids(payload jsonb)',
    "key in ('messageId', 'messageid', 'message_id', 'id')",
    'security definer',
    'create trigger mcp_sync_webhook_message_ids',
    'after insert or update of raw_payload, cliente_id, created_at',
    "notify pgrst, 'reload schema'",
  ]) assert.ok(sql.includes(fragment), fragment);
  assert.ok(!sql.includes('grant select on public.cliente_whatsapp_webhook_message_ids to authenticated'));
});
