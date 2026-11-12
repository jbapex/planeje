import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Building,
  CheckSquare,
  ChevronRight,
  FolderKanban,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Radio,
  RefreshCw,
  Rocket,
  Target,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import ClientForm from '@/components/forms/ClientForm';
import ClientGoogleAdsAccountsManager from '@/components/forms/ClientGoogleAdsAccountsManager';
import ClientMetaAccountsManager from '@/components/forms/ClientMetaAccountsManager';
import { supabase } from '@/lib/customSupabaseClient';
import { etiquetaNome, fetchEtiquetaRows, mergeEtiquetaCatalog } from '@/lib/clienteEtiquetas';
import { CLIENT_TRAFFIC_GOAL_FIELDS, saveClienteForm, saveClienteToast } from '@/lib/clienteSave';
import { clearDataCacheByPrefix } from '@/hooks/useDataCache';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClientHubPulse } from '@/hooks/useClientHubPulse';
import { useClienteOperacao } from '@/hooks/useClienteOperacao';
import ClienteOperacaoPanel from '@/components/clients/ClienteOperacaoPanel';
import ClienteReunioesPanel from '@/components/clients/ClienteReunioesPanel';
import ClientMonthlyScope from '@/components/clients/ClientMonthlyScope';
import AtlasDemandCentral from '@/components/atlas/AtlasDemandCentral';
import AtlasClientKnowledge from '@/components/atlas/AtlasClientKnowledge';
import { ATLAS_DEMANDS_ENABLED } from '@/lib/atlasDemands';
import { formatAtendimentoTime } from '@/hooks/useAtendimentoConversations';
import {
  buildClientAssistantUrl,
  buildClientCoberturaUrl,
  buildClientConversasUrl,
  buildClientCrmUrl,
  buildClientEditUrl,
  buildClientHubUrl,
  buildClientProjectsUrl,
  buildClientRastreamentoUrl,
  buildClientTasksUrl,
  buildClientTrafficUrl,
} from '@/lib/clientHubRoutes';
import { cn } from '@/lib/utils';
import { formatVencimentoLabel } from '@/lib/carteiraClientes';
import { formatClientLocalidade } from '@/lib/brasilUfs';
import '@/components/clients/ClientHub.css';

const ETAPAS = {
  prospect: 'Prospect',
  qualification: 'Qualificação',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  closed: 'Fechado',
  lost: 'Perdido',
};

