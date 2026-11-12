/**
 * Testes de domínio da Central de Tráfego — Fase 1.
 * Não conecta no banco e não aplica migration.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CENTRAL_TABLE_WRITE_POLICY,
  autoCreatesReviews,
  buildSituacaoMetrics,
  campaignHasOpenDemand,
  campaignKpisValid,
  canAssignOthers,
  classifyHojeBucket,
  createsCampaignAsset,
  demandRequiresExistingCampaign,
  formatOperationalUpdatedAt,
  evidenceRowValid,
  evidenceRulesForDemand,
  expectedAutoReviews,
  groupHojeBuckets,
  legacyTaskCanComplete,
  minCommentChars,
  normalizePriority,
  operationalDate,
  reviewGenerationKey,
  tryUuid,
  uiAllowed,
  validateCompletionInput,
  validateCreateDemandInput,
  validateLinkedCampaigns,
} from '../src/lib/centralTrafego.js';
import { metaAvailability, formatMetaMetric } from '../src/lib/centralTrafegoMeta.js';
import {
  CHECKUP_DEMAND_TYPE,
  CHECKUP_TABLE_WRITE_POLICY,
  checkupGenerationKey,
  computeBudgetPace,
  defaultRequireActiveCampaign,
  detectCheckupProblems,
  isCheckupDue,
  summarizeCheckupBoard,
  validateCheckupConfirm,
} from '../src/lib/centralTrafegoCheckup.js';
import {
  resolveCampaignTaskIds,
  resolvePrimaryCampaignTaskId,
  legacyTaskIdsFromAdSets,
} from '../src/lib/paidCampaignTaskLinks.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

assert(reviewGenerationKey('t1', 'c1', 'revisao_24h') === 'review:t1:c1:revisao_24h', 'generation_key 24h');
assert(reviewGenerationKey('t1', 'c2', 'revisao_72h') === 'review:t1:c2:revisao_72h', 'generation_key inclui campanha');
assert(
  reviewGenerationKey('t1', 'c1', 'revisao_24h') === reviewGenerationKey('t1', 'c1', 'revisao_24h'),
  'clique duplo usa a mesma generation_key'
);

assert(createsCampaignAsset('nova_campanha'), 'nova_campanha cria ativo');
assert(!createsCampaignAsset('publicacao'), 'publicação não cria ativo novo');

const noDue = validateCreateDemandInput({
  title: 'Pub',
  clientId: 'c1',
  demandType: 'publicacao',
  dueDate: null,
  priority: 'medium',
  assigneeIds: ['u1'],
});
assert(!noDue.ok && noDue.errors.some((e) => /prazo/i.test(e)), 'prazo obrigatório');

const noAssignee = validateCreateDemandInput({
  title: 'Pub',
  clientId: 'c1',
  demandType: 'publicacao',
  dueDate: '2026-08-26',
  priority: 'medium',
  assigneeIds: [],
});
assert(!noAssignee.ok && noAssignee.errors.some((e) => /responsável/i.test(e)), 'responsável obrigatório');

const otherClient = validateLinkedCampaigns('c1', [{ id: 'camp', client_id: 'c2' }]);
assert(!otherClient.ok, 'campanha de outro cliente rejeitada');

const nova = validateCreateDemandInput({
  title: 'Lançar X',
  clientId: 'c1',
  demandType: 'nova_campanha',
  dueDate: '2026-08-26',
  priority: 'high',
  assigneeIds: ['u1'],
  links: [],
  campaign: { name: 'Campanha X', budget: 500, assigneeId: 'u1' },
});
assert(nova.ok && nova.createsCampaign, 'nova_campanha cria tarefa + paid_campaign');

const novaWithExisting = validateCreateDemandInput({
  title: 'Lançar X',
  clientId: 'c1',
  demandType: 'nova_campanha',
  dueDate: '2026-08-26',
  priority: 'high',
  assigneeIds: ['u1'],
  links: [{ paid_campaign_id: 'old', client_id: 'c1' }],
  campaign: { name: 'Campanha X', budget: 500, assigneeId: 'u1' },
});
assert(!novaWithExisting.ok, 'nova_campanha não seleciona campanha existente');

const pubReviews = expectedAutoReviews('publicacao', ['camp-1']);
assert(pubReviews.length === 2, 'publicação cria exatamente 24h e 72h');
assert(
  pubReviews.map((r) => r.demandType).join(',') === 'revisao_24h,revisao_72h',
  'sem terceira tarefa automática'
);
assert(expectedAutoReviews('publicacao', ['c1', 'c2']).length === 4, 'uma revisão 24h e 72h por campanha');
assert(expectedAutoReviews('ajuste', ['c1']).length === 0, 'outros tipos não geram revisões automáticas');
assert(autoCreatesReviews('nova_campanha') && autoCreatesReviews('publicacao'), 'auto reviews só nestes tipos');

const pubManualSuccessor = validateCompletionInput({
  demandType: 'publicacao',
  summary: 'Publiquei o conjunto X',
  nextActionNone: false,
  successorTitle: 'outra coisa',
  successorDueDate: '2026-08-27',
  successorAssigneeIds: ['u1'],
  commentContent: '',
  attachmentIds: [],
  evidenceCampaignIds: ['camp-1'],
});
assert(!pubManualSuccessor.ok, 'publicação não aceita sucessora manual');

const pubNone = validateCompletionInput({
  demandType: 'publicacao',
  summary: 'Publiquei o conjunto X',
  nextActionNone: true,
  successorTitle: '',
  commentContent: '',
  attachmentIds: [],
  evidenceCampaignIds: ['camp-1'],
});
assert(!pubNone.ok, 'publicação não aceita next_action_none');

assert(legacyTaskCanComplete({ task_id: 'old', demand_type: 'outro', source_type: 'legacy' }), 'tarefa antiga com backfill pode concluir');

const legacyComplete = validateCompletionInput({
  demandType: 'outro',
  summary: 'Concluí o legado',
  nextActionNone: true,
  successorTitle: '',
  commentContent: 'Evidência com texto suficiente aqui.',
  attachmentIds: [],
  evidenceCampaignIds: [],
});
assert(legacyComplete.ok, 'legado com evidência e next_action_none conclui');

assert(uiAllowed({ role: 'colaborador', enabled: true, allowlist: [], profileId: 'rafael' }) === false, 'allowlist vazia bloqueia colaborador');
assert(uiAllowed({ role: 'colaborador', enabled: true, allowlist: ['rafael'], profileId: 'rafael' }) === true, 'colaborador na lista entra');
assert(uiAllowed({ role: 'admin', enabled: false, allowlist: [], profileId: 'josias' }) === true, 'admin testa com flag desligada');
assert(uiAllowed({ role: 'colaborador', enabled: false, allowlist: ['rafael'], profileId: 'rafael' }) === false, 'flag off bloqueia colaborador mesmo na lista');

assert(CENTRAL_TABLE_WRITE_POLICY.traffic_completion_evidence === 'rpc_only', 'evidência não pode ser inserida diretamente');
assert(CENTRAL_TABLE_WRITE_POLICY.traffic_task_details === 'rpc_only', 'details só via RPC');
assert(evidenceRowValid({ comment_id: 'a' }), 'uma fonte');
assert(!evidenceRowValid({ comment_id: 'a', attachment_id: 'b' }), 'num_nonnulls deve ser 1');

const succNoDue = validateCompletionInput({
  demandType: 'ajuste',
  summary: 'Resumo válido aqui',
  nextActionNone: false,
  successorTitle: 'próxima',
  successorDueDate: '',
  successorAssigneeIds: ['u1'],
  commentContent: 'evidência em texto suficiente',
  attachmentIds: [],
  evidenceCampaignIds: [],
});
assert(!succNoDue.ok && succNoDue.errors.some((e) => /prazo/i.test(e)), 'tarefa sucessora exige prazo');

const filesDontSkip = validateCompletionInput({
  demandType: 'ajuste',
  summary: '',
  nextActionNone: false,
  successorTitle: '',
  successorDueDate: '',
  successorAssigneeIds: [],
  commentContent: '',
  attachmentIds: ['file-1'],
  evidenceCampaignIds: [],
});
assert(!filesDontSkip.ok && filesDontSkip.errors.length >= 2, 'arquivo selecionado não ignora prazo/resumo/sucessora');

assert(evidenceRulesForDemand('criativo').minCommentChars === 20, 'criativo exige comentário mínimo');
assert(evidenceRulesForDemand('relatorio').minCommentChars === 80, 'relatório exige comentário mínimo 80');
assert(evidenceRulesForDemand('analise').minCommentChars === 80, 'análise exige comentário longo');

const oneLetter = validateCompletionInput({
  demandType: 'criativo',
  summary: 'Enviei o criativo',
  nextActionNone: true,
  successorTitle: '',
  commentContent: 'x',
  attachmentIds: [],
  evidenceCampaignIds: [],
});
assert(!oneLetter.ok, 'uma letra não serve como evidência');

assert(classifyHojeBucket({ due_date: '2026-08-20', demand_type: 'ajuste' }, { today: '2026-08-26' }) === 'atrasadas', 'bucket atrasadas');
assert(classifyHojeBucket({ due_date: '2026-08-26', demand_type: 'ajuste' }, { today: '2026-08-26' }) === 'vencem_hoje', 'bucket hoje');
assert(
  classifyHojeBucket({ due_date: '2026-08-27', demand_type: 'revisao_24h' }, { today: '2026-08-26' }) === 'revisoes_48h',
  'bucket revisões 48h'
);
assert(classifyHojeBucket({ due_date: '2026-08-28', demand_type: 'aprovacao_cliente' }, { today: '2026-08-26' }) === 'aguardando_cliente', 'bucket cliente');
assert(classifyHojeBucket({ due_date: '2026-08-28', demand_type: 'publicacao' }, { today: '2026-08-26' }) === 'publicacoes_pendentes', 'bucket publicações pendentes');

const grouped = groupHojeBuckets(
  [
    { id: 1, due_date: '2026-08-20', demand_type: 'ajuste' },
    { id: 2, due_date: '2026-08-28', demand_type: 'ajuste' },
  ],
  { today: '2026-08-26' }
);
assert(grouped.atrasadas.length === 1 && grouped.demais.length === 1, 'agrupa blocos do Hoje');

const sit = buildSituacaoMetrics({
  tasks: [
    { id: 't1', title: 'Ajuste X', due_date: '2026-08-20', status: 'todo', demand_type: 'ajuste', campaignIds: ['c1'] },
    { id: 't2', title: 'Revisão', due_date: '2026-08-27', status: 'todo', demand_type: 'revisao_24h', campaignIds: [] },
  ],
  campaigns: [
    { id: 'c1', name: 'Com demanda' },
    { id: 'c2', name: 'Órfã' },
  ],
  ops: { primary_assignee_id: 'rafael', situation: 'active' },
  terminalValues: ['published'],
  today: '2026-08-26',
});
assert(sit.nextAction?.title === 'Ajuste X', 'Situação calcula próxima ação');
assert(sit.overdueTasks === 1, 'Situação calcula atrasos');
assert(sit.campaignsWithoutDemand.some((c) => c.id === 'c2'), 'Situação marca campanha sem demanda');
assert(!campaignHasOpenDemand('c2', [{ campaign_ids: ['c1'] }]), 'campanha órfã');

assert(sit.nextActionOverdue === true, 'Situação marca próxima ação vencida');
assert(sit.pendingGestor === false, 'com gestor não é pendência de gestor');
assert(sit.clientPending === 0, 'pendência de gestor não entra em client_pending');

const keslen = buildSituacaoMetrics({
  tasks: [],
  campaigns: [{ id: 'c-orfao', name: 'Sem demanda' }],
  ops: { primary_assignee_id: 'rafael', situation: 'no_campaign_expected' },
  terminalValues: ['published'],
  today: '2026-08-26',
});
assert(keslen.campaignsWithoutDemand.length === 0, 'Keslen/no_campaign_expected elimina alerta de campanha ausente');

const semGestor = buildSituacaoMetrics({
  tasks: [],
  campaigns: [],
  ops: { primary_assignee_id: null, situation: 'active' },
  terminalValues: ['published'],
  today: '2026-08-26',
});
assert(semGestor.pendingGestor === true, 'gestor não definido fica separado');
assert(semGestor.clientPending === 0, 'cliente sem gestor não entra em client_pending');

const needsReviewBackfill = { situation: 'needs_review', primary_assignee_id: null };
assert(needsReviewBackfill.situation !== 'active', 'backfill sem gestor inequívoco não marca active');

assert(tryUuid('nao-uuid') === null, 'UUID legado inválido não converte');
assert(tryUuid('11111111-1111-1111-1111-111111111111') === '11111111-1111-1111-1111-111111111111', 'UUID válido');
assert(normalizePriority('alta') === 'high', 'prioridade alta');
assert(normalizePriority('high') === 'high', 'prioridade high');
assert(normalizePriority('media') === 'medium', 'prioridade media');
assert(normalizePriority('medium') === 'medium', 'prioridade medium');
assert(normalizePriority('baixa') === 'low', 'prioridade baixa');
assert(normalizePriority(null) === 'medium', 'prioridade NULL -> medium');
assert(normalizePriority('urgente') === 'medium', 'prioridade desconhecida -> medium');
assert(operationalDate(new Date('2026-08-26T00:00:00.000Z')) === '2026-08-25', '21h de Brasília não usa data UTC');
assert(demandRequiresExistingCampaign('publicacao'), 'publicação exige campanha');
assert(demandRequiresExistingCampaign('ajuste'), 'ajuste exige campanha');
assert(!demandRequiresExistingCampaign('analise'), 'análise não exige campanha existente');
assert(!campaignKpisValid('nao-json'), 'kpis string inválida');
assert(!campaignKpisValid({ name: 'x' }), 'kpis objeto rejeitado');
assert(campaignKpisValid([{ name: 'CPL', target: '10' }]), 'kpis array de objetos com name');
assert(canAssignOthers({ role: 'colaborador', accessLevel: 'self' }) === false, 'self não atribui outro');
assert(canAssignOthers({ role: 'colaborador', accessLevel: 'all' }) === true, 'all pode atribuir');
assert(canAssignOthers({ role: 'colaborador', accessLevel: null }) === false, 'NULL bloqueia atribuir outro');
assert(canAssignOthers({ role: 'colaborador', accessLevel: 'responsible' }) === false, 'responsible/desconhecido não é allowlist');
assert(canAssignOthers({ role: 'admin', accessLevel: 'self' }) === true, 'admin atribui mesmo com self');
assert(minCommentChars('ajuste') === 20 && minCommentChars('analise') === 80, 'mínimo textual por tipo');

const pubSemCampanha = validateCreateDemandInput({
  title: 'Publicar',
  clientId: 'c1',
  demandType: 'publicacao',
  dueDate: '2026-08-26',
  priority: 'medium',
  assigneeIds: ['u1'],
  links: [],
});
assert(!pubSemCampanha.ok, 'campanha obrigatória na publicação');

const orcZero = validateCreateDemandInput({
  title: 'Lançar',
  clientId: 'c1',
  demandType: 'nova_campanha',
  dueDate: '2026-08-26',
  priority: 'alta',
  assigneeIds: ['u1'],
  campaign: { name: 'X', budget: 0, assigneeId: 'u1', kpis: [] },
});
assert(!orcZero.ok, 'orçamento deve ser maior que zero');

const selfAssignOther = validateCreateDemandInput({
  title: 'Ajuste',
  clientId: 'c1',
  demandType: 'ajuste',
  dueDate: '2026-08-26',
  priority: 'medium',
  assigneeIds: ['outra-pessoa'],
  links: [{ paid_campaign_id: 'camp', client_id: 'c1' }],
  role: 'colaborador',
  accessLevel: 'self',
  actorId: 'eu',
});
assert(!selfAssignOther.ok, 'usuário self tentando atribuir outro responsável');

const onlyLetterAllTypes = validateCompletionInput({
  demandType: 'ajuste',
  summary: 'Resumo válido aqui',
  nextActionNone: true,
  successorTitle: '',
  commentContent: 'curto',
  attachmentIds: [],
  evidenceCampaignIds: [],
});
assert(!onlyLetterAllTypes.ok, 'comentário único curto falha para qualquer tipo');

const originId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const linkedId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const review24Id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const review72Id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const normalizedFirst = resolveCampaignTaskIds({
  paid_campaign_task_links: [{ task_id: originId, relation_type: 'origin', created_at: '2026-08-01T12:00:00Z' }],
  ad_sets: [{ ads: [{ task_id: linkedId }] }],
});
assert(normalizedFirst[0] === originId, 'Kanban lê tabela normalizada primeiro');
assert(
  resolvePrimaryCampaignTaskId({
    paid_campaign_task_links: [
      { task_id: review24Id, relation_type: 'review_24h', created_at: '2026-08-01T10:00:00Z' },
      { task_id: linkedId, relation_type: 'linked', created_at: '2026-08-01T09:00:00Z' },
      { task_id: originId, relation_type: 'origin', created_at: '2026-08-01T12:00:00Z' },
      { task_id: review72Id, relation_type: 'review_72h', created_at: '2026-08-01T08:00:00Z' },
    ],
  }) === originId,
  'tarefa principal é origin mesmo com links fora de ordem'
);
assert(
  resolvePrimaryCampaignTaskId({
    paid_campaign_task_links: [
      { task_id: review72Id, relation_type: 'linked', created_at: '2026-08-02T00:00:00Z' },
      { task_id: linkedId, relation_type: 'linked', created_at: '2026-08-01T00:00:00Z' },
    ],
  }) === linkedId,
  'mesmo relation_type ordena por created_at'
);

const migrationSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase/migrations/20260826010000_central_trafego_fase1.sql'),
  'utf8'
);
assert(!/\bclientes\.updated_at\b/.test(migrationSql), 'migration não referencia clientes.updated_at');
assert(!/\bc\.updated_at\b/.test(migrationSql), 'migration não lê c.updated_at');
assert(!/\bclient_updated_at\b/.test(migrationSql), 'migration não usa client_updated_at');
assert(
  /'updated_at',\s*r\.ops_updated_at/.test(migrationSql),
  'JSON de situacao usa só r.ops_updated_at'
);
assert(
  !/'updated_at',\s*COALESCE\s*\(\s*r\.ops_updated_at/.test(migrationSql),
  'updated_at operacional sem COALESCE para data do cliente'
);
assert(
  !/'updated_at',\s*COALESCE\s*\(\s*r\.ops_updated_at\s*,\s*r\.client_created_at/.test(migrationSql)
    && !/\bc\.created_at\s+AS\s+client_/.test(migrationSql),
  'updated_at operacional sem fallback para clientes.created_at'
);

assert(formatOperationalUpdatedAt(null) === 'Não configurado', 'ops null = Não configurado');
assert(formatOperationalUpdatedAt('') === 'Não configurado', 'ops vazio = Não configurado');
assert(formatOperationalUpdatedAt('2026-08-26T15:04:05Z') === '26/08/2026', 'ops formata data');

assert(metaAvailability(null).kind === 'unavailable', 'sem snapshot = indisponível');
assert(metaAvailability({ permError: true, spend: 0, activeCount: 0 }).kind === 'unavailable', 'permError ≠ zero');
assert(metaAvailability({ permError: false, spend: 0, activeCount: 0 }).kind === 'zero', 'leitura ok com zero');
assert(
  metaAvailability({
    permError: false,
    spend: 0,
    activeCount: 0,
    errorMessage: 'A Meta limitou as chamadas desta conta. Espere um ou dois minutos e atualize.',
  }).kind === 'limited',
  'limite da API ≠ conta desligada'
);
assert(
  metaAvailability({
    permError: false,
    spend: 1115,
    activeCount: 2,
    errorMessage: 'A Meta limitou as chamadas desta conta. Espere um ou dois minutos e atualize.',
    rateLimited: true,
  }).kind === 'ok',
  'limite com gasto conservado continua ok'
);
assert(formatMetaMetric(null) === 'Meta indisponível', 'rótulo indisponível');

const fase1Path = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase/migrations/20260826010000_central_trafego_fase1.sql');
const checkupPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase/migrations/20260826220000_central_trafego_checkup.sql');
const fase1Bytes = readFileSync(fase1Path);
const checkupSql = readFileSync(checkupPath, 'utf8');
assert(
  createHash('sha256').update(fase1Bytes).digest('hex') ===
    '3c23c6da07d21da356756ff72e56c57b5eb6a5fba36bf15bbeec0ee167dc4822',
  'migration da Fase 1 não pode ser editada'
);
assert(/UNIQUE \(client_id, operational_date\)/.test(checkupSql), 'check-up único por cliente e data operacional');
assert(/create_traffic_demand/.test(checkupSql), 'atenção reusa create_traffic_demand');
assert(!/CREATE TABLE[\s\S]*google/i.test(checkupSql), 'Fase 1.1 não cria tabela Google');
assert(!/CREATE OR REPLACE FUNCTION public\.criar_pendencias_caixa/.test(checkupSql), 'check-up não substitui a Caixa');
assert(/SECURITY DEFINER/.test(checkupSql), 'RPCs de check-up são SECURITY DEFINER');
assert(CHECKUP_TABLE_WRITE_POLICY.traffic_checkup_runs === 'rpc_only', 'runs só via RPC');

assert(
  checkupGenerationKey('11111111-1111-1111-1111-111111111111', '2026-08-26') ===
    'checkup:11111111-1111-1111-1111-111111111111:2026-08-26',
  'generation_key estável do check-up'
);
assert(
  checkupGenerationKey('11111111-1111-1111-1111-111111111111', '2026-08-26') ===
    checkupGenerationKey('11111111-1111-1111-1111-111111111111', '2026-08-26'),
  'reload usa a mesma generation_key'
);

const okConfirm = validateCheckupConfirm({
  clientId: 'c1',
  result: 'ok',
});
assert(okConfirm.ok, 'OK não exige problema');

const attentionMissing = validateCheckupConfirm({
  clientId: 'c1',
  result: 'needs_attention',
});
assert(!attentionMissing.ok, 'atenção exige problema, responsável e prazo');
assert(attentionMissing.errors.some((e) => /problema/i.test(e)), 'atenção pede descrição');

const attentionOk = validateCheckupConfirm({
  clientId: 'c1',
  result: 'needs_attention',
  attentionProblem: 'CPA subiu e criativo cansou',
  attentionAssigneeId: 'u1',
  attentionDueDate: '2026-08-27',
});
assert(attentionOk.ok, 'atenção completa passa');
assert(CHECKUP_DEMAND_TYPE === 'analise', 'tarefa de atenção usa analise (não exige campanha existente)');

assert(defaultRequireActiveCampaign('no_campaign_expected') === false, 'sem campanha esperada não exige ativa');
assert(defaultRequireActiveCampaign('active') === true, 'ativo exige campanha por padrão');

const falseAlert = detectCheckupProblems({
  gestorId: 'u1',
  situation: 'no_campaign_expected',
  requireActiveCampaign: false,
  activeCampaigns: 0,
  metaKind: 'zero',
});
assert(!falseAlert.some((p) => p.code === 'missing_active_campaign'), 'não gera alerta falso de campanha');

const missingCamp = detectCheckupProblems({
  gestorId: 'u1',
  situation: 'active',
  requireActiveCampaign: true,
  activeCampaigns: 0,
  metaKind: 'zero',
});
assert(missingCamp.some((p) => p.code === 'missing_active_campaign'), 'campanha ausente alerta só quando esperada');

const noDaySpend = computeBudgetPace({ spend: null, budget: 3000, operationalDate: '2026-08-26' });
assert(noDaySpend.label === 'Dados indisponíveis', 'ritmo sem dado = indisponível');

assert(isCheckupDue({ operationalDate: '2026-08-26', situation: 'active' }) === true, 'quarta-feira entra no padrão');
assert(isCheckupDue({ operationalDate: '2026-08-29', situation: 'active' }) === false, 'sábado fora do padrão');
assert(isCheckupDue({ operationalDate: '2026-08-26', situation: 'closed' }) === false, 'encerrado sem config não entra');
assert(
  isCheckupDue({ hasSettings: true, enabled: false, weekdays: [1, 2, 3, 4, 5], operationalDate: '2026-08-26' }) === false,
  'check-up desligado não entra'
);

const summary = summarizeCheckupBoard([
  { due: true, run: { result: 'ok' } },
  { due: true, run: { result: 'needs_attention' } },
  { due: true, run: { result: 'waiting_client' } },
  { due: true },
  { due: false, run: { result: 'ok' } },
]);
assert(summary.total === 4 && summary.reviewed === 3 && summary.unreviewed === 1, 'resumo revisados/total');
assert(summary.ok === 1 && summary.attention === 1 && summary.waiting_client === 1, 'resumo por resultado');
assert(
  /export const CENTRAL_TRAFEGO_ADAPTERS_ACTIVE = false/.test(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/centralTrafegoAdapters.js'), 'utf8')
  ),
  'adaptadores da Central permanecem desligados'
);

if (failed) {
  console.error(`${failed} falha(s)`);
  process.exit(1);
}
console.log('ok central-trafego-fase1');
