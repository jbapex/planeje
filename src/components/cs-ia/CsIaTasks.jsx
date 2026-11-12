import React, { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Plus, RefreshCw, Sparkles } from 'lucide-react';
import AtlasNewDemand from '@/components/atlas/AtlasNewDemand';
import { buildClientAtlasDemandsUrl, buildClientTasksUrl } from '@/lib/clientHubRoutes';
import { ATLAS_TEAM_ENABLED, TEAM_STATES } from '@/lib/atlasTeam';
import { demandPhase } from '@/lib/atlasDemandPresentation';
import { buildCsDemandDraft } from '@/lib/csIaAtlasDraft';
import { csTaskEditorLink, csTaskReturn } from '@/lib/csIaTaskNavigation';
import { formatDueDatePt, getEffectiveTaskDeadline, sortTasksByWorkOrder } from '@/lib/taskUrgency';
import { Filter, Header } from './CsIaViews';
import { dateTime } from './csIaPresentation';

const deadlineLabels = { production: 'Entrega', stage: 'Prazo da etapa', publication: 'Postagem' };
const referencedDraft = { title: 'Acompanhar relacionamento com o cliente', context: '' };
const creationRules = {
  authorized: 'As regras do Atlas autorizam criar tarefas após alinhar o pedido com o responsável da conta.',
  review: 'A criação automática está desligada para este fluxo. Revise o repasse na Central de Demandas.',
  paused: 'A leitura operacional do Atlas está pausada ou ainda não foi configurada.',
  outside: 'Este cliente está fora da seleção de clientes do Atlas.',
  unavailable: 'Um grupo autorizado precisa estar vinculado para acompanhar pedidos automaticamente.',
};
const scanStates = { queued: 'Lote encaminhado à fila', unchanged: 'Sem mudança na conferência',
  audio_pending: 'Aguardando transcrição', blocked: 'Fonte pendente' };
const jobStates = { queued: 'Na fila', processing: 'Em análise', completed: 'Analisado · aguardando publicação',
  error: 'Precisa de conferência', budget_wait: 'Aguardando orçamento de IA', blocked: 'Fonte pendente',
  superseded: 'Agrupado em novo lote' };

function requestPhase(request) {
  if (request.task_id) return request.created_by_atlas === true ? 'Tarefa criada pelo Atlas' : 'Tarefa vinculada';
  if (request.state === 'closed' || request.state === 'no_action') return 'Acompanhamento encerrado';
  if (request.thread_state) return TEAM_STATES[request.thread_state] || 'Conversa interna';
  if (request.demand_state === 'draft') return 'Aguardando análise';
  return request.demand_state ? demandPhase({ state: request.demand_state }) : 'Em acompanhamento no Atlas';
}