function formatMoney(n) {
  if (n == null || n === '') return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function formatDue(value) {
  if (!value) return null;
  try {
    const s = String(value);
    const datePart = s.length >= 10 ? s.slice(0, 10) : s;
    const d = parseISO(datePart);
    return format(d, "d 'de' MMM", { locale: ptBR });
  } catch {
    return String(value);
  }
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

const HUB_TABS = [
  { id: 'resumo', label: 'Resumo' },
  ...(ATLAS_DEMANDS_ENABLED ? [{ id: 'demandas', label: 'Demandas' }, { id: 'arquivos', label: 'Arquivos e memória' }] : []),
  { id: 'escopo', label: 'Escopo do mês' },
  { id: 'reunioes', label: 'Reuniões' },
  { id: 'entregas', label: 'Entregas' },
  { id: 'projetos', label: 'Projetos' },
];

const FOCUSED_EDITORS = new Map([
  ['contas-meta', { title: 'Vincular contas Meta Ads', AccountManager: ClientMetaAccountsManager }],
  ['contas-google', { title: 'Vincular contas Google Ads', AccountManager: ClientGoogleAdsAccountsManager }],
  ['metas', { title: 'Metas de tráfego' }],
]);

function tabFromParams(params) {
  const aba = params.get('aba');
  if (HUB_TABS.some((tab) => tab.id === aba)) return aba;
  if (params.get('section') === 'escopo') return 'escopo';
  return 'resumo';
}

function TaskRow({ task, clientId, late }) {
  return (
    <Link
      to={`/tasks/list/${task.id}?client_id=${encodeURIComponent(clientId)}`}
      className="planeje-client-hub-item"
    >
      <div className="min-w-0">
        <p className="planeje-client-hub-item-title truncate">{task.title || 'Tarefa sem título'}</p>
        <p className="planeje-client-hub-item-meta">
          {late ? 'Atrasada' : 'Hoje'}
          {task.due_date ? ` · ${formatDue(task.due_date)}` : ''}
          {task.status ? ` · ${task.status}` : ''}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
    </Link>
  );
}

function ClientHubEditDrawer({ client, onClose, onSaved, trafficGoalFields }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const mounted = useRef(false);
  const trafficGoalsOnly = Boolean(trafficGoalFields);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (!trafficGoalsOnly) {
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('role', 'cliente')
        .then(({ data }) => {
          if (active) setUsers(data || []);
        });
    }
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [trafficGoalsOnly]);

  const handleSave = async (clientData) => {
    const result = await saveClienteForm({ clientData, isNew: false, editingClient: client, userId: user.id, trafficGoalsOnly });
    if (!trafficGoalsOnly || result.error || result.data) toast(saveClienteToast({ isNew: false, ...result }));
    if (result.error) return;
    clearDataCacheByPrefix('clients_');
    if (!trafficGoalsOnly || mounted.current) onSaved();
  };

  return <ClientForm client={client} users={users} onSave={handleSave} onClose={onClose} trafficGoalFields={trafficGoalFields} />;
}

function ClientHubFocusedEditor({ id, editor, onClose, trafficGoalFields, selection, focusAccountId }) {
  const { title, AccountManager } = editor;
  const [client, setClient] = useState(undefined);

  useEffect(() => {
    let active = true;
    const readClient = (columns) => supabase.from('clientes').select(columns).eq('id', id).maybeSingle();
    const loadClient = async () => {
      const result = await readClient(selection);
      if (active && result.error?.code === '42703' && result.error.message?.includes('limite_meta') && selection.includes(', limite_meta')) {
        return readClient(selection.replace(', limite_meta', ''));
      }
      return result;
    };
    loadClient().then(
      ({ data, error }) => {
        if (active) setClient(!error && data?.id === id ? data : null);
      },
      () => { if (active) setClient(null); },
    );
    return () => { active = false; };
  }, [id, selection]);

  if (client && !AccountManager) {
    const availableFields = trafficGoalFields.filter((field) => Object.hasOwn(client, field));
    if (availableFields.length) {
      return <ClientHubEditDrawer client={client} onClose={onClose} onSaved={onClose} trafficGoalFields={availableFields} />;
    }
  }

  let status = 'Cliente não encontrado ou sem permissão de acesso.';
  if (client === undefined) status = 'Carregando cliente…';
  else if (client) status = 'Metas indisponíveis neste cadastro.';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-11/12 overflow-y-auto">
        <DialogHeader className="pr-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{client?.empresa || 'Cadastro do cliente no Planeje.'}</DialogDescription>
        </DialogHeader>
        {client && AccountManager ? (
          <AccountManager clientId={client.id} clientName={client.empresa} focusAccountId={focusAccountId} searchable />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">{status}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HubPanel({ title, link, children }) {
  return (
    <section className="planeje-client-hub-panel">
      <div className="planeje-client-hub-panel-head">
        <h2 className="planeje-client-hub-panel-title">{title}</h2>
        {link}
      </div>
      {children}
    </section>
  );
}

export default function ClientHubPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, canViewField } = useAuth();
  const isEditing = /\/edit\/?$/.test(location.pathname);
  const params = new URLSearchParams(location.search);
  const section = params.get('secao');
  params.delete('secao');
  const canonicalSearch = section === null ? location.search : params.toString();
  const editTo = { pathname: buildClientEditUrl(id), search: canonicalSearch };
  const closeEdit = () => {
    const historyIndex = globalThis.history?.state?.idx;
    const hasPreviousEntry = typeof historyIndex === 'number' ? historyIndex > 0 : location.key !== 'default';
    if (location.state?.backOnClose && hasPreviousEntry) navigate(-1);
    else navigate({ pathname: buildClientHubUrl(id), search: canonicalSearch }, { replace: true });
  };

  const editor = isEditing ? FOCUSED_EDITORS.get(section) : null;
  if (editor) {
    const canEdit = profile?.id && profile.status === 'active' && ['admin', 'superadmin'].includes(profile.role);
    const trafficGoalFields = !editor.AccountManager && canEdit
      ? CLIENT_TRAFFIC_GOAL_FIELDS.filter((field) => canViewField(field) === true &&
        (field !== 'limite_meta' || canViewField('valor') === true))
      : [];
    if (!canEdit || (!editor.AccountManager && !trafficGoalFields.length)) {
      return (
        <div className="space-y-3">
          <p role="alert">Você não tem permissão para abrir esta edição.</p>
          <Button type="button" variant="outline" onClick={closeEdit}>Voltar</Button>
        </div>
      );
    }
    const selection = ['id', 'empresa', ...trafficGoalFields].join(', ');
    return (
      <ClientHubFocusedEditor
        key={JSON.stringify([profile.id, id, section, selection])}
        id={id}
        editor={editor}
        onClose={closeEdit}
        trafficGoalFields={trafficGoalFields}
        selection={selection}
        focusAccountId={location.state?.focusAccountId}
      />
    );
  }
  return <ClientHubContent id={id} isEditing={isEditing} closeEdit={closeEdit} editTo={editTo} canViewField={canViewField} />;
}

function ClientHubContent({ id, isEditing, closeEdit, editTo, canViewField }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    loading,
    error,
    client,
    responsavel,
    tasks,
    cobertura,
    projects,
    leads,
    campaignsCount,
    pulse,
    refresh,
    refreshSilent,
  } = useClientHubPulse(id);
  const operacao = useClienteOperacao(client);
  const tab = tabFromParams(searchParams);
  const [visited, setVisited] = useState(() => new Set([tab]));
  const [etiquetaCatalog, setEtiquetaCatalog] = useState([]);

  useEffect(() => {
    let active = true;
    fetchEtiquetaRows(supabase).then(({ rows, error: etiquetaError }) => {
      if (active && !etiquetaError) setEtiquetaCatalog(mergeEtiquetaCatalog(rows));
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  useEffect(() => {
    setVisited(new Set([tabFromParams(searchParams)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'resumo') params.delete('aba');
    else params.set('aba', next);
    if (next !== 'escopo') {
      params.delete('section');
      params.delete('month');
    }
    setSearchParams(params, { replace: true });
  };

  if (loading) {
    return (
      <div className="planeje-client-hub">
        <div className="planeje-client-hub-skeleton" style={{ height: 150 }} />
        <div className="planeje-client-hub-skeleton" style={{ height: 44 }} />
        <div className="planeje-client-hub-kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="planeje-client-hub-skeleton" style={{ height: 96 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error === 'not_found' || !client) {
    return (
      <div className="planeje-client-hub">
        <Link to="/clients" className="planeje-client-hub-back">
          <ArrowLeft className="w-4 h-4" />
          Voltar para clientes
        </Link>
        <div className="planeje-client-hub-panel">
          <p className="planeje-client-hub-empty">Cliente não encontrado ou sem permissão de acesso.</p>
        </div>
      </div>
    );
  }

  const logo = client.logo_urls?.[0] || null;
  const etapaLabel = ETAPAS[client.etapa] || client.etapa || '—';
  const valorLabel = canViewField('valor') ? formatMoney(client.valor) : null;
  const vencimentoLabel = canViewField('vencimento') ? formatDue(client.vencimento) : null;
  const showContract = Boolean(valorLabel || vencimentoLabel || (client.tipo_contrato && canViewField('tipo_contrato')));
  const overdueN = tasks.overdue.length;
  const todayN = tasks.today.length;
  const focusTasks = [...tasks.overdue, ...tasks.today];
  const overdueIds = new Set(tasks.overdue.map((t) => t.id));
  const cobPct = cobertura?.cobertura_pct;
  const cobTone = pulse.cobMeta?.tone === 'danger' ? 'danger' : pulse.cobMeta?.tone === 'warn' ? 'warn' : pulse.cobMeta?.tone === 'ok' ? 'ok' : '';
  const localidade = formatClientLocalidade(client);

  const conversasTo = operacao.grupoUrl || buildClientConversasUrl(client.id);
  const shortcuts = [
    { to: buildClientTasksUrl(client.id), icon: CheckSquare, label: 'Tarefas' },
    { to: buildClientProjectsUrl(client.id), icon: FolderKanban, label: 'Projetos' },
    { to: buildClientCrmUrl(client.id), icon: Users, label: 'CRM' },
    { to: buildClientTrafficUrl(client.id), icon: Rocket, label: 'Tráfego' },
    { to: buildClientRastreamentoUrl(client.id), icon: Radio, label: 'Rastreamento' },
    { to: buildClientCoberturaUrl(), icon: Target, label: 'Cobertura' },
    { to: buildClientAssistantUrl(client.id), icon: Bot, label: 'Assistente' },
  ];
  const tabCount = {
    entregas: overdueN + todayN,
    projetos: projects.length,
  };

  return (
    <div className="planeje-client-hub">
      <Helmet>
        <title>{client.empresa} — Planeje</title>
      </Helmet>

      <header className="planeje-client-hub-head">
        <div className="planeje-client-hub-head-top">
          <div className="planeje-client-hub-identity">
            <Link to="/clients" className="planeje-client-hub-back-icon" aria-label="Voltar para a carteira">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="planeje-client-hub-logo">
              <Avatar className="h-full w-full rounded-none">
                <AvatarImage src={logo} alt="" className="object-cover" />
                <AvatarFallback className="rounded-none bg-transparent">
                  <Building className="w-5 h-5 text-slate-400" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0">
              <div className="planeje-client-hub-title-row">
                <h1 className="planeje-client-hub-title">{client.empresa}</h1>
                <span className={cn('planeje-client-hub-health', `is-${pulse.mood.tone}`)}>
                  Saúde {pulse.score} · {pulse.mood.label}
                </span>
              </div>
              <p className="planeje-client-hub-sub">
                {[client.nome_contato, responsavel?.full_name && `Resp. ${responsavel.full_name}`, etapaLabel, localidade]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {(client.etiquetas || []).length > 0 && (
                <div className="planeje-client-hub-chips">
                  {client.etiquetas.map((tag) => (
                    <span key={tag} className="planeje-client-hub-chip">{etiquetaNome(tag, etiquetaCatalog)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="planeje-client-hub-actions">
            {operacao.grupoUrl ? (
              <Button size="sm" asChild>
                <Link to={operacao.grupoUrl}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />
                  Abrir grupo
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to={editTo} state={{ backOnClose: true }}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Editar cadastro
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                refresh();
                operacao.reload();
              }}
              aria-label="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <nav className="planeje-client-hub-shortcuts" aria-label="Abrir em outra tela">
          {shortcuts.map((item) => (
            <Link key={item.label} to={item.to} className="planeje-client-hub-shortcut">
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              <ArrowUpRight className="w-3 h-3 opacity-50" />
            </Link>
          ))}
        </nav>
      </header>

      <div className="planeje-client-hub-tabs" role="tablist" aria-label="Seções do cliente">
        {HUB_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn('planeje-client-hub-tab', tab === item.id && 'is-active')}
            onClick={() => openTab(item.id)}
          >
            {item.label}
            {tabCount[item.id] ? <span className="planeje-client-hub-tab-count">{tabCount[item.id]}</span> : null}
          </button>
        ))}
      </div>

      {visited.has('resumo') && (
        <div className="planeje-client-hub-pane" hidden={tab !== 'resumo'}>
          <div className="planeje-client-hub-kpis">
            <Link to={buildClientCoberturaUrl()} className={cn('planeje-client-hub-kpi', cobTone && `planeje-client-hub-kpi--${cobTone}`)}>
              <p className="planeje-client-hub-kpi-label">Cobertura</p>
              <p className="planeje-client-hub-kpi-value">{formatPct(cobPct)}</p>
              <p className="planeje-client-hub-kpi-sub">{pulse.cobMeta?.label || 'Mês vigente'}</p>
            </Link>
            <button type="button" onClick={() => openTab('entregas')} className={cn('planeje-client-hub-kpi', overdueN > 0 && 'planeje-client-hub-kpi--danger')}>
              <p className="planeje-client-hub-kpi-label">Atrasadas</p>
              <p className="planeje-client-hub-kpi-value">{overdueN}</p>
              <p className="planeje-client-hub-kpi-sub">{todayN} para hoje</p>
            </button>
            <Link to={conversasTo} className={cn('planeje-client-hub-kpi', !operacao.grupo && 'planeje-client-hub-kpi--warn')}>
              <p className="planeje-client-hub-kpi-label">Grupo</p>
              <p className="planeje-client-hub-kpi-value">{operacao.grupo ? 'Vinculado' : 'Falta'}</p>
              <p className="planeje-client-hub-kpi-sub">
                {operacao.grupoConv?.last_message_at
                  ? `Última ${formatAtendimentoTime(operacao.grupoConv.last_message_at)}`
                  : operacao.grupo
                    ? 'WhatsApp da conta'
                    : 'Vincular uma vez'}
              </p>
            </Link>
            <Link to={buildClientCrmUrl(client.id)} className="planeje-client-hub-kpi">
              <p className="planeje-client-hub-kpi-label">Leads</p>
              <p className="planeje-client-hub-kpi-value">{leads.total}</p>
              <p className="planeje-client-hub-kpi-sub">
                {leads.won ? `${leads.won} compra${leads.won > 1 ? 's' : ''}` : campaignsCount ? `${campaignsCount} campanha${campaignsCount > 1 ? 's' : ''}` : 'No pipeline'}
              </p>
            </Link>
          </div>

          <ClienteOperacaoPanel client={client} operacao={operacao} />

          <HubPanel
            title="Entregas que pedem foco"
            link={focusTasks.length > 5 ? (
              <button type="button" className="planeje-client-hub-panel-link" onClick={() => openTab('entregas')}>
                Ver as {focusTasks.length}
              </button>
            ) : (
              <Link to={buildClientTasksUrl(client.id)} className="planeje-client-hub-panel-link">Ver tarefas</Link>
            )}
          >
            {focusTasks.length === 0 ? (
              <p className="planeje-client-hub-empty">Nenhuma tarefa atrasada ou com vencimento hoje.</p>
            ) : (
              <div className="planeje-client-hub-list">
                {focusTasks.slice(0, 5).map((task) => (
                  <TaskRow key={task.id} task={task} clientId={client.id} late={overdueIds.has(task.id)} />
                ))}
              </div>
            )}
          </HubPanel>
        </div>
      )}

      {visited.has('escopo') && (
        <div className="planeje-client-hub-pane" hidden={tab !== 'escopo'}>
          {showContract && (
            <div className="planeje-client-hub-contract">
              <div>
                <p className="planeje-client-hub-kpi-label">Contrato</p>
                <p className="planeje-client-hub-contract-value">
                  {valorLabel ? `${valorLabel}/mês` : 'Sem valor'}
                  {client.tipo_contrato && canViewField('tipo_contrato') ? ` · ${client.tipo_contrato}` : ''}
                </p>
              </div>
              {canViewField('vencimento') && (
                <p className="planeje-client-hub-contract-due">{formatVencimentoLabel(client.vencimento)}</p>
              )}
              <Link to={editTo} state={{ backOnClose: true }} className="planeje-client-hub-panel-link">
                Editar
              </Link>
            </div>
          )}
          <ClientMonthlyScope client={client} />
        </div>
      )}

      {ATLAS_DEMANDS_ENABLED && visited.has('demandas') && <div className="planeje-client-hub-pane" hidden={tab !== 'demandas'}><AtlasDemandCentral clientId={client.id} /></div>}
      {ATLAS_DEMANDS_ENABLED && visited.has('arquivos') && <div className="planeje-client-hub-pane" hidden={tab !== 'arquivos'}><AtlasClientKnowledge client={client} /></div>}
      {visited.has('reunioes') && (
        <div className="planeje-client-hub-pane" hidden={tab !== 'reunioes'}>
          <ClienteReunioesPanel clientId={client.id} />
        </div>
      )}

      {visited.has('entregas') && (
        <div className="planeje-client-hub-pane" hidden={tab !== 'entregas'}>
          <HubPanel
            title={`Atrasadas e para hoje (${focusTasks.length})`}
            link={<Link to={buildClientTasksUrl(client.id)} className="planeje-client-hub-panel-link">Abrir em Tarefas</Link>}
          >
            {focusTasks.length === 0 ? (
              <p className="planeje-client-hub-empty">Nenhuma tarefa atrasada ou com vencimento hoje.</p>
            ) : (
              <div className="planeje-client-hub-list">
                {focusTasks.map((task) => (
                  <TaskRow key={task.id} task={task} clientId={client.id} late={overdueIds.has(task.id)} />
                ))}
              </div>
            )}
          </HubPanel>
        </div>
      )}

      {visited.has('projetos') && (
        <div className="planeje-client-hub-pane" hidden={tab !== 'projetos'}>
          <HubPanel
            title={`Projetos (${projects.length})`}
            link={<Link to={buildClientProjectsUrl(client.id)} className="planeje-client-hub-panel-link">Abrir em Projetos</Link>}
          >
            {projects.length === 0 ? (
              <p className="planeje-client-hub-empty">Nenhum projeto deste cliente.</p>
            ) : (
              <div className="planeje-client-hub-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="planeje-client-hub-item w-full text-left"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="planeje-client-hub-item-title truncate">{project.name || 'Projeto'}</p>
                      <p className="planeje-client-hub-item-meta">
                        {project.status || '—'}
                        {project.mes_referencia ? ` · ${formatDue(project.mes_referencia)}` : ''}
                      </p>
                    </div>
                    <LayoutGrid className="w-4 h-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </HubPanel>
        </div>
      )}

      <AnimatePresence>
        {isEditing && (
          <ClientHubEditDrawer
            key={client.id}
            client={client}
            onClose={closeEdit}
            onSaved={() => {
              closeEdit();
              refreshSilent();
              operacao.reload();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
