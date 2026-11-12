import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCrmIaMessage } from '../../supabase/functions/crm-ia/message.js';
import { CRM_IA_VOICE_MODEL, CRM_IA_TTS_VOICES } from '../../supabase/functions/_shared/crmIaVoice.js';
const client = '00000000-0000-4000-8000-000000000011';
function request(token = 'fixture') { return new Request('https://fixture.invalid/crm-ia', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'capabilities', cliente_id: client }) }); }
test('capacidade de voz exige sessão e escopo antes de consultar booleano sem custo', async () => {
  let checks = 0, costs = 0;
  for (const allowed of [false, true]) {
    const response = await handleCrmIaMessage({ req: request(), makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'staff' } } }) }, rpc: async (name, args) => {
      checks++; assert.equal(name, 'crm_ia_workspace'); assert.equal(args.p_action, 'workspace'); assert.equal(args.p_client_id, client);
      return allowed ? { data: { client: { id: client } } } : { error: { code: '42501' } };
    } }), voiceAvailable: () => { costs++; return true; }, db: {}, send: () => assert.fail('capability sent a message') });
    assert.equal(response.status, allowed ? 200 : 403);
    assert.deepEqual(await response.json(), allowed ? { audio: { available: true, input_available: true, model: CRM_IA_VOICE_MODEL, voices: CRM_IA_TTS_VOICES, max_bytes: 4194304 } } : { error: 'Sem acesso a esta conta.' });
  }
  assert.equal(checks, 2); assert.equal(costs, 1);
  const unauth = await handleCrmIaMessage({ req: request(), makeCaller: () => ({ auth: { getUser: async () => ({ error: {} }) } }), voiceAvailable: () => assert.fail('unauth env'), db: {} });
  assert.equal(unauth.status, 401);
});