function GroupRequests({ clientId, groupRequests, actorId, board }) {
  const { rows, activity, error, onReload } = groupRequests;
  const scan = activity?.scan;
  const job = activity?.job;
  const published = job?.state === 'completed' && job.published_at;
  return <section className="gia-stack" aria-label="Pedidos do WhatsApp">
    <div className="gia-section-heading">
      <div><h4>Pedidos do WhatsApp</h4><p className="gia-caption">Até 12 pedidos recentes que o Atlas já registrou para o grupo vinculado.</p></div>
      <button type="button" className="gia-action-link" onClick={onReload} disabled={!rows && !error}>Atualizar pedidos</button>
    </div>
    {!rows && !error && <p role="status">Consultando pedidos do grupo…</p>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {rows && (activity ? <dl className="cs-facts" aria-label="Atividade do Atlas no grupo">
      <div><dt>Última conferência</dt><dd>{scan ? `${scanStates[scan.state] || 'Conferência registrada'} · ${dateTime(scan.checked_at)}`
        : 'Sem conferência registrada para este vínculo'}</dd></div>
      <div><dt>Último lote</dt><dd>{job ? `${published ? 'Publicado' : jobStates[job.state] || 'Lote registrado'} · ${dateTime(published || job.finished_at || job.created_at)}`
        : 'Sem lote registrado para este vínculo'}{job?.partial && ' · Cobertura parcial'}</dd></div>
    </dl> : <p className="gia-caption" role="status">Fila do Atlas indisponível. Atualize para tentar novamente.</p>)}
    {rows?.length === 0 && <p className="gia-caption">Nenhum pedido publicado para o grupo atual.</p>}
    {!!rows?.length && <ul className="cs-assigned">{rows.map((request) => {
      const taskOnBoard = actorId && board?.tasks.some(({ id }) => id === request.task_id);
      return <li key={request.id} className="py-2">
        <strong>{request.title}</strong>
        <p className="gia-caption">{requestPhase(request)} · {dateTime(request.updated_at)}</p>
        <div className="cs-actions">
          {request.thread_id && ATLAS_TEAM_ENABLED && <button type="button" className="gia-action-link" onClick={() => {
            window.dispatchEvent(new CustomEvent('atlas-team:open', { detail: { threadId: request.thread_id } }));
          }}>Abrir conversa no Atlas</button>}
          {request.demand_id && <Link className="gia-action-link" to={buildClientAtlasDemandsUrl(clientId, request.demand_id)}>
            {request.demand_state === 'linked' || request.demand_state === 'archived' ? 'Ver demanda no Atlas' : 'Revisar pedido no Atlas'}
          </Link>}
          {request.task_id && <Link className="gia-action-link" {...(taskOnBoard ? csTaskEditorLink(clientId, actorId, request.task_id)
            : { to: `/tasks/list/${encodeURIComponent(request.task_id)}` })}>Abrir tarefa vinculada</Link>}
        </div>
      </li>;
    })}</ul>}
    <Link className="gia-action-link cs-back" to={buildClientAtlasDemandsUrl(clientId)}>Abrir Central de Demandas <ArrowUpRight aria-hidden="true" /></Link>
  </section>;
}

function TaskRule({ options, loading, error, onSave, kind = 'movement' }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const active = options?.enabled === true;
  const creation = kind === 'creation';
  const contextual = kind === 'contextual';
  const label = creation ? 'Criação de tarefas' : contextual ? 'Movimentação pelo contexto' : 'Movimentação';
  const name = contextual ? `${label} da conversa` : `${label} pelo WhatsApp`;
  const rule = creation ? 'criação' : contextual ? 'movimentação pelo contexto' : 'movimentação';

  async function save(next) {
    if (busy || typeof next !== 'boolean' ||
      (options?.can_configure ? next === active : next || !options?.can_revoke)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onSave(next);
      setDraft(null);
      setFeedback({ text: `${label} ${next ? 'ativada' : 'pausada'}.` });
    } catch (failure) {
      setFeedback({ text: failure.message, failed: true });
    } finally {
      setBusy(false);
    }
  }

  return <section className="gia-panel gia-stack" aria-label={name}>
    <h3>{name}</h3>
    {creation ? <p className="gia-caption">Após uma hora sem mensagens novas, um pedido, reclamação ou combinado que exige retorno pode gerar uma tarefa interna para o responsável com acesso ao grupo.</p>
      : contextual ? <p className="gia-caption">Quando um responsável identificado relata no grupo que já começou o trabalho, o CS pode mover a tarefa que criou para Em andamento. A conclusão continua no fluxo oficial de Tarefas.</p>
      : <><p className="gia-caption">No grupo vinculado, o responsável cadastrado pode escrever <strong>Iniciei: título exato da tarefa</strong>.
        A leitura espera uma hora sem novas mensagens. Depois dela, uma tarefa interna elegível passa de A fazer para Em andamento.</p>
        <p className="gia-caption">Etapas com automação do editor, checklist pendente ou título ambíguo ficam para revisão.</p></>}
    {loading && <p role="status">Consultando regra de {rule}…</p>}
    {error && <p role="alert" className="gia-notice">{error}</p>}
    {!loading && !error && <p className="gia-caption">{options?.global_paused ? `${label} pausada nas configurações do CS.`
      : `${label} ${active ? 'ativa' : 'pausada'} neste grupo.`}</p>}
    {options?.can_configure && <form className="gia-stack" onSubmit={event => { event.preventDefault(); void save(draft); }}>
      <label className="cs-checkbox"><input type="checkbox" checked={draft ?? active} disabled={busy}
        onChange={event => { setDraft(event.target.checked); setFeedback(null); }} />
        {creation ? 'Permitir que o CS IA crie tarefas de acompanhamento'
          : contextual ? 'Permitir que o CS IA registre o início pelo contexto da conversa' : 'Permitir que o CS IA registre o início da tarefa'}</label>
      <p className="gia-caption">{creation
        ? 'Vale para mensagens novas. O CS mantém uma tarefa aberta por tipo de pendência e preserva o texto original no WhatsApp.'
        : contextual ? 'Vale para mensagens novas. A pendência original precisa estar na janela de leitura e as regras de Tarefas continuam valendo.'
        : 'A regra vale para mensagens novas. Ao trocar o vínculo ou as opções de leitura, confirme a regra novamente.'}</p>
      <div className="cs-actions">
        {draft !== null && <button type="button" className="gia-action-link" disabled={busy} onClick={() => { setDraft(null); setFeedback(null); }}>Descartar</button>}
        <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || draft === null || draft === active}>Salvar regra de {rule}</button>
      </div>
    </form>}
    {!options?.can_configure && options?.can_revoke && <button type="button" className="gia-action-link" disabled={busy}
      onClick={() => save(false)}>Revogar autorização deste grupo</button>}
    {!loading && !error && !options?.global_paused && !options?.can_configure && !active && <p className="gia-caption">O titular do Atlas pode ativar a regra com a leitura do grupo habilitada.</p>}
    {feedback && <p role={feedback.failed ? 'alert' : 'status'} className={feedback.failed ? 'gia-notice' : 'cs-success'}>{feedback.text}</p>}
    <Link className="gia-action-link cs-back" to="?aba=conversas">Ver leitura do grupo <ArrowUpRight aria-hidden="true" /></Link>
  </section>;
}

