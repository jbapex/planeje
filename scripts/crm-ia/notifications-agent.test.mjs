import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrmIaPrompt, validateCrmIaAction } from '../../supabase/functions/_shared/crmIaAgent.js';

const rules = { tipo: 'qualificacao', variaveis: [], notification: { enabled: true, recipient: { type: 'phone', phone: '5511000000000' } } };
test('resumo interno usa a mesma geração sem expor destinatário ao modelo', () => {
  const prompt = buildCrmIaPrompt({ agent: { funil: { crm_ia: rules } } });
  assert.match(prompt, /action.summary/);
  assert.doesNotMatch(prompt, /5511000000000/);
  assert.deepEqual(validateCrmIaAction({ action: { type: 'qualify', summary: 'Objetivo confirmado.' }, rules }), { type: 'qualify', summary: 'Objetivo confirmado.' });
  for (const summary of [42, {}, 'x'.repeat(1201)]) assert.throws(() => validateCrmIaAction({ action: { type: 'qualify', summary }, rules }), /summary/);
  assert.throws(() => validateCrmIaAction({ action: { type: 'answer', summary: 'Não é conclusão' }, rules }), /summary/);
});
