import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { databaseFixture, ids } from './database-fixture.mjs';

test('ensino, correção e retirada usam Memória Atlas nativa com aprovação atômica', () => {
  const db = databaseFixture();
  try {
    db.start();
    db.sql('CREATE TABLE public.traffic_client_ops(client_id uuid,primary_assignee_id uuid);CREATE TABLE public.traffic_client_access(client_id uuid,profile_id uuid)');
    const traffic = readFileSync(new URL('../../supabase/migrations/20260826010000_central_trafego_fase1.sql', import.meta.url), 'utf8');
    for (const name of ['central_trafego_caller_role', 'central_trafego_is_admin', 'central_trafego_is_gestor', 'central_trafego_has_explicit_access', 'central_trafego_can_access_client']) {
      db.sql(traffic.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
    }
    db.sql('ALTER TABLE public.atlas_memories ADD COLUMN learning_kind text DEFAULT \'rule\', ADD COLUMN source_quote text');
    const source = readFileSync(new URL('../../supabase/migrations/20261028115736_atlas_observed_learning.sql', import.meta.url), 'utf8');
    db.sql(source.match(/CREATE OR REPLACE FUNCTION public\.atlas_save_memory[\s\S]*?END \$\$;/)[0]);
    const prepare = (action, payload, before = null) => {
      const { run } = db.newRun({ client: null });
      return db.store(run, crypto.randomUUID(), { kind: 'proposal', app: 'atlas', action, title: 'Conhecimento fictício', payload, before, preview: {}, effect: { external: false } });
    };
    const item = prepare('save_memory', { content: 'Preferência fictícia.', replaces_id: null, expected_version: null });
    assert.equal(db.sql('SELECT count(*) FROM public.atlas_memories'), '0');
    const done = db.decide(item, 'approve');
    assert.equal(done.state, 'completed'); assert.ok(done.result.memory_id);
    assert.deepEqual(db.decide(item, 'approve').result, done.result);
    assert.equal(db.sql('SELECT count(*) FROM public.atlas_memories'), '1');
    const original = JSON.parse(db.sql(`SELECT to_jsonb(m) FROM public.atlas_memories m WHERE id='${done.result.memory_id}'`));
    const edit = prepare('save_memory', { content: 'Preferência corrigida.', replaces_id: original.id, expected_version: 1 }, original);
    const edited = db.decide(edit, 'approve');
    assert.equal(edited.state, 'completed'); assert.equal(edited.result.version, 2);
    assert.equal(db.sql(`SELECT state FROM public.atlas_memories WHERE id='${original.id}'`), 'replaced');
    assert.equal(db.sql(`SELECT source_quote FROM public.atlas_memories WHERE id='${edited.result.memory_id}'`), 'Preferência corrigida.');
    const stale = prepare('revoke_memory', { id: original.id, expected_version: 1 }, original);
    assert.equal(db.decide(stale, 'approve').state, 'conflict');
    const revoke = prepare('revoke_memory', { id: edited.result.memory_id, expected_version: 2 });
    const revoked = db.decide(revoke, 'approve'); assert.equal(revoked.state, 'completed');
    assert.equal(db.sql(`SELECT state FROM public.atlas_memories WHERE id='${edited.result.memory_id}'`), 'revoked');
    const snapshot = JSON.parse(db.asUser(`SELECT public.atlas_executor_memory_snapshot(NULL,NULL)`));
    assert.equal(snapshot.rows.length, 0);
    const foreign = JSON.parse(db.sql(`INSERT INTO public.atlas_memories(owner_id,client_id,content) VALUES('${ids.staff}','${ids.client}','Memória alheia.') RETURNING to_jsonb(atlas_memories)`));
    const forged = prepare('revoke_memory', { id: foreign.id, expected_version: 1 });
    assert.throws(() => db.decide(forged, 'approve'), /42501/);
    const unknown = prepare('save_memory', { content: 'Texto', replaces_id: null, expected_version: null, team_shared: true });
    assert.equal(db.decide(unknown, 'approve').state, 'failed');
    assert.equal(db.sql(`SELECT count(*) FROM public.atlas_memories WHERE content='Texto'`), '0');
    db.sql(`UPDATE public.profiles SET role='colaborador' WHERE id='${ids.admin}';INSERT INTO public.user_module_access VALUES('${ids.admin}','crm','responsible')`);
    assert.throws(() => db.asUser(`SELECT public.atlas_executor_memory_snapshot('${ids.client}',NULL)`), /42501/);
  } finally { db.stop(); }
});