function TaskColumns({ board, actorId, room, clients }) {
  const { statuses, tasks } = board;
  const people = new Map(board.people.map((person) => [person.id, person.full_name]));
  const groups = new Map(statuses.map((status) => [status.value, { label: status.label, tasks: [] }]));
  for (const task of sortTasksByWorkOrder(tasks, { statusOptions: statuses })) {
    const value = task.status || '';
    if (!groups.has(value)) groups.set(value, { label: value || 'Sem status', tasks: [] });
    groups.get(value).tasks.push(task);
  }
  return <div className="cs-card-grid">
    {[...groups].filter(([, group]) => group.tasks.length).map(([status, { label, tasks: entries }]) => <section key={status} className="gia-panel gia-stack">
      <div className="gia-section-heading"><h3>{label}</h3><span className="gia-tag">{entries.length}</span></div>
      <ul className="cs-assigned">
        {entries.map((task) => {
          const deadline = getEffectiveTaskDeadline(task);
          const due = formatDueDatePt(deadline.value);
          const assignees = (task.assignee_ids || []).map((id) => people.get(id) || 'Responsável indisponível');
          return <li className="py-2" key={task.id}>
            {actorId ? <Link className="gia-row-link" {...csTaskEditorLink(task.client_id, actorId, task.id, room)}>{task.title}</Link> : <strong>{task.title}</strong>}
            {task.origin === 'atlas' && <p className="gia-caption">Criada pelo Atlas</p>}
            {task.origin === 'cs_whatsapp' && <p className="gia-caption">Criada pelo CS IA · WhatsApp</p>}
            {clients && <p className="gia-caption"><Link to={csTaskReturn(task.client_id)}>{clients.get(task.client_id)}</Link></p>}
            <p className="gia-caption">{due ? `${deadlineLabels[deadline.kind]} · ${due}` : 'Sem prazo'} · {assignees.join(', ') || 'Sem responsável'}</p>
          </li>;
        })}
      </ul>
    </section>)}
  </div>;
}

