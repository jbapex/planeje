import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const raw = readFileSync(new URL('../planeje-mcp/.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  raw
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const POLIANA = '4628a3b6-7e34-4753-b46c-8e068608b802';
const RAFAEL = '3b248b66-6782-4dae-b647-b50ba4332463';
const MAXIFARMA_CONV = 'efae109b-6b1e-4357-b591-9a162acabff4';
const ENCANTO_CONV = '52add7a4-1b4d-4446-80bf-cb0abcbf52b4';
const JB_APEX = 'a02d4491-d6b1-41f6-bf57-7c252f798c16';
const AGENCY = 'a02d4491-d6b1-41f6-bf57-7c252f798c16';

function fail(msg) {
  console.error('FALHOU:', msg);
  process.exitCode = 1;
}

const { data: poliana } = await sb.from('profiles').select('id, full_name, status').eq('id', POLIANA).single();
const { data: rafael } = await sb.from('profiles').select('id, full_name, status').eq('id', RAFAEL).single();
console.log('Poliana', poliana);
console.log('Rafael', rafael);

const { data: represented, error: repErr } = await sb.rpc('caixa_cliente_representado', {
  p_cliente_id: AGENCY,
  p_display_name: 'MKT - Maxifarma',
});
if (repErr) fail(`caixa_cliente_representado: ${repErr.message}`);
const { data: empresa } = await sb.rpc('caixa_empresa_exibicao', {
  p_cliente_id: AGENCY,
  p_display_name: 'MKT - Maxifarma',
});
console.log('Maxifarma representado', represented, 'empresa', empresa);
if (String(empresa || '').toUpperCase().includes('JB APEX')) fail('empresa não pode ser JB APEX');
if (!String(empresa || '').toLowerCase().includes('maxifarma')) fail('empresa deveria ser Maxifarma');

const { data: encEmpresa } = await sb.rpc('caixa_empresa_exibicao', {
  p_cliente_id: AGENCY,
  p_display_name: 'MKT - Encanto Moda Festas',
});
console.log('Encanto empresa', encEmpresa);
if (String(encEmpresa || '').toUpperCase().includes('JB APEX')) fail('Encanto empresa não pode ser JB APEX');

const { data: maxiNeed, error: maxiNeedErr } = await sb.rpc('caixa_conversa_precisa_resposta_id', {
  p_id: MAXIFARMA_CONV,
});
const { data: encNeed, error: encNeedErr } = await sb.rpc('caixa_conversa_precisa_resposta_id', {
  p_id: ENCANTO_CONV,
});
if (maxiNeedErr) fail(`precisa Maxifarma: ${maxiNeedErr.message}`);
if (encNeedErr) fail(`precisa Encanto: ${encNeedErr.message}`);
console.log('precisa_resposta Maxifarma', maxiNeed, 'Encanto', encNeed);
if (maxiNeed !== true) fail('Maxifarma deveria abrir fila 2');
if (encNeed !== false) fail('Encanto não deveria abrir fila 2 por recado interno');

const { data: caixaPoliana, error: listErr } = await sb.rpc('listar_pendencias_caixa', {
  p_pessoa_id: POLIANA,
});
if (listErr) fail(`listar Poliana: ${listErr.message}`);
console.log('listar Poliana', {
  status: poliana?.status,
  badge: caixaPoliana?.badge_total,
  titulos: (caixaPoliana?.itens || []).map((i) => ({
    fila: i.fila,
    titulo: i.conversation_name || i.task_title,
    empresa: i.empresa,
  })),
});

if (poliana?.status !== 'active') {
  if (Number(caixaPoliana?.badge_total) !== 0) fail('pending não pode ter badge');
} else {
  const maxi = (caixaPoliana?.itens || []).find((i) => i.conversation_id === MAXIFARMA_CONV);
  if (!maxi) fail('Poliana active deveria ver Maxifarma');
  if (!String(maxi.conversation_name || '').includes('Maxifarma')) fail('título deveria ser o grupo');
  if (String(maxi.empresa || '').toUpperCase().includes('JB APEX')) fail('card não pode mostrar JB APEX');
  if (!String(maxi.empresa || '').toLowerCase().includes('maxifarma')) fail('secundário deveria ser Maxifarma');
}

const { data: caixaRafael } = await sb.rpc('listar_pendencias_caixa', { p_pessoa_id: RAFAEL });
const encantoNaFila2 = (caixaRafael?.itens || []).some(
  (i) => i.conversation_id === ENCANTO_CONV && i.fila === 'cliente_sem_resposta'
);
console.log('Rafael badge', caixaRafael?.badge_total, 'Encanto na fila 2', encantoNaFila2);
if (encantoNaFila2) fail('Encanto do Rafael não pode entrar na fila 2');

const { data: oldMaxi } = await sb
  .from('atendimento_conversas')
  .select('id, archived_at, last_message_at')
  .eq('chat_jid', '120363322984677662@g.us')
  .eq('cliente_id', JB_APEX);
console.log('canais Maxifarma', oldMaxi);
const live = (oldMaxi || []).filter((c) => !c.archived_at);
if (live.length !== 1) fail(`um grupo = um canal vivo (vivos=${live.length})`);

console.log(process.exitCode ? 'VALIDAÇÃO COM FALHAS' : 'VALIDAÇÃO OK');
