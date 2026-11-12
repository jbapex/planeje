#!/usr/bin/env node
/**
 * Testes automatizados Briefing Obrigatório v1.1 estágio A
 * Spec §10: 1, 3, 4, 7, 8, 9, 12, 13, 14, 16, 17
 * (mapeados aos itens do prompt: 1–11 da lista de aceite)
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildBriefingColumns,
  countsAsPlanejado,
  emptyBriefingPayload,
  taskPostCaption,
  validateBriefing,
} from '../src/lib/briefingObrigatorio.js';
import {
  aggregateCobertura,
  computeCoberturaMensal,
  monthBounds,
} from '../src/lib/coberturaMensal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const raw = readFileSync(join(root, 'planeje-mcp/.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const basePayload = () => ({
  ...emptyBriefingPayload(),
  objetivo: 'vender',
  data_uso: '2026-08-20',
  responsavel_id: '00000000-0000-0000-0000-000000000001',
  criterio_pronto: 'Cliente aprova no WhatsApp',
});

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error('   ', e.message);
    process.exitCode = 1;
  }
}

// --- unitários (sempre) ---

test('1. Arte sem copy_final: aviso, completo=false, não bloqueia', () => {
  const r = validateBriefing({
    type: 'arte',
    title: 'Post Dia dos Pais',
    description: '',
    payload: { ...basePayload(), copy_final: '', cta: 'Compre já', formato: 'feed' },
    estado: 'completo',
  });
  assert.equal(r.ok, true);
  assert.equal(r.completo, false);
  assert.ok(r.missing.includes('copy_final'));
});

test('3. Tráfego recorrente isento → completo', () => {
  const r = validateBriefing({
    type: 'paid_traffic',
    title: 'Verba diária',
    payload: {},
    estado: 'rascunho',
  });
  assert.equal(r.completo, true);
  assert.equal(r.missing.length, 0);
});

test('4. Rascunho vazio salva (buildBriefingColumns)', () => {
  const cols = buildBriefingColumns({
    type: 'arte',
    title: 'X',
    description: '',
    payload: emptyBriefingPayload(),
    estado: 'rascunho',
    isNew: true,
  });
  assert.equal(cols.briefing_estado, 'rascunho');
  assert.equal(cols.briefing_completo, false);
  assert.equal(cols.briefing_legado, false);
});

test('5. objetivo=ok rejeitado (aviso)', () => {
  const r = validateBriefing({
    type: 'arte',
    title: 'Título longo o suficiente',
    payload: {
      ...basePayload(),
      objetivo: 'ok',
      formato: 'feed',
      copy_final: 'a'.repeat(45),
      cta: 'Clique aqui',
    },
    estado: 'completo',
  });
  assert.ok(r.missing.includes('objetivo') || r.warnings.some((w) => /objetivo/i.test(w)));
});

test('6. copy_final igual ao título rejeitado', () => {
  const title = 'Arte especial da semana com oferta';
  const r = validateBriefing({
    type: 'arte',
    title,
    payload: {
      ...basePayload(),
      formato: 'feed',
      copy_final: title,
      cta: 'Saiba mais',
    },
    estado: 'completo',
  });
  assert.ok(r.missing.includes('copy_final'));
});

test('6b. Legenda do post vem da tarefa ou do material do plano', () => {
  assert.equal(taskPostCaption({ copy_final: '  Texto do post  ' }), 'Texto do post');
  assert.equal(
    taskPostCaption({ briefing_payload: { plan_material: { legenda: 'Do plano' } } }),
    'Do plano',
  );
  assert.equal(
    taskPostCaption({
      briefing_payload: { copy_final: 'Da tarefa', plan_material: { legenda: 'Do plano' } },
    }),
    'Da tarefa',
  );
  assert.equal(taskPostCaption({ description: 'Orientação, não legenda' }), '');
});

test('7. Carrossel qtd_slides=1 rejeitado', () => {
  const r = validateBriefing({
    type: 'carrossel',
    title: 'Carrossel',
    payload: {
      ...basePayload(),
      formato: '1:1',
      copy_final: 'a'.repeat(45),
      cta: 'Veja mais',
      qtd_slides: 1,
    },
    estado: 'completo',
  });
  assert.ok(r.missing.includes('qtd_slides'));
});

test('8. Vídeo data_gravacao > data_uso rejeitado', () => {
  const r = validateBriefing({
    type: 'video',
    title: 'Reels',
    payload: {
      ...basePayload(),
      data_uso: '2026-08-10',
      data_gravacao: '2026-08-15',
      gancho: 'a'.repeat(25),
      roteiro: 'b'.repeat(85),
      quem_grava: 'cliente',
      duracao_alvo_seg: 30,
    },
    estado: 'completo',
  });
  assert.ok(r.missing.includes('data_gravacao'));
});

test('2/12. Legada sem briefing completo: conta planejada; description define completo', () => {
  assert.equal(
    countsAsPlanejado({
      briefing_legado: true,
      briefing_completo: false,
      type: 'arte',
    }),
    true,
  );
  const cols = buildBriefingColumns({
    type: 'arte',
    title: 'L',
    description: 'tem texto',
    payload: {},
    estado: 'rascunho',
    existingLegado: true,
    isNew: false,
  });
  assert.equal(cols.briefing_completo, true);
});

test('16. Rascunho novo não entra em planejado', () => {
  assert.equal(
    countsAsPlanejado({
      briefing_legado: false,
      briefing_completo: false,
      briefing_estado: 'rascunho',
      type: 'arte',
    }),
    false,
  );
});

test('17. Completo conta como planejado', () => {
  assert.equal(
    countsAsPlanejado({
      briefing_legado: false,
      briefing_completo: true,
      briefing_estado: 'completo',
      type: 'arte',
    }),
    true,
  );
});

test('Rascunho→cobertura: planejado não muda, rascunho +1, cliente descoberto', () => {
  const cliente = {
    id: 'c1',
    empresa: 'Teste',
    valor: 2000,
    tipo_servico: 'execucao_completa',
    entregaveis: { posts: 4, videos: 0, stories: 0, anuncios: 0, carrosseis: 0 },
    responsavel: null,
  };
  const base = computeCoberturaMensal({
    clientes: [cliente],
    tarefas: [],
    projetos: [],
    profilesById: new Map(),
    mesRef: '2026-08-01',
  });
  const withDraft = computeCoberturaMensal({
    clientes: [cliente],
    tarefas: [
      {
        id: 't1',
        client_id: 'c1',
        due_date: '2026-08-10',
        type: 'arte',
        status: 'todo',
        briefing_legado: false,
        briefing_completo: false,
        briefing_estado: 'rascunho',
      },
    ],
    projetos: [],
    profilesById: new Map(),
    mesRef: '2026-08-01',
  });
  assert.equal(base[0].planejado, 0);
  assert.equal(withDraft[0].planejado, 0);
  assert.equal(withDraft[0].planejado_rascunho, 1);
  assert.equal(withDraft[0].status_cobertura, 'descoberto');

  const promoted = computeCoberturaMensal({
    clientes: [cliente],
    tarefas: [
      {
        id: 't1',
        client_id: 'c1',
        due_date: '2026-08-10',
        type: 'arte',
        status: 'todo',
        briefing_legado: false,
        briefing_completo: true,
        briefing_estado: 'completo',
      },
    ],
    projetos: [],
    profilesById: new Map(),
    mesRef: '2026-08-01',
  });
  assert.equal(promoted[0].planejado, 1);
  assert.equal(promoted[0].planejado_rascunho, 0);
});

// --- integração / aceite #14 ---
async function testCoverageUnchanged() {
  const env = loadEnv();
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { mesRef, inicio, fim } = monthBounds('2026-08-01');

  const { data: beforeAgg, error: beforeErr } = await sb.rpc('resumo_cobertura_agregado', {
    p_mes: mesRef,
    p_exigir_responsavel_ativo: false,
  });
  if (beforeErr) throw beforeErr;
  const before = Array.isArray(beforeAgg) ? beforeAgg[0] : beforeAgg;
  const beforePct = before?.cobertura_geral;

  // Se migration já aplicada, RPC já inclui novos campos — percent deve ser estável
  // Compara com cálculo local tratando sem coluna como legado
  const [{ data: clientes }, { data: tarefas }, { data: projetos }, { data: profiles }] =
    await Promise.all([
      sb
        .from('clientes')
        .select('id, empresa, etapa, valor, tipo_servico, tipo_contrato, entregaveis, responsavel')
        .eq('etapa', 'closed'),
      sb
        .from('tarefas')
        .select(
          'id, client_id, project_id, status, due_date, type, description, briefing_completo, briefing_legado, briefing_estado',
        )
        .gte('due_date', inicio)
        .lte('due_date', fim)
        .not('client_id', 'is', null),
      sb
        .from('projetos')
        .select('id, client_id, mes_referencia, status')
        .not('mes_referencia', 'is', null)
        .gte('mes_referencia', inicio)
        .lte('mes_referencia', fim),
      sb
        .from('profiles')
        .select('id, full_name, role, status')
        .in('role', ['superadmin', 'admin', 'colaborador']),
    ]);

  const rows = computeCoberturaMensal({
    clientes,
    tarefas: (tarefas || []).map((t) => ({
      ...t,
      // pré-migration: undefined legado → true
      briefing_legado: t.briefing_legado ?? true,
    })),
    projetos,
    profilesById: new Map((profiles || []).map((p) => [p.id, p])),
    mesRef,
  });
  const local = aggregateCobertura(rows, mesRef);

  console.log(
    `INFO cobertura RPC=${beforePct} local=${local.cobertura_geral} planejado_rpc=${before?.planejado_total} local=${local.planejado_total}`,
  );

  // #14: com legado, local deve bater com RPC atual (mesma regra de contagem de planejado)
  assert.equal(
    local.cobertura_geral,
    beforePct,
    `Cobertura divergiu: RPC ${beforePct} vs local ${local.cobertura_geral}`,
  );
  console.log('OK  14. Cobertura ago idêntica RPC ↔ local (legado)');
  passed += 1;
}

await testCoverageUnchanged().catch((e) => {
  console.error('FAIL 14. Cobertura', e.message);
  process.exitCode = 1;
});

console.log(`\n${passed} testes ok`);
