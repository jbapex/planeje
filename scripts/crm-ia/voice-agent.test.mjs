import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCrmIaAgent, buildCrmIaPrompt } from '../../supabase/functions/_shared/crmIaAgent.js';

test('configuração de voz mantém roteamento e modelo produz apenas texto estruturado', () => {
  for (const audio of ['nunca', { enabled: false, voice: 'alloy', speed: 1 }, { enabled: true, voice: 'cedar', speed: 1.2 }]) {
    const agent = { id: 'agent', nome: 'Assistente', ativo: true, auto_responder: true, funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline', stage_ids: ['stage'], audio } } };
    const selected = selectCrmIaAgent({ agents: [agent], lead: { pipeline_id: 'pipeline', stage_id: 'stage' }, config: { attendance: { auto_send: true } } });
    assert.equal(selected.agent?.id, agent.id);
    const prompt = buildCrmIaPrompt({ agent });
    assert.match(prompt, /texto/);
    assert.doesNotMatch(prompt, /nenhuma voz.*autorizada/);
  }
});
