import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyKnowledgeSections, knowledgeSections, compileKnowledgeSections, knowledgeCoverage } from '../../supabase/functions/_shared/crmIaKnowledge.js';

test('base antiga conserva texto exato em Contexto adicional sem inferir empresa', () => {
  for (const conteudo of ['', '  Texto anterior\ncom preço R$ 10 e café 👩🏽‍💻.\n', '\n  ']) {
    const sections = knowledgeSections({ conteudo });
    assert.equal(sections.context, conteudo);
    assert.equal(sections.company.name, '');
    assert.equal(compileKnowledgeSections(sections), conteudo);
  }
});

test('cinco seções compilam na ordem e cobertura usa conteúdo preenchido', () => {
  const sections = emptyKnowledgeSections();
  sections.company = { ...sections.company, name: 'Empresa fictícia', sector: 'Serviços', about: 'Atende negócios.', email: 'equipe@example.invalid' };
  sections.hours = [{ days: 'Seg–Sex', start: '09:00', end: '18:00' }];
  sections.faq = [{ question: 'Como falar?', answer: 'Pelo canal informado.' }];
  sections.policies = [{ title: 'Cancelamento', content: 'Confirme com a equipe.' }];
  sections.context = 'Confirme informações ausentes.';
  assert.equal(compileKnowledgeSections(sections), 'Empresa\nNome: Empresa fictícia\nSetor: Serviços\nSobre a empresa: Atende negócios.\nE-mail: equipe@example.invalid\n\nAtendimento\nSeg–Sex: 09:00–18:00\n\nPerguntas frequentes\nPergunta: Como falar?\nResposta: Pelo canal informado.\n\nPolíticas\nCancelamento\nConfirme com a equipe.\n\nContexto adicional\nConfirme informações ausentes.');
  assert.equal(knowledgeCoverage(sections), 5);
});

test('rascunhos incompletos não inventam respostas nem contam cobertura', () => {
  const sections = emptyKnowledgeSections();
  sections.hours = [{ days: '', start: '09:00', end: '18:00' }];
  sections.faq = [{ question: 'Pergunta pendente', answer: '' }];
  sections.policies = [{ title: 'Sem orientação', content: '' }];
  assert.equal(knowledgeCoverage(sections), 0);
  assert.equal(compileKnowledgeSections(sections), '');
});

test('hidratação de estrutura não compartilha mutações nem apaga texto sem estrutura válida', () => {
  const saved = emptyKnowledgeSections();
  saved.company.name = 'Persistida';
  const draft = knowledgeSections({ conteudo: 'Compilado', crm_ia_sections: saved });
  draft.company.name = 'Editada';
  draft.faq.push({ question: 'Nova', answer: 'Resposta' });
  assert.equal(saved.company.name, 'Persistida');
  assert.deepEqual(saved.faq, []);
  assert.equal(knowledgeSections({ conteudo: 'Legado seguro', crm_ia_sections: { company: null } }).context, 'Legado seguro');
  assert.equal(knowledgeCoverage(emptyKnowledgeSections()), 0);
});