export function CsIaTaskRoom({ rows, actorId, board, loading, error, onReload }) {
  const [params, setParams] = useSearchParams();
  const client = params.get('cliente') || '';
  const clients = new Map(rows.map(({ client_id, client_name }) => [client_id, client_name]));
  const selected = client && clients.has(client);
  const clientOptions = [...clients].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  if (client && !selected) clientOptions.push([client, 'Cliente indisponível']);
  const statusOptions = new Map((board?.statuses || []).map(({ value, label }) => [value, label]));
  for (const { status } of board?.tasks || []) if (status && !statusOptions.has(status)) statusOptions.set(status, status);
  const status = params.get('situacao') || '';
  if (status && !statusOptions.has(status)) statusOptions.set(status, board ? 'Situação indisponível' : 'Consultando situação…');
  const room = { client, status };
  const tasks = board?.tasks.filter(task => !status || task.status === status) || [];

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return <section className="gia-stack cs-section" aria-label="Sala de tarefas do CS">
    <Header title="Tarefas" text="Acompanhe as tarefas dos clientes da sua carteira no quadro do CS.">
      <button type="button" className="gia-action-link" disabled={loading} onClick={onReload}><RefreshCw aria-hidden="true" /> Atualizar tarefas</button>
      {actorId && selected ? <Link className="gia-action-link gia-primary-action" {...csTaskEditorLink(client, actorId, 'new', room)}><Plus aria-hidden="true" /> Nova tarefa</Link>
        : <button type="button" className="gia-action-link gia-primary-action" disabled><Plus aria-hidden="true" /> Nova tarefa</button>}
    </Header>
    <div className="gia-filters cs-filters">
      <Filter label="Cliente" value={client} onChange={value => setFilter('cliente', value)} options={[[ '', 'Todos os clientes' ], ...clientOptions]} />
      <Filter label="Situação" value={status} onChange={value => setFilter('situacao', value)} options={[[ '', 'Todas as situações' ], ...statusOptions]} />
    </div>
    {!selected && <p className="gia-caption">Selecione um cliente para criar uma tarefa.</p>}
    {client && !selected ? <p className="gia-notice" role="alert">Cliente indisponível para esta sessão.</p> : <>
      {loading && <p role="status">Consultando as tarefas…</p>}
      {error && <p className="gia-notice" role="alert">{error}</p>}
      {board && !tasks.length && <p className="gia-panel gia-empty">Nenhuma tarefa neste recorte.</p>}
      {board?.originsAvailable === false && <p className="gia-caption">Origem das tarefas automáticas indisponível nesta consulta.</p>}
      {tasks.length > 0 && <TaskColumns board={{ ...board, tasks }} actorId={actorId} room={room} clients={clients} />}
    </>}
  </section>;
}

