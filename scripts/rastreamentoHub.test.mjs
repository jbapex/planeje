import assert from 'node:assert/strict';
import {
  DEFAULT_RASTREAMENTO_TAB,
  RASTREAMENTO_TABS,
  rastreamentoTabHelp,
  rastreamentoTabSearchValue,
  rastreamentoTabSubtitle,
  resolveRastreamentoTab,
} from '../src/lib/rastreamentoHub.js';

assert.equal(DEFAULT_RASTREAMENTO_TAB, 'visao');
assert.equal(
  RASTREAMENTO_TABS.map((tab) => tab.id).join(','),
  'visao,leads,relatorio,eventos,funil,links,integracoes,configuracoes',
);
assert.equal(
  RASTREAMENTO_TABS.filter((tab) => !tab.hidden).map((tab) => tab.id).join(','),
  'visao,leads,relatorio,eventos,links,integracoes,configuracoes',
);
assert.equal(resolveRastreamentoTab(), 'visao');
assert.equal(resolveRastreamentoTab(''), 'visao');
assert.equal(resolveRastreamentoTab('contatos'), 'leads');
assert.equal(resolveRastreamentoTab('CONTATOS'), 'leads');
assert.equal(resolveRastreamentoTab('relatorio'), 'relatorio');
assert.equal(resolveRastreamentoTab('eventos-meta'), 'eventos');
assert.equal(resolveRastreamentoTab('config'), 'configuracoes');
assert.equal(resolveRastreamentoTab('integracoes'), 'integracoes');
assert.equal(resolveRastreamentoTab('links'), 'links');
assert.equal(resolveRastreamentoTab('links-rastreaveis'), 'links');
assert.equal(resolveRastreamentoTab('desconhecida'), 'visao');
assert.equal(rastreamentoTabSearchValue('visao'), null);
assert.equal(rastreamentoTabSearchValue('leads'), 'leads');
assert.equal(rastreamentoTabSearchValue('links'), 'links');
assert.equal(rastreamentoTabSubtitle('contatos').includes('WhatsApp pago'), true);
assert.equal(rastreamentoTabSubtitle('integracoes').includes('Uazapi'), true);
assert.equal(rastreamentoTabSubtitle('links').includes('/r/'), true);
assert.equal(rastreamentoTabSubtitle('eventos').includes('CAPI'), true);
assert.equal(rastreamentoTabSubtitle('configuracoes').includes('gatilho'), true);
assert.ok(rastreamentoTabHelp('visao').includes('conversas reais'));
assert.ok(rastreamentoTabHelp('visao').includes('gatilho'));
assert.ok(rastreamentoTabSubtitle('visao').includes('jornada'));
assert.ok(rastreamentoTabHelp('leads').includes('Google'));
assert.ok(rastreamentoTabHelp('leads').includes('jornada'));
assert.ok(rastreamentoTabHelp('leads').includes('Não responde'));
assert.ok(rastreamentoTabHelp('leads').includes('Qualificado'));
assert.ok(rastreamentoTabHelp('eventos').includes('rede'));
assert.ok(rastreamentoTabHelp('eventos').includes('atribuição'));
assert.ok(rastreamentoTabHelp('links').includes('/r/'));
assert.ok(rastreamentoTabHelp('links').includes('pixel Meta'));
assert.ok(rastreamentoTabHelp('integracoes').includes('Uazapi'));
assert.ok(rastreamentoTabHelp('integracoes').includes('aba Links'));
assert.ok(rastreamentoTabHelp('configuracoes').includes('LeadSubmitted'));
assert.ok(rastreamentoTabHelp('visao').includes('período'));
assert.ok(rastreamentoTabHelp('eventos').includes('Conversas iniciadas'));
assert.ok(rastreamentoTabHelp('configuracoes').includes('Checkout iniciado'));
assert.ok(rastreamentoTabHelp('relatorio').includes('Conversas reais'));
assert.ok(rastreamentoTabHelp('relatorio').includes('Não responde'));
assert.ok(rastreamentoTabSubtitle('relatorio').includes('etiquetas de análise'));

console.log('PASS rastreamento hub tabs');
