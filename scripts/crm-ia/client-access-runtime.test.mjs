import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

test('CRM runtime checks account access before context and again before model cost', async t => {
  const folder = await mkdtemp('/tmp/crm-access-runtime-');
  try {
    const output = join(folder, 'runtime.mjs');
    await build({ entryPoints: ['supabase/functions/_shared/crmIaRuntime.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
    const { runCrmIaAgent } = await import(pathToFileURL(output));
    const agent = { id: 'agent', nome: 'Atendimento', modelo: 'openai/gpt-4o-mini', ativo: true, funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline', stage_ids: ['entry'], variaveis: [] } } };
    let checks, models, contextReads, grants, typed;
    const db = {
      async rpc(name) { assert.equal(name, 'crm_ia_runtime_access'); return { data: { allowed: grants[checks++] === true }, error: null }; },
      from(table) {
        if (table !== 'cliente_atend_ia_agentes') contextReads++;
        const rows = table === 'cliente_atend_ia_agentes' ? typed ? [agent] : [] : table === 'crm_ia_config' ? [{ data: {} }] : [];
        let single = false;
        const query = { select() { return query; }, insert() { return query; }, eq() { return query; }, order() { return query; }, in() { return query; }, limit() { return query; }, maybeSingle() { single = true; return query; }, then(resolve, reject) { return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject); } };
        return query;
      },
    };
    const invoke = () => runCrmIaAgent({ db, clientId: 'client', userId: 'actor', mode: 'testar', agentId: agent.id, previewMessages: [{ role: 'user', content: 'Olá' }], callModel: async () => { models++; return { resposta: '{"text":"Olá","action":{"type":"answer"}}' }; } });
    for (const [name, values, expectedReads] of [['denied initially', [false], 0], ['revoked while reading context', [true, false], 1]]) {
      await t.test(name, async () => {
        checks = models = contextReads = 0; grants = values; typed = true;
        assert.equal((await invoke()).skipped, 'crm_access_revoked');
        assert.equal(models, 0); assert.equal(checks, values.length); assert.ok(contextReads >= expectedReads);
        if (!expectedReads) assert.equal(contextReads, 0);
      });
    }
    await t.test('legacy untyped agents keep their existing path', async () => {
      checks = models = contextReads = 0; grants = []; typed = false;
      assert.equal((await invoke()).handled, false); assert.equal(checks, 0);
    });
  } finally { await rm(folder, { recursive: true, force: true }); }
});