export default function CsIaTasks({ row, actorId, board, loading, error, onReload, demand, movement, creation, contextual }) {
  const clientId = row.client_id;
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [closedReference, setClosedReference] = useState(null);
  const trigger = useRef(null);
  const saving = useRef(false);
  const reference = demand?.reference;
  const usingReference = !draft && reference?.text && reference.key !== closedReference;
  const initialDraft = draft || (usingReference ? referencedDraft : null);

  async function saveDemand(value) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setDraftError('');
    try {
      await demand.onCreate(value);
    } catch (failure) {
      setDraftError(failure.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <section className="gia-stack" aria-label="Tarefas do cliente">
    <div className="gia-section-heading">
      <div><h2>Tarefas do cliente</h2><p className="gia-caption">Acompanhe os status oficiais e abra uma tarefa para editar, atribuir ou mover.</p></div>
      <div className="cs-actions">
        <button type="button" className="gia-action-link" disabled={loading} onClick={onReload}><RefreshCw aria-hidden="true" /> Atualizar tarefas</button>
        {actorId && <Link className="gia-action-link gia-primary-action" {...csTaskEditorLink(clientId, actorId)}><Plus aria-hidden="true" /> Nova tarefa</Link>}
        <Link className="gia-action-link" to={buildClientTasksUrl(clientId)} state={{ csTaskView: true }}>Abrir em Tarefas <ArrowUpRight aria-hidden="true" /></Link>
      </div>
    </div>
    {creation && <TaskRule key={`criação:${row.conversation_id}`} {...creation} kind="creation" />}
    {contextual && <TaskRule key={`contexto:${row.conversation_id}`} {...contextual} kind="contextual" />}
    {movement && <TaskRule key={`movimento:${row.conversation_id}`} {...movement} />}
    {board?.originsAvailable === false && <p className="gia-caption">Origem das tarefas automáticas indisponível nesta consulta.</p>}
    {demand?.error && <p className="gia-notice" role="alert">{demand.error}</p>}
    {reference && !demand.allowed && !demand.error && (reference.pendingAccess
      ? <p role="status">Conferindo acesso à demanda…</p>
      : <p className="gia-notice" role="alert">Demandas do Atlas indisponíveis para revisar esta resposta.</p>)}
    {demand?.allowed && <section className="gia-panel gia-stack" aria-label="Demandas do Atlas">
      <div className="gia-section-heading"><div><h3>Demandas do Atlas</h3>
        <p className="gia-caption">Prepare um repasse com o contexto do CS e revise a proposta na Central de Demandas.</p></div>
        <button ref={trigger} type="button" className="gia-action-link" aria-expanded={Boolean(initialDraft)} disabled={busy || Boolean(usingReference)}
          onClick={() => setDraft(current => current || buildCsDemandDraft(row))}><Sparkles aria-hidden="true" /> Preparar demanda</button>
      </div>
      {demand.rule && <p className="gia-caption">{creationRules[demand.rule]}</p>}
      {demand.settings && <Link className="gia-action-link cs-back" to="/assistant/atlas/configuracoes">Configurar automação no Atlas <ArrowUpRight aria-hidden="true" /></Link>}
      {demand.groupRequests && <GroupRequests clientId={clientId} groupRequests={demand.groupRequests} actorId={actorId} board={board} />}
      {reference?.error && <div className="cs-actions"><p className="gia-notice" role="alert">{reference.error}</p>
        <button className="gia-action-link" type="button" onClick={reference.onReload}>Tentar novamente</button></div>}
      {reference && !reference.text && !reference.error && <p role="status">Consultando a resposta do Atlas…</p>}
      {initialDraft && <div className="atlas-demands">
        {draftError && <p className="gia-notice" role="alert">{draftError}</p>}
        <AtlasNewDemand key={usingReference ? reference.key : 'manual'} clientId={clientId} clients={[{ id: clientId, empresa: row.client_name }]}
          initialDraft={initialDraft} referenceText={usingReference ? reference.text : undefined} busy={busy}
          onSave={saveDemand} onClose={() => {
            if (usingReference) setClosedReference(reference.key);
            setDraft(null); setDraftError(''); requestAnimationFrame(() => trigger.current?.focus());
          }} />
      </div>}
    </section>}
    {loading && <p role="status">Consultando as tarefas…</p>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {board && !board.tasks.length && <p className="gia-panel gia-empty">Nenhuma tarefa disponível para este cliente.</p>}
    {!!board?.tasks.length && <TaskColumns board={board} actorId={actorId} />}
  </section>;
}
