import test from 'node:test';
import assert from 'node:assert/strict';
import { clientScopeReference, clientScopeUrl, newClientMonthlyScope, scopeDeliverables, scopeReferenceMonth } from '../src/lib/clientMonthlyScopes.js';

test('mês do projeto mantém o mês declarado, inclusive com offset', () => {
  assert.equal(scopeReferenceMonth('2026-09-01T00:00:00+03:00'), '2026-09-01');
  assert.equal(scopeReferenceMonth('2026-09'), '2026-09-01');
  assert.equal(scopeReferenceMonth('2026-13-01'), null);
  assert.equal(scopeReferenceMonth(null), null);
  assert.equal(scopeReferenceMonth(new Date('invalid')), null);
});

test('referência contratual usa entregas e metas existentes sem inventar verba', () => {
  const reference = clientScopeReference({ tipo_servico: 'execucao_completa', entregaveis: { posts: 8, videos: 4 }, objetivo_meta: 'mensagens', meta_custo_mensagem: 12, limite_meta: 300 });
  assert.equal(reference.deliverables.posts, 8);
  assert.equal(reference.media_goals.meta_custo_mensagem, 12);
  assert.equal(reference.media_goals.budget, undefined);
});

test('um novo mês preserva quantidades e metas, sem transferir exceção ou aprovação', () => {
  const previous = { id: 'scope-before', deliverables: { posts: 8, videos: 4 }, channels: ['Instagram'], media_goals: { budget: 800, custom: 'preservar' }, scope_exceptions: 'extra só em agosto', plan_status: 'approved' };
  const draft = newClientMonthlyScope({ id: 'client-1' }, '2026-09', previous);
  assert.equal(draft.client_id, 'client-1');
  assert.equal(draft.reference_month, '2026-09-01');
  assert.equal(draft.cloned_from_scope_id, 'scope-before');
  assert.equal(draft.deliverables.posts, 8);
  assert.equal(draft.media_goals.budget, 800);
  assert.equal(draft.media_goals.custom, 'preservar');
  assert.equal(draft.scope_exceptions, '');
  assert.equal(draft.plan_status, 'planning');
  draft.deliverables.posts = 1; draft.channels.push('Facebook'); draft.media_goals.budget = 100;
  assert.equal(previous.deliverables.posts, 8);
  assert.deepEqual(previous.channels, ['Instagram']);
  assert.equal(previous.media_goals.budget, 800);
});

test('quantidades inválidas não viram entregas negativas, fracionadas ou infinitas', () => {
  assert.deepEqual(scopeDeliverables({ posts: -2, videos: '4', carrosseis: 2.5, stories: Infinity, anuncios: 'não numérico' }), { posts: 0, carrosseis: 2, videos: 4, stories: 0, anuncios: 0 });
});

test('link direciona a ficha do cliente ao mesmo período', () => {
  assert.equal(clientScopeUrl('client-1', '2026-09-23'), '/clients/client-1?section=escopo&month=2026-09');
  assert.equal(clientScopeUrl(null, '2026-09'), '/clients');
  assert.equal(clientScopeUrl('client-1', null), '/clients/client-1?section=escopo');
});
