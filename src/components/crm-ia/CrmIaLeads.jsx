import React, { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, CheckCircle2, Circle, Flag, Heart, MessageCircle, Phone, Star, Target, User, XCircle } from 'lucide-react';
import { normalizePhoneNumber } from '@/lib/leadUtils';
import { CrmIaEditor, CrmIaField, CrmIaPagination, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { attendanceName, count, dateTime, money, named, versionOf } from './crmIaPresentation';
import { DEFAULT_LEAD_COLUMNS, LEAD_COLUMNS, leadColumnKeys, leadColumnStorageKey, profileKey, readLeadColumns, storeLeadColumns } from './crmIaLeadModel';
import { CrmIaConversation } from './CrmIaConversations';
import CrmIaImport from './CrmIaImport';
import { CrmIaLeadEditor, CrmIaMoveEditor } from './CrmIaLeadEditors';

const blankOption = label => ({ value: '', label });
const FILTER_KEYS = ['search', 'pipeline_id', 'stage_id', 'owner_id', 'origin', 'tag', 'profile_agent_id', 'profile_id', 'since', 'until', 'sort', 'qualified'];
const STAGE_ICONS = { circle: [Circle, 'Círculo'], user: [User, 'Pessoa'], 'message-circle': [MessageCircle, 'Conversa'], phone: [Phone, 'Telefone'], calendar: [Calendar, 'Calendário'], 'check-circle': [CheckCircle2, 'Concluído'], 'x-circle': [XCircle, 'Encerrado'], flag: [Flag, 'Bandeira'], star: [Star, 'Estrela'], target: [Target, 'Objetivo'], heart: [Heart, 'Coração'] };
function StageIcon({ value }) { const Icon = STAGE_ICONS[value]?.[0] || Circle; return <Icon size={16} aria-hidden="true" />; }
function LeadProfile({ value }) { return value ? <span className="crm-ia-badge"><span className="crm-ia-dot" style={/^#[0-9a-f]{6}$/i.test(value.cor) ? { background: value.cor } : undefined} />{value.nome || 'Perfil sem nome'}</span> : <span className="crm-ia-muted">Sem perfil</span>; }

export default function CrmIaLeads(props) {
  return <CrmIaScopedLeads key={`${props.client?.id}:${props.profile?.id}:${props.canManage}`} {...props} />;
}

function CrmIaScopedLeads({ api, mutate, workspace, client, profile, revision, canManage, onAnalyze, kanban }) {
  const [params, setParams] = useSearchParams();
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const [selection, setSelection] = useState([]);
  const [bulkOwner, setBulkOwner] = useState('');
  const dragging = useRef(null);
  const storageKey = leadColumnStorageKey(profile?.id, client.id);
  const [columns, setColumns] = useState(() => readLeadColumns(storageKey));
  const selected = params.get('lead_id');
  const filters = Object.fromEntries(FILTER_KEYS.map(key => [key, params.get(key) || '']));
  const offset = Math.max(0, Number.parseInt(params.get('offset'), 10) || 0);
  const limit = [20, 50, 100].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 20;
  const pipeline = filters.pipeline_id || (kanban ? workspace.pipelines[0]?.id : '');
  const archived = params.get('archived') === 'true';
  const stages = (workspace.stages || []).filter(stage => !pipeline || stage.pipeline_id === pipeline).sort((a, b) => a.ordem - b.ordem);
  const read = useCrmRead(api, 'leads', { ...filters, pipeline_id: pipeline, archived, offset, limit }, `${revision}:${reload}`, !selected);
  const rows = read.data?.rows || [];
  const selectedItems = selection.filter(item => rows.some(lead => lead.id === item.id));
  const selectedIds = selectedItems.map(item => item.id);
  const profileOptions = (workspace.lead_profiles || []).filter(item => item.historical || !pipeline || item.pipeline_id === pipeline).filter((item, index, all) => all.findIndex(other => profileKey(other) === profileKey(item)) === index);
  function filter(key, value) {
    setSelection([]); dragging.current = null;
    setParams(old => {
      const next = new URLSearchParams(old);
      if (key === 'profile') {
        const found = profileOptions.find(item => profileKey(item) === value);
        next.delete('profile_agent_id'); next.delete('profile_id');
        if (found) { next.set('profile_agent_id', found.agent_id); next.set('profile_id', found.id); }
      } else if (value) next.set(key, value); else next.delete(key);
      if (key !== 'offset') next.delete('offset');
      if (key === 'pipeline_id') { next.delete('stage_id'); next.delete('profile_agent_id'); next.delete('profile_id'); }
      return next;
    }, { replace: key === 'search' || key === 'tag' });
  }
  function changeColumns(next) { const allowed = leadColumnKeys(next); setColumns(allowed); storeLeadColumns(storageKey, allowed); }
  const chooseLead = id => setParams(old => { const next = new URLSearchParams(old); if (id) next.set('lead_id', id); else next.delete('lead_id'); return next; });
  const leadRow = lead => <button type="button" className="crm-ia-lead-link" aria-label={`Abrir ${lead.nome}`} onClick={() => chooseLead(lead.id)}><strong>{lead.nome}</strong><small>{lead.whatsapp || 'Telefone não informado'}</small></button>;
  function cell(lead, key) {
    if (key === 'lead') return leadRow(lead);
    if (key === 'attendance') return <>{lead.archived_at ? 'Arquivado' : lead.attendance ? attendanceName(lead.attendance) : 'Sem dados'}{lead.awaiting_since && <small>Espera desde {dateTime(lead.awaiting_since)}</small>}</>;
    if (key === 'stage') return workspace.stages.find(stage => stage.id === lead.stage_id)?.nome || 'Sem etapa';
    if (key === 'pipeline') return workspace.pipelines.find(item => item.id === lead.pipeline_id)?.nome || 'Sem funil';
    if (key === 'origin') return lead.origem || 'Não informada';
    if (key === 'entry') return dateTime(lead.data_entrada || lead.created_at);
    if (key === 'email') return lead.email || 'Não informado';
    if (key === 'tags') return lead.etiquetas?.length ? lead.etiquetas.map(tag => <span className="crm-ia-badge" key={tag}>{tag}</span>) : 'Sem tags';
    if (key === 'profile') return <LeadProfile value={lead.crm_ia_profile} />;
    if (key === 'value') return money(lead.valor);
    if (key === 'owner') return lead.responsavel_id ? named(workspace.people.find(person => person.id === lead.responsavel_id)) : 'Sem responsável';
    return lead.id;
  }
  function openBulk(kind) { setBulkOwner(''); setEditor({ kind, items: selectedItems.map(item => ({ ...item })) }); }
  function openMove(lead, target = '') { setEditor({ kind: 'move', row: { ...lead }, target }); }
  const totals = read.data?.stage_totals;
  const boardStages = [...stages];
  if (totals?.some(item => item.stage_id == null && item.count > 0) || rows.some(lead => !lead.stage_id)) boardStages.push({ id: null, nome: 'Sem etapa' });
  if (selected) return <CrmIaLeadDetail key={selected} id={selected} {...{ api, mutate, workspace, client, profile, revision, canManage, onAnalyze }} onClose={() => chooseLead(null)} />;
  return <div className="crm-ia-stack"><div className="crm-ia-toolbar"><CrmIaField label="Buscar leads" value={filters.search} onChange={value => filter('search', value)} placeholder="Nome, telefone ou email" />
    <CrmIaField label="Funil" value={pipeline} onChange={value => filter('pipeline_id', value)} options={kanban ? workspace.pipelines : [blankOption('Todos os funis'), ...workspace.pipelines]} />
    <CrmIaField label="Etapa" value={filters.stage_id} onChange={value => filter('stage_id', value)} options={[blankOption('Todas as etapas'), ...stages]} />
    <CrmIaField label="Responsável" value={filters.owner_id} onChange={value => filter('owner_id', value)} options={[blankOption('Todos os responsáveis'), ...workspace.people]} />
    <CrmIaField label="Qualificação" value={filters.qualified} onChange={value => filter('qualified', value)} options={[blankOption('Todos os leads'), { value: 'true', label: 'Qualificados' }, { value: 'false', label: 'Não qualificados' }]} />
    <button type="button" onClick={() => setReload(value => value + 1)}>Atualizar leads</button>{canManage && <><button type="button" className="crm-ia-primary" onClick={() => setEditor({ kind: 'lead', row: { pipeline_id: pipeline, stage_id: pipeline ? stages[0]?.id : '' } })}>Novo lead</button><button type="button" onClick={() => setEditor({ kind: 'import' })}>Importar CSV</button>{kanban && <button type="button" onClick={() => setEditor({ kind: 'pipeline-settings', pipelineId: pipeline })}>Configurar funil</button>}</>}</div>
    <div className="crm-ia-toolbar"><CrmIaField label="Situação dos leads" value={archived ? 'true' : 'false'} onChange={value => filter('archived', value)} options={[{ value: 'false', label: 'Leads atuais' }, { value: 'true', label: 'Arquivados' }]} />{canManage && selectedItems.length > 0 && <><span>{selectedItems.length} selecionados nesta página</span><button type="button" onClick={() => openBulk('bulk')}>Atribuir responsável</button><button type="button" onClick={() => openBulk('bulk-archive')}>Arquivar seleção</button><button type="button" onClick={() => setSelection([])}>Limpar seleção</button></>}</div>
    <details className="crm-ia-card crm-ia-filter-details"><summary>Mais filtros e colunas</summary><div className="crm-ia-toolbar"><CrmIaField label="Origem" value={filters.origin} onChange={value => filter('origin', value)} /><CrmIaField label="Etiqueta" value={filters.tag} onChange={value => filter('tag', value)} placeholder="Etiqueta exata" /><CrmIaField label="Perfil do lead" value={filters.profile_agent_id && filters.profile_id ? `${filters.profile_agent_id}:${filters.profile_id}` : ''} onChange={value => filter('profile', value)} options={[blankOption('Todos os perfis'), ...profileOptions.map(item => ({ value: profileKey(item), label: `${item.nome}${item.historical ? ' (histórico)' : ''}` }))]} /><CrmIaField label="Entrada desde" type="date" value={filters.since} onChange={value => filter('since', value)} /><CrmIaField label="Entrada até" type="date" value={filters.until} onChange={value => filter('until', value)} /><CrmIaField label="Ordenar leads" value={filters.sort} onChange={value => filter('sort', value)} options={[{ value: '', label: 'Mais recentes' }, { value: 'oldest', label: 'Mais antigos' }, { value: 'name', label: 'Nome' }, { value: 'value', label: 'Valor' }]} /><CrmIaField label="Leads por página" value={limit} onChange={value => filter('limit', value)} options={[20, 50, 100].map(value => ({ value, label: String(value) }))} /></div>
      {!kanban && <fieldset className="crm-ia-lead-columns"><legend>Colunas visíveis</legend><div className="crm-ia-check-grid">{LEAD_COLUMNS.map(([key, label]) => <CrmIaField key={key} label={`Mostrar coluna ${label}`} type="checkbox" value={columns.includes(key)} disabled={key === 'lead'} onChange={checked => changeColumns(checked ? [...columns, key] : columns.filter(item => item !== key))} />)}</div><button type="button" onClick={() => changeColumns(DEFAULT_LEAD_COLUMNS)}>Restaurar colunas padrão</button></fieldset>}
    </details>
    <CrmIaState read={read} retry={() => setReload(value => value + 1)}>
      <section className="crm-ia-kpis crm-ia-lead-summary" aria-label="Resumo dos leads">{[['Leads no recorte', count(read.data?.total)], ['Valor no recorte', read.data?.summary?.value == null ? 'Sem dados' : money(read.data.summary.value)], ['Com IA', count(read.data?.summary?.ai)], ['Esperando pessoa', count(read.data?.summary?.waiting)]].map(([label, value]) => <div className="crm-ia-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      {kanban ? <><p className="crm-ia-muted">Exibindo {rows.length} de {read.data?.total || 0} oportunidades. Contagens e valores das colunas abrangem todo o recorte. Os cartões mostram esta página.</p><div className="crm-ia-kanban">{boardStages.map(stage => {
        const list = rows.filter(lead => (lead.stage_id || null) === stage.id);
        const total = totals?.find(item => (item.stage_id || null) === stage.id) || (Array.isArray(totals) ? { count: 0, value: 0 } : null);
        return <section className="crm-ia-kanban-column" aria-label={`Etapa ${stage.nome}`} key={stage.id || 'no-stage'} onDragOver={event => { if (canManage && !archived && stage.id && dragging.current) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const row = dragging.current; dragging.current = null; if (canManage && !archived && stage.id && row && row.stage_id !== stage.id && row.pipeline_id === stage.pipeline_id) openMove(row, stage.id); }}><header><StageIcon value={stage.crm_ia_icon} /><span className="crm-ia-dot" style={{ background: stage.color }} /><h2>{stage.nome}</h2><span>{count(total?.count)}</span></header><small>{money(total?.value)} · {list.length} nesta página</small>{list.map(lead => <article className="crm-ia-card crm-ia-kanban-card" aria-label={`Oportunidade ${lead.nome}`} key={lead.id} draggable={canManage && !archived && Boolean(lead.updated_at)} onDragStart={event => { if (!canManage || archived || !lead.updated_at) { event.preventDefault?.(); return; } dragging.current = { ...lead }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-planeje-crm-lead', lead.id); }} onDragEnd={() => { dragging.current = null; }}>{leadRow(lead)}<p>{money(lead.valor)}</p><small>{lead.responsavel_id ? named(workspace.people.find(person => person.id === lead.responsavel_id)) : 'Sem responsável'}</small><LeadProfile value={lead.crm_ia_profile} />{lead.awaiting_since && <small>Espera desde {dateTime(lead.awaiting_since)}</small>}{canManage && !archived && <button type="button" aria-label={`Mover ${lead.nome}`} onClick={() => openMove(lead)}>Mover etapa</button>}</article>)}{canManage && stage.id && <button type="button" onClick={() => setEditor({ kind: 'lead', row: { pipeline_id: stage.pipeline_id, stage_id: stage.id } })}>Adicionar em {stage.nome}</button>}</section>;
      })}</div></> : rows.length ? <div className="crm-ia-table-wrap crm-ia-card"><table><thead><tr>{canManage && !archived && <th><input type="checkbox" aria-label="Selecionar página" checked={Boolean(rows.length && selectedItems.length === rows.length)} onChange={event => { const checked = event.target.checked; setSelection(old => checked ? rows.map(lead => old.find(item => item.id === lead.id) || versionOf(lead)) : []); }} /></th>}{LEAD_COLUMNS.filter(([key]) => columns.includes(key)).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map(lead => <tr key={lead.id}>{canManage && !archived && <td><input type="checkbox" aria-label={`Selecionar ${lead.nome}`} checked={selectedIds.includes(lead.id)} onChange={event => setSelection(old => event.target.checked ? old.some(item => item.id === lead.id) ? old : [...old, versionOf(lead)] : old.filter(item => item.id !== lead.id))} /></td>}{LEAD_COLUMNS.filter(([key]) => columns.includes(key)).map(([key]) => <td key={key}>{cell(lead, key)}</td>)}</tr>)}</tbody></table></div> : <p className="crm-ia-state" role="status">Nenhum lead neste recorte.</p>}
      <CrmIaPagination total={read.data?.total} offset={offset} limit={limit} onPage={value => filter('offset', String(value))} />
    </CrmIaState>
    {editor?.kind === 'lead' && <CrmIaLeadEditor workspace={workspace} row={editor.row} mutate={mutate} onClose={() => setEditor(null)} />}
    {editor?.kind === 'move' && <CrmIaMoveEditor workspace={workspace} row={editor.row} initialTarget={editor.target} mutate={mutate} onClose={() => setEditor(null)} />}
    {editor?.kind === 'pipeline-settings' && <CrmIaPipelineEditor initialPipelineId={editor.pipelineId} workspace={workspace} mutate={mutate} onClose={() => setEditor(null)} />}
    {editor?.kind === 'import' && <CrmIaImport workspace={workspace} mutate={mutate} onClose={() => setEditor(null)} />}
    {['bulk', 'bulk-archive'].includes(editor?.kind) && <CrmIaEditor title={editor.kind === 'bulk' ? 'Atribuir responsável' : 'Arquivar seleção'} onClose={() => setEditor(null)} saveLabel={editor.kind === 'bulk' ? 'Confirmar responsável' : 'Confirmar arquivamento'} onSave={async () => {
      if (!editor.items.length || editor.items.length > 100 || editor.items.some(item => !item.expected_updated_at)) throw new Error('Selecione até 100 leads com versão atual. Atualize a página.');
      if (editor.kind === 'bulk') { if (!bulkOwner) throw new Error('Escolha o novo responsável.'); await mutate('bulk_assign', { ids: editor.items.map(item => item.id), owner_id: bulkOwner, items: editor.items }); }
      else await mutate('bulk_archive', { items: editor.items });
      setSelection([]);
    }}><p>{editor.items.length} leads selecionados.</p>{editor.kind === 'bulk' ? <CrmIaField label="Novo responsável da seleção" value={bulkOwner} onChange={setBulkOwner} options={[blankOption('Selecione'), ...workspace.people]} /> : <p>Os leads sairão da lista atual e poderão ser restaurados em Arquivados. Contatos e histórico serão preservados.</p>}</CrmIaEditor>}
  </div>;
}

function CrmIaLeadDetail({ id, api, mutate, workspace, client, profile, revision, canManage, onAnalyze, onClose }) {
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState('summary');
  const [edit, setEdit] = useState('');
  const [editingLead, setEditingLead] = useState(null);
  const [channel, setChannel] = useState('');
  const [conversationChannel, setConversationChannel] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const read = useCrmRead(api, 'lead', { id }, `${revision}:${reload}`);
  const lead = read.data?.lead;
  const stage = workspace.stages.find(item => item.id === lead?.stage_id);
  function openEditor(kind, target = '') { setEditingLead({ ...lead }); setMoveTarget(target); setEdit(kind); }
  const conversations = workspace.permissions.conversations === true ? (read.data?.conversations || (read.data?.conversation ? [read.data.conversation] : [])).filter((item, index, all) => item.contact_id && item.channel_id && workspace.channels.some(channel => channel.id === item.channel_id && channel.can_read !== false) && all.findIndex(other => other.contact_id === item.contact_id && other.channel_id === item.channel_id) === index) : [];
  const conversation = conversations.find(item => item.channel_id === conversationChannel) || conversations[0];
  const stages = workspace.stages.filter(item => item.pipeline_id === lead?.pipeline_id).sort((a, b) => a.ordem - b.ordem);
  return <section className="crm-ia-card crm-ia-lead-detail" aria-label="Ficha do lead"><div className="crm-ia-section-heading"><h2>{lead?.nome || 'Ficha do lead'}</h2><div className="crm-ia-toolbar">{lead && <>{canManage && (lead.archived_at ? <button type="button" onClick={() => openEditor('restore')}>Restaurar lead</button> : <><button type="button" onClick={() => openEditor('edit')}>Editar lead</button><button type="button" onClick={() => openEditor('move')}>Mover etapa</button><button type="button" onClick={() => openEditor('assign')}>Pegar para mim</button></>)}<Link className="crm-ia-link-button" to={`/crm-ia/agenda?${new URLSearchParams({ cliente: client.id, lead_id: id })}`}>Agendar compromisso</Link><details className="crm-ia-chat-action-menu"><summary aria-label="Mais ações do lead">⋯</summary><div>{canManage && !lead.archived_at && <button type="button" onClick={() => openEditor('archive')}>Arquivar lead</button>}{onAnalyze && <button type="button" onClick={() => onAnalyze({ lead })}>Analisar lead com Atlas</button>}</div></details></>}<button type="button" onClick={onClose}>Fechar ficha</button></div></div><CrmIaState read={read} retry={() => setReload(value => value + 1)}>{lead && <>
      <div className="crm-ia-lead-layout"><div><div className="crm-ia-section-tabs crm-ia-lead-tabs" role="group" aria-label="Seções da ficha">{[['summary', 'Resumo'], ['fields', 'Campos'], ['journey', 'Jornada']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
        {tab === 'summary' && <><dl className="crm-ia-facts">{[['Telefone', lead.whatsapp], ['Email', lead.email], ['Funil', workspace.pipelines.find(item => item.id === lead.pipeline_id)?.nome], ['Etapa', stage?.nome], ['Perfil', <LeadProfile value={lead.crm_ia_profile} />], ['Valor', money(lead.valor)], ['Origem', lead.origem], ['Entrada', dateTime(lead.data_entrada || lead.created_at)], ['Responsável', lead.responsavel_id ? named(workspace.people.find(person => person.id === lead.responsavel_id)) : 'Sem responsável'], ['Situação', lead.attendance ? attendanceName(lead.attendance) : 'Sem dados']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>)}</dl><h3>Tags</h3><p>{lead.etiquetas?.length ? lead.etiquetas.map(tag => <span className="crm-ia-badge" key={tag}>{tag}</span>) : 'Sem tags'}</p><h3>Observações</h3><p className="crm-ia-prose">{lead.observacoes || 'Nenhuma observação registrada.'}</p><h3>Próximos compromissos</h3><ul className="crm-ia-list">{(read.data.appointments || []).map(item => <li key={item.id}><span>{item.title}</span><time>{dateTime(item.start_at)}</time></li>)}</ul>{!read.data.appointments?.length && <p className="crm-ia-muted">Nenhum compromisso disponível.</p>}</>}
        {tab === 'fields' && <><h3>Campos personalizados</h3><dl className="crm-ia-facts">{(workspace.config.data.custom_fields?.fields || []).filter(field => field.active !== false).map(field => <div key={field.key}><dt>{field.name}</dt><dd>{lead.crm_ia_fields?.[field.key] ?? 'Não informado'}</dd></div>)}<div><dt>ID</dt><dd>{lead.id}</dd></div></dl></>}
        {tab === 'journey' && <><h3>Jornada</h3><ul className="crm-ia-list">{(read.data.events || []).map(event => <li key={event.id}><div><strong>{event.title || event.tipo || event.event_type || 'Movimentação no funil'}</strong><p>{event.motivo_ganho_perdido || event.motivo || event.description || event.observacoes}</p></div><small>{dateTime(event.realizado_em || event.created_at)}</small></li>)}</ul>{!read.data.events?.length && <p className="crm-ia-muted">Nenhum evento disponível.</p>}<h3>Histórico de perfil</h3><ul className="crm-ia-list">{(read.data.profile_history || []).map((item, index) => <li key={item.id || `${item.created_at}:${index}`}><div><strong>{item.from_profile?.nome || 'Sem perfil'} → {item.to_profile?.nome || 'Sem perfil'}</strong>{item.actor_id && <p>{named(workspace.people.find(person => person.id === item.actor_id))}</p>}</div><small>{dateTime(item.created_at)}</small></li>)}</ul>{!read.data.profile_history?.length && <p className="crm-ia-muted">Nenhuma alteração de perfil disponível.</p>}</>}
      </div><aside className="crm-ia-lead-conversation" aria-label="Conversa do lead">
        <nav className="crm-ia-lead-stage-track" aria-label="Etapas do funil"><strong>{workspace.pipelines.find(item => item.id === lead.pipeline_id)?.nome || 'Sem funil'}</strong><ol>{stages.map(item => <li key={item.id}><button type="button" aria-label={item.id === lead.stage_id ? `${item.nome} (etapa atual)` : `Mover para ${item.nome}`} aria-current={item.id === lead.stage_id ? 'step' : undefined} disabled={!canManage || Boolean(lead.archived_at) || item.id === lead.stage_id} onClick={() => openEditor('move', item.id)}><StageIcon value={item.crm_ia_icon} />{item.nome}</button></li>)}</ol></nav>
        {conversation ? <>{conversations.length > 1 && <CrmIaField label="Canal da conversa" value={conversation.channel_id} onChange={setConversationChannel} options={conversations.map(item => ({ value: item.channel_id, label: named(workspace.channels.find(channel => channel.id === item.channel_id)) }))} />}<CrmIaConversation key={`${conversation.contact_id}:${conversation.channel_id}`} {...{ conversation, api, mutate, workspace, revision, canManage, profile }} embedded /></> : <p className="crm-ia-muted">Nenhuma conversa autorizada disponível nesta ficha.</p>}
        <div className="crm-ia-lead-conversation-links">{workspace.permissions.conversations && <Link className="crm-ia-link-button" to={`/crm-ia/conversas?${new URLSearchParams({ cliente: client.id, ...(conversation ? { contact_id: conversation.contact_id, channel_id: conversation.channel_id } : { search: lead.whatsapp || lead.nome }) })}`}>Abrir conversas</Link>}{canManage && workspace.provisioned && workspace.permissions.conversations && !lead.archived_at && <button type="button" onClick={() => { setChannel(''); openEditor('conversation'); }}>Iniciar conversa</button>}</div>
      </aside></div>
    </>}</CrmIaState>
      {lead && <>
      {edit === 'edit' && <CrmIaLeadEditor row={editingLead} {...{ workspace, mutate }} onClose={() => setEdit('')} />}
      {edit === 'move' && <CrmIaMoveEditor row={editingLead} initialTarget={moveTarget} {...{ workspace, mutate }} onClose={() => setEdit('')} />}
      {edit === 'assign' && <CrmIaEditor title="Assumir oportunidade" onClose={() => setEdit('')} onSave={() => mutate('save_lead', { ...versionOf(editingLead), responsavel_id: profile.id })} saveLabel="Confirmar responsável"><p>Você será responsável por esta oportunidade.</p></CrmIaEditor>}
      {edit === 'conversation' && <CrmIaEditor title="Iniciar conversa" onClose={() => setEdit('')} saveLabel="Abrir no canal escolhido" onSave={async () => {
        if (!channel) throw new Error('Escolha um canal autorizado para conversar.');
        const opened = await mutate('open_conversation', { id: editingLead.id, channel_id: channel, chat_jid: `${normalizePhoneNumber(editingLead.whatsapp)}@s.whatsapp.net` });
        navigate(`/crm-ia/conversas?${new URLSearchParams({ cliente: client.id, contact_id: opened.contact_id, channel_id: opened.channel_id })}`);
      }}><p>{editingLead.nome} · {editingLead.whatsapp}</p><CrmIaField label="Canal para iniciar conversa" value={channel} onChange={setChannel} required options={[blankOption('Escolha o canal'), ...workspace.channels.filter(item => item.can_send !== false)]} /><p className="crm-ia-muted">O contato será vinculado ao CRM. Nenhuma mensagem será enviada ao abrir.</p></CrmIaEditor>}
      {['archive', 'restore'].includes(edit) && <CrmIaEditor title={edit === 'archive' ? 'Arquivar lead' : 'Restaurar lead'} onClose={() => setEdit('')} saveLabel={edit === 'archive' ? 'Confirmar arquivamento' : 'Confirmar restauração'} onSave={async () => { await mutate(edit === 'archive' ? 'archive_lead' : 'restore_lead', edit === 'archive' ? versionOf(editingLead) : { id: editingLead.id }); onClose(); }}><p>{editingLead.nome}</p><p>{edit === 'archive' ? 'A oportunidade sairá da lista atual e poderá ser restaurada em Arquivados. Histórico e contato serão preservados.' : 'A oportunidade voltará à carteira atual, com o histórico preservado.'}</p></CrmIaEditor>}
      </>}
  </section>;
}

function CrmIaPipelineEditor({ workspace, mutate, onClose, initialPipelineId }) {
  const [pipelineId, setPipelineId] = useState(initialPipelineId || workspace.pipelines[0]?.id || '');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const dragging = useRef(null);
  const pipeline = workspace.pipelines.find(item => item.id === pipelineId);
  const stages = workspace.stages.filter(item => item.pipeline_id === pipelineId).sort((a, b) => a.ordem - b.ordem);
  function edit(kind, row = {}) { setEditing({ kind, row: { ...row } }); setDraft({ nome: '', color: '#286fc9', tipo: 'intermediaria', ...row, icon: STAGE_ICONS[row.crm_ia_icon] ? row.crm_ia_icon : 'circle' }); }
  function reorder(from, to, snapshot = { order: stages.map(item => item.id), pipeline: { ...pipeline } }) {
    if (from === to || from < 0 || to < 0 || to >= snapshot.order.length) return;
    const order = [...snapshot.order]; order.splice(to, 0, order.splice(from, 1)[0]);
    edit('order', { order, pipeline_id: snapshot.pipeline.id, expected_updated_at: snapshot.pipeline.updated_at });
  }
  return <CrmIaEditor title="Configurar funil" onClose={onClose}><CrmIaField label="Funil em configuração" value={pipelineId} onChange={value => { setPipelineId(value); dragging.current = null; setEditing(null); }} options={[blankOption('Selecione'), ...workspace.pipelines]} /><div className="crm-ia-toolbar"><button type="button" onClick={() => edit('pipeline')}>Novo funil</button>{pipeline && <><button type="button" onClick={() => edit('pipeline', pipeline)}>Editar funil</button><button type="button" onClick={() => edit('delete_pipeline', pipeline)}>Excluir funil</button></>}<button type="button" disabled={!pipeline} onClick={() => edit('stage', { pipeline_id: pipelineId, ordem: stages.length })}>Adicionar etapa</button></div>
    <ol className="crm-ia-list">{stages.map((item, index) => <li className="crm-ia-stage-order" aria-label={`Ordem da etapa ${item.nome}`} key={item.id} draggable={Boolean(pipeline?.updated_at)} onDragStart={event => { dragging.current = { id: item.id, order: stages.map(stage => stage.id), pipeline: { ...pipeline } }; event.dataTransfer.setData('application/x-planeje-crm-stage', item.id); }} onDragEnd={() => { dragging.current = null; }} onDragOver={event => { if (dragging.current?.pipeline.id === pipelineId) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const snapshot = dragging.current; dragging.current = null; if (snapshot?.pipeline.id === pipelineId) reorder(snapshot.order.indexOf(snapshot.id), snapshot.order.indexOf(item.id), snapshot); }}><StageIcon value={item.crm_ia_icon} /><strong>{item.nome}</strong><div><button type="button" onClick={() => edit('stage', item)}>Editar {item.nome}</button><button type="button" onClick={() => edit('delete_stage', item)}>Excluir {item.nome}</button><button type="button" disabled={index === 0 || !pipeline?.updated_at} onClick={() => reorder(index, index - 1)}>Subir {item.nome}</button><button type="button" disabled={index === stages.length - 1 || !pipeline?.updated_at} onClick={() => reorder(index, index + 1)}>Descer {item.nome}</button></div></li>)}</ol>
    {editing && <CrmIaEditor title={editing.kind.startsWith('delete_') ? 'Confirmar exclusão' : editing.kind === 'order' ? 'Reordenar etapas' : editing.kind === 'stage' ? 'Editar etapa' : 'Editar funil'} onClose={() => setEditing(null)} onSave={async () => {
      if (editing.kind.startsWith('delete_')) return mutate(editing.kind, versionOf(editing.row));
      if (editing.kind === 'order') return mutate('reorder_stages', { pipeline_id: editing.row.pipeline_id, stage_ids: editing.row.order, expected_updated_at: editing.row.expected_updated_at });
      if (!draft.nome?.trim()) throw new Error('Informe um nome.');
      const payload = { ...versionOf(editing.row), nome: draft.nome.trim() };
      if (editing.kind === 'stage' && !Object.hasOwn(STAGE_ICONS, draft.icon)) throw new Error('Escolha um ícone disponível.');
      await mutate(editing.kind === 'stage' ? 'save_stage' : 'save_pipeline', editing.kind === 'stage' ? { ...payload, pipeline_id: pipelineId, color: draft.color, tipo: draft.tipo, ordem: draft.ordem, icon: draft.icon } : { ...payload, is_default: draft.is_default === true });
    }}>{editing.kind.startsWith('delete_') ? <><p>Excluir <strong>{editing.row.nome}</strong>?</p><p>O servidor recusa a exclusão quando houver oportunidades vinculadas. Nenhum lead será apagado.</p></> : editing.kind === 'order' ? <><p>Confira a nova ordem. As oportunidades e o histórico serão preservados.</p><ol>{editing.row.order.map(stageId => <li key={stageId}>{workspace.stages.find(item => item.id === stageId)?.nome}</li>)}</ol></> : <><CrmIaField label="Nome" value={draft.nome} onChange={nome => setDraft(old => ({ ...old, nome }))} required />{editing.kind === 'stage' ? <><CrmIaField label="Cor" type="color" value={draft.color} onChange={color => setDraft(old => ({ ...old, color }))} /><div className="crm-ia-stage-icon-picker"><CrmIaField label="Ícone da etapa" value={draft.icon} onChange={icon => setDraft(old => ({ ...old, icon }))} options={Object.entries(STAGE_ICONS).map(([value, [, label]]) => ({ value, label }))} /><StageIcon value={draft.icon} /></div><CrmIaField label="Tipo de etapa" value={draft.tipo} onChange={tipo => setDraft(old => ({ ...old, tipo }))} options={[{ value: 'intermediaria', label: 'Em andamento' }, { value: 'ganho', label: 'Ganho' }, { value: 'perdido', label: 'Perdido' }]} /></> : <CrmIaField label="Funil padrão" type="checkbox" value={draft.is_default} onChange={is_default => setDraft(old => ({ ...old, is_default }))} />}</>}</CrmIaEditor>}
  </CrmIaEditor>;
}
