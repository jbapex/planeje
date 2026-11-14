import assert from 'node:assert/strict';
import test from 'node:test';
import { squadDatabaseFixture, ids, json } from './squad-database-fixture.mjs';

test('RLS do histórico revalida campos, perfil, módulos e cliente em itens propostos e terminais', async t => {
  const db = squadDatabaseFixture();
  try {
    db.start(); db.apply();
    const proposed = db.store('gestor', 'save_goal', { p_budget_cents: 73500, p_client_id: ids.client });
    const completed = db.store('gestor', 'save_goal', { p_budget_cents: 73500, p_client_id: ids.client });
    db.sql(`UPDATE public.atlas_execution_items SET state='completed',decision='approve',result='{"budget_cents":73500}' WHERE id='${completed.id}'`);
    const question = db.store('gestor', null, {}, null, { kind: 'question', title: 'Qual nome?', fields: [{ id: 'nome', label: 'Nome', type: 'text' }] });
    const status = db.store('gestor', 'update_meta', { adAccountId: 'act_700', objectId: '1234567890123', level: 'adset', status: 'PAUSED' });
    const budget = db.store('gestor', 'update_meta', { adAccountId: 'act_700', objectId: '1234567890123', level: 'adset', daily_budget: 73500 });
    const scope = [proposed.id, completed.id, question.id, status.id, budget.id];
    const visible = () => JSON.parse(db.asUser(`SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.atlas_execution_items WHERE owner_id=auth.uid() AND id=ANY(ARRAY[${scope.map(id => `'${id}'`).join(',')}]::uuid[])`));
    const has = item => visible().includes(item.id);
    const resetFields = () => db.sql('DELETE FROM public.client_field_permissions;DELETE FROM public.user_client_field_permissions');
    assert.equal(visible().length, scope.length);

    await t.test('valor revogado oculta proposta e recibo; pergunta e status sem verba continuam visíveis', () => {
      try {
        db.sql(`INSERT INTO public.user_client_field_permissions VALUES('${ids.admin}','valor',false)`);
        assert.equal(has(proposed), false, 'a proposta conserva orçamento protegido');
        assert.equal(has(completed), false, 'o recibo terminal também conserva orçamento protegido');
        assert.equal(has(budget), false);
        assert.equal(has(question), true); assert.equal(has(status), true);
        assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE conversation_id='${proposed.conversation_id}'`), '0', 'a consulta de history deve obedecer à mesma RLS');
      } finally { resetFields(); }
    });

    await t.test('meta_resumo revogado oculta todos os itens Gestor, inclusive terminais e perguntas', () => {
      try { db.sql(`INSERT INTO public.client_field_permissions VALUES('admin','meta_resumo',false)`); assert.equal(visible().length, 0); }
      finally { resetFields(); }
    });

    await t.test('override pessoal prevalece sobre padrão do perfil para permitir e revogar campos', () => {
      try {
        db.sql(`INSERT INTO public.client_field_permissions VALUES('admin','valor',false);INSERT INTO public.user_client_field_permissions VALUES('${ids.admin}','valor',true)`);
        assert.equal(has(proposed), true); assert.equal(has(completed), true);
        db.sql(`UPDATE public.client_field_permissions SET can_view=true;UPDATE public.user_client_field_permissions SET can_view=false`);
        assert.equal(has(proposed), false); assert.equal(has(completed), false); assert.equal(has(status), true);
      } finally { resetFields(); }
    });

    await t.test('revogar perfil, módulo, cliente ou sessão oculta itens propostos e terminais', () => {
      const checks = [
        [`UPDATE public.profiles SET status='inactive' WHERE id='${ids.admin}'`, `UPDATE public.profiles SET status='active' WHERE id='${ids.admin}'`],
        [`UPDATE public.profiles SET role='cliente' WHERE id='${ids.admin}'`, `UPDATE public.profiles SET role='admin' WHERE id='${ids.admin}'`],
        [`UPDATE public.module_settings SET is_enabled=false WHERE module_name='paid_traffic'`, `UPDATE public.module_settings SET is_enabled=true WHERE module_name='paid_traffic'`],
        [`UPDATE public.module_settings SET is_enabled=false WHERE module_name='assistant'`, `UPDATE public.module_settings SET is_enabled=true WHERE module_name='assistant'`],
        [`DELETE FROM public.fixture_traffic_acl WHERE actor='${ids.admin}'`, `INSERT INTO public.fixture_traffic_acl VALUES('${ids.admin}','${ids.client}')`],
        [`UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='${ids.session}'`, `UPDATE auth.sessions SET not_after=NULL WHERE id='${ids.session}'`],
      ];
      for (const [revoke, restore] of checks) {
        try { db.sql(revoke); assert.equal(visible().length, 0, revoke); }
        finally { db.sql(restore); }
      }
    });

    await t.test('campo revogado recusa nova proposta e aprovação/replay sem alterar o recibo', () => {
      try {
        db.sql(`INSERT INTO public.user_client_field_permissions VALUES('${ids.admin}','valor',false)`);
        assert.throws(() => db.store('gestor', 'save_goal', { p_budget_cents: 73500, p_client_id: ids.client }), /42501/);
        assert.throws(() => db.decide(proposed), /42501/); assert.throws(() => db.decide(completed), /42501/);
        assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${proposed.id}'`), 'proposed');
        assert.equal(db.sql(`SELECT result FROM public.atlas_execution_items WHERE id='${completed.id}'`), '{"budget_cents": 73500}');
        const readOnly = db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${question.id}'`); assert.equal(readOnly, '1');
      } finally { resetFields(); }
    });
    assert.equal(db.sql(`SELECT count(*) FROM public.atlas_execution_items WHERE payload @> ${json({ p_budget_cents: 73500 })}`), '2');
  } finally { db.stop(); }
});
