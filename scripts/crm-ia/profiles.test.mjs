import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrmIaPrompt, parseCrmIaModelResult, validateCrmIaAction } from '../../supabase/functions/_shared/crmIaAgent.js';

const id = '00000000-0000-4000-8000-000000000081';
const profile = { id, nome: 'Decidido', cor: '#aabbcc', descricao: 'Já conhece a proposta e deseja contratar.', pistas: ['quero contratar'], actions: { owner_id: '00000000-0000-4000-8000-000000000001', tags: ['Pronto'] } };
const rules = { tipo: 'qualificacao', profiles: [profile] };

test('profile_id aceita somente um perfil publicado em answer ou qualify', () => {
  for (const type of ['answer', 'qualify']) {
    const action = parseCrmIaModelResult(JSON.stringify({ text: 'Vamos continuar.', action: { type, profile_id: id } })).action;
    assert.equal(validateCrmIaAction({ action, rules }).profile_id, id);
  }
  for (const action of [{ type: 'answer', profile_id: null }, { type: 'answer', profile_id: {} }, { type: 'answer', profile_id: 'outro' }, { type: 'handoff', profile_id: id }]) {
    assert.throws(() => validateCrmIaAction({ action, rules }), /profile/);
  }
  assert.throws(() => validateCrmIaAction({ action: { type: 'answer', profile_id: id }, rules: { ...rules, tipo: 'followup' } }), /profile/);
  assert.throws(() => validateCrmIaAction({ action: { type: 'answer', profile_id: id }, rules: { ...rules, profiles: [] } }), /profile/);
  assert.equal(validateCrmIaAction({ action: { type: 'answer' }, rules }).profile_id, undefined);
});

test('prompt mostra critérios publicados sem expor ações e exige evidência antes de propor perfil', () => {
  const prompt = buildCrmIaPrompt({ agent: { nome: 'Qualificador', funil: { crm_ia: rules } } });
  assert.match(prompt, /profile_id/);
  assert.match(prompt, /Já conhece a proposta/);
  assert.match(prompt, /quero contratar/);
  assert.match(prompt, /evidência/);
  assert.doesNotMatch(prompt, /owner_id|000000000001|"tags"/);
  assert.doesNotMatch(buildCrmIaPrompt({ agent: { nome: 'Retomada', funil: { crm_ia: { ...rules, tipo: 'followup' } } } }), /Já conhece a proposta/);
});
