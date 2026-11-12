import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, ListChecks, MessagesSquare, Settings, Users } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { buildCsAtlasDraft, buildCsTriageDraft, csAtlasCreationRule, readCsAtlasDemandReference } from '@/lib/csIaAtlasDraft';
import { ATLAS_DEMANDS_ENABLED } from '@/lib/atlasDemands';
import { ATLAS_EVENTS_PILOT } from '@/lib/atlasEvents';
import { buildClientAtlasDemandsUrl } from '@/lib/clientHubRoutes';
import { clearDataCacheByPrefix } from '@/hooks/useDataCache';
import GestorIaSidebar from '@/components/gestor-ia/GestorIaSidebar';
import { createGestorReads, useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { CsIaToday, CsIaPortfolio, CsIaGroups } from './CsIaViews';
import CsIaTeam from './CsIaTeam';
import CsIaClient from './CsIaClient';
import { CsIaTaskRoom } from './CsIaTasks';
import CsIaSettings from './CsIaSettings';
import { CsIaChurn } from './CsIaChurn';
import { canManageCsIa, canUseCsIa, closeCsRelationship, csTaskContextOptions, csTaskCreationOptions, csTaskMoveOptions, loadCsAtlasAutomation, loadCsAtlasDemandReference, loadCsAtlasGroupActivity, loadCsAtlasGroupRequests, loadCsChurn, loadCsClientSource, loadCsTasks, loadCsDemandAccess, loadCsHistory, loadCsPeople, loadCsRadar, loadCsReading, loadCsResponseTimes,
  loadCsReadingSignals, loadCsTeamStructure, saveCsDemand, saveCsReading, saveCsStatus, saveCsTeamLabel,
  saveCsTeamPerson } from './csIaData';
import { loadCsSettings, saveCsSettings, saveCsTaskControls } from './csIaSettingsData';
import { attachCsReadings, primaryCsSignal, priorityRows, readingInChannelWindow, sameCsGroup } from './csIaPresentation';
import '@/components/gestor-ia/GestorIa.css';
import './CsIa.css';

const TABS = [
  ['hoje', 'Hoje', CalendarDays], ['carteira', 'Carteira', Briefcase], ['grupos', 'Grupos', MessagesSquare],
  ['tarefas', 'Tarefas', ListChecks], ['equipe', 'Equipe', Users], ['configuracoes', 'Configurações', Settings],
];

async function withoutStaleData(load) {
  try {
    return await load();
  } catch (error) {
    error.accessDenied = true;
    throw error;
  }
}

function taskClientScope(rows, clientId) {
  return rows.map(row => row.client_id).filter(id => !clientId || id === clientId).sort();
}

const taskKey = ids => `tarefas:${JSON.stringify(ids)}`;

export default function CsIaWorkspace() {
  const { user, profile, loading: authLoading } = useAuth();
  const { moduleSettings, moduleAccess, loading: modulesLoading } = useModuleSettings();
  if (authLoading || modulesLoading) return <p className="p-6" role="status">Carregando acesso ao CS IA…</p>;
  if (!canUseCsIa(profile, moduleSettings)) return <main className="p-6"><h1>Acesso ao CS IA indisponível</h1><Link to="/caixa">Voltar ao Planeje</Link></main>;
  const identity = JSON.stringify([profile.id, user?.id, profile.role, moduleAccess?.clients, moduleAccess?.atendimento,
    moduleAccess?.tasks, moduleSettings?.tasks, moduleSettings?.assistant]);
  return <CsIaAuthorized key={identity} profile={profile} user={user} moduleSettings={moduleSettings} tasksAccess={moduleAccess?.tasks} />;
}

function CsIaAuthorized({ profile, user, moduleSettings, tasksAccess }) {
  const location = useLocation();
  const navigate = useNavigate();
  const scroll = useRef(null);
  const [store] = useState(createGestorReads);
  const [atlasErrorFor, setAtlasErrorFor] = useState(null);
  const clientRoute = useMatch('/cs-ia/clientes/:clientId');
  const section = clientRoute ? 'carteira' : location.pathname.replace(/\/$/, '').split('/').at(-1);
  const tasksEnabled = moduleSettings.tasks === true;
  const settings = useGestorRead(store, 'configuracoes', tasksEnabled || section === 'configuracoes' || section === 'hoje',
    () => withoutStaleData(() => loadCsSettings(supabase)));
  const taskRoomAvailable = tasksEnabled && settings.data?.task_board_enabled === true;
  const taskRoomPending = tasksEnabled && !settings.data && !settings.error;
  const inTaskRoom = section === 'tarefas';
  const usesRadar = !['configuracoes', 'encerrados'].includes(section) && (!inTaskRoom || taskRoomAvailable);
  const onList = !clientRoute && ['hoje', 'carteira'].includes(section);
  const canManage = canManageCsIa(profile, moduleSettings);
  const radar = useGestorRead(store, 'radar', !inTaskRoom || taskRoomAvailable, () => withoutStaleData(() => loadCsRadar(supabase)));
  const rows = radar.data || [];
  const row = rows.find((entry) => entry.client_id === clientRoute?.params.clientId);
  const peopleScope = rows.map((entry) => entry.owner_id).filter(Boolean).sort().join(',');
  const people = useGestorRead(store, `equipe:${peopleScope}`, section === 'equipe' && Boolean(radar.data),
    () => withoutStaleData(() => loadCsPeople(supabase, profile, rows)));
  const organization = useGestorRead(store, 'equipe-estrutura', section === 'equipe',
    () => withoutStaleData(() => loadCsTeamStructure(supabase)));
  const historyScope = JSON.stringify([row?.client_id, row?.conversation_id, row?.channel_id, row?.wa_client_id, row?.group_jid]);
  const history = useGestorRead(store, `historico:${historyScope}`, Boolean(row),
    () => withoutStaleData(() => loadCsHistory(supabase, row.client_id)));
  const params = new URLSearchParams(location.search);
  const clientTab = params.get('aba');
  const sourceEnabled = Boolean(row) && (clientTab === 'crm' && moduleSettings.crm === true || clientTab === 'arquivos' && ATLAS_DEMANDS_ENABLED);
  const source = useGestorRead(store, `ficha-fonte:${row?.client_id}:${clientTab}`, sourceEnabled,
    () => withoutStaleData(() => loadCsClientSource(supabase, row.client_id, clientTab)));
  const responseDays = params.get('resposta') === '30' ? 30 : 7;
  const responseTimes = useGestorRead(store, `respostas:${responseDays}`, section === 'equipe' && !['squads', 'cargos'].includes(clientTab),
    () => withoutStaleData(() => loadCsResponseTimes(supabase, responseDays)));
  const taskArea = inTaskRoom ? taskRoomAvailable : tasksEnabled && Boolean(clientRoute && clientTab === 'tarefas');
  const taskClient = inTaskRoom ? params.get('cliente') : clientRoute?.params.clientId;
  const taskClients = taskArea ? taskClientScope(rows, taskClient) : [];
  const readTasks = ids => withoutStaleData(() => loadCsTasks(supabase, ids, {
    assigneeId: profile.role === 'colaborador' && tasksAccess === 'responsible' ? profile.id : undefined,
  }));
  const tasks = useGestorRead(store, taskKey(taskClients), taskArea && Boolean(radar.data) && !radar.request,
    () => readTasks(taskClients));
  const movementVisible = tasksEnabled && clientTab === 'tarefas' && moduleSettings.assistant === true && Boolean(row);
  const movementAvailable = movementVisible && row.group_status === 'linked';
  const movement = useGestorRead(store, `movimento:${row?.client_id}:${row?.conversation_id}:${row?.channel_id}`, movementAvailable,
    () => withoutStaleData(() => csTaskMoveOptions(supabase, row)));
  const creation = useGestorRead(store, `criação:${row?.client_id}:${row?.conversation_id}:${row?.channel_id}`, movementAvailable,
    () => withoutStaleData(() => csTaskCreationOptions(supabase, row)));
  const contextual = useGestorRead(store, `contexto:${row?.client_id}:${row?.conversation_id}:${row?.channel_id}`, movementAvailable,
    () => withoutStaleData(() => csTaskContextOptions(supabase, row)));
  const churn = useGestorRead(store, 'encerrados', section === 'encerrados', () => withoutStaleData(() => loadCsChurn(supabase)));
  const readingSignals = useGestorRead(store, 'sinais-conversas', onList,
    () => withoutStaleData(() => loadCsReadingSignals(supabase)));
  const reading = useGestorRead(store, `leitura:${historyScope}`,
    Boolean(row && (clientTab === 'conversas' || row.group_status === 'linked')),
    () => withoutStaleData(() => loadCsReading(supabase, row.client_id)));
  const atlas = useGestorRead(store, 'atlas', Boolean((row || section === 'hoje') && user?.id && moduleSettings?.assistant), async () => {
    const { data, error } = await supabase.from('atlas_settings').select('owner_id,enabled')
      .eq('owner_id', user.id).eq('enabled', true).maybeSingle();
    return !error && data?.owner_id === user.id && data.enabled === true;
  });
  const atlasDemandEnabled = ATLAS_DEMANDS_ENABLED && Boolean(user?.id) && canManage && moduleSettings.tasks === true &&
    moduleSettings.assistant === true && (Boolean(row && clientTab === 'tarefas') || section === 'configuracoes');
  const demandAccess = useGestorRead(store, 'atlas-demand-access', atlasDemandEnabled,
    () => withoutStaleData(() => loadCsDemandAccess(supabase)));
  const canPrepareDemand = demandAccess.data === true;
  const demandReference = clientTab === 'tarefas' ? readCsAtlasDemandReference(location.state, user?.id, row?.client_id) : null;
  const reference = useGestorRead(store, `resposta-demanda:${location.key}:${demandReference?.runId}`, canPrepareDemand && Boolean(demandReference),
    () => withoutStaleData(() => loadCsAtlasDemandReference(supabase, demandReference)));
  const automation = useGestorRead(store, 'atlas-demand-automation', ATLAS_EVENTS_PILOT && canPrepareDemand && Boolean(row),
    () => withoutStaleData(() => loadCsAtlasAutomation(supabase, user.id)));
  const groupRequestsEnabled = ATLAS_EVENTS_PILOT && atlasDemandEnabled && canPrepareDemand &&
    clientTab === 'tarefas' && row?.group_status === 'linked';
  const groupRequests = useGestorRead(store, `pedidos:${historyScope}`, groupRequestsEnabled, () => withoutStaleData(async () => {
    const [rows, activity] = await Promise.all([
      loadCsAtlasGroupRequests(supabase, row), loadCsAtlasGroupActivity(supabase, row).catch(() => null),
    ]);
    return { rows, activity };
  }));
  const refresh = useRef(null);
  refresh.current = reload;
  const routeIdentity = location.key;
  const currentRoute = useRef(null);

  useLayoutEffect(() => {
    currentRoute.current = routeIdentity;
    return () => { currentRoute.current = null; };
  }, [routeIdentity]);

  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [location.pathname]);

  const refreshSearch = !clientRoute && section === 'carteira' ? '' : location.search;
  useLayoutEffect(() => { void refresh.current(); }, [location.pathname, refreshSearch]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refresh.current();
    };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => document.removeEventListener('visibilitychange', refreshVisible);
  }, []);

  async function reload() {
    const latestTasks = radar.reload().then((latestRows) => {
      if (!taskArea || !latestRows || currentRoute.current !== routeIdentity) return;
      const ids = taskClientScope(latestRows, taskClient);
      return store.run(taskKey(ids), () => readTasks(ids), true);
    });
    await Promise.all([latestTasks, people.reload(), history.reload(), settings.reload(), atlas.reload(), churn.reload(),
      readingSignals.reload(), reading.reload(), organization.reload(), responseTimes.reload(), demandAccess.reload(), automation.reload(),
      movement.reload(), creation.reload(), contextual.reload(), groupRequests.reload(), source.reload()]);
  }

  async function changeTeam(save, ...args) {
    if (!canManage) throw new Error('Sem permissão para editar a organização da equipe.');
    try {
      await save(supabase, ...args);
    } finally {
      await store.get('equipe-estrutura').request;
      await organization.reload();
    }
  }

  async function saveStatus(status) {
    if (!canManage || !row) throw new Error('Sem permissão para editar a situação.');
    await saveCsStatus(supabase, row.client_id, status);
    await radar.reload();
  }

  async function saveSettings(draft) {
    if (!canManage) throw new Error('Sem permissão para editar as regras de CS.');
    const saved = await saveCsSettings(supabase, draft);
    await Promise.all([settings.reload(() => Promise.resolve(saved)), radar.reload()]);
  }

  async function saveTaskControls(draft) {
    if (!canManage) throw new Error('Sem permissão para editar as opções de Tarefas.');
    let failure;
    try {
      await saveCsTaskControls(supabase, draft);
    } catch (error) {
      failure = error;
    }
    await store.get('configuracoes').request;
    const current = await settings.reload();
    if (failure && (current?.task_board_enabled !== draft.task_board_enabled ||
      current?.task_automation_enabled !== draft.task_automation_enabled)) throw failure;
  }

  async function closeRelationship(reason) {
    if (!canManage || !row) throw new Error('Sem permissão para encerrar o acompanhamento.');
    const saved = await closeCsRelationship(supabase, row.client_id, reason);
    clearDataCacheByPrefix('clients_');
    if (currentRoute.current === routeIdentity) navigate('/cs-ia/encerrados', { replace: true, state: { csChurnId: saved.id } });
  }

  async function changeReading(values) {
    if (!canManage || !row || !reading.data?.can_configure) throw new Error('Sem permissão para alterar a leitura deste grupo.');
    if (values.enabled && (row.group_status !== 'linked' || values.conversation_id !== row.conversation_id)) {
      throw new Error('O grupo mudou. Atualize a leitura e confira o vínculo.');
    }
    await saveCsReading(supabase, row.client_id, values);
    await Promise.all([reading.reload(), radar.reload()]);
  }

  async function changeTaskRule(rule, save, enabled) {
    const allowed = rule.data?.can_configure || enabled === false && rule.data?.can_revoke;
    if (!canManage || !movementAvailable || !allowed || currentRoute.current !== routeIdentity) {
      throw new Error('Sem acesso à regra de automação deste grupo.');
    }
    const saved = await save(supabase, row, enabled);
    await rule.reload(() => Promise.resolve(saved));
  }

  const taskRuleProps = (rule, save) => movementVisible ? {
    options: rule.refreshing ? null : rule.data,
    loading: movementAvailable && (rule.refreshing || !rule.data && !rule.error),
    error: rule.error?.message, onSave: enabled => changeTaskRule(rule, save, enabled),
  } : null;

  async function openAtlas(purpose, question, clientId = row?.client_id) {
    const triage = section === 'hoje' && purpose === 'triage';
    if (atlas.data !== true || !user?.id || (!triage && !clientId)) return;
    setAtlasErrorFor(null);
    const [latestRows, atlasAllowed, latestSignals] = await Promise.all([radar.reload(), atlas.reload(), onList ? readingSignals.reload() : null]);
    if (currentRoute.current !== routeIdentity) return;
    let state;
    if (atlasAllowed === true && latestRows) {
      const currentRows = latestSignals ? attachCsReadings(latestRows, latestSignals) : latestRows;
      if (triage) {
        const pending = priorityRows(currentRows);
        state = buildCsTriageDraft({ ownerId: user.id, clientCount: currentRows.length, signals: pending.map(primaryCsSignal) });
      } else {
        const latest = currentRows.find((entry) => entry.client_id === clientId);
        if (latest) state = buildCsAtlasDraft({ ownerId: user.id, row: { ...latest, signal: primaryCsSignal(latest) }, purpose, question });
      }
    }
    if (state) navigate('/assistant/atlas?view=conversation', { state });
    else setAtlasErrorFor(routeIdentity);
  }

  async function createDemand(value) {
    const isCurrent = () => currentRoute.current === routeIdentity;
    if (!canPrepareDemand || !row || clientTab !== 'tarefas') throw new Error('Sem acesso às Demandas do Atlas nesta ficha.');
    const saved = await saveCsDemand(supabase, row.client_id, value, isCurrent);
    if (isCurrent()) {
      navigate(buildClientAtlasDemandsUrl(row.client_id, saved.id));
    }
  }

  const visibleReading = reading.data?.status === 'completed' &&
    (row?.group_status !== 'linked' || !row.conversation_id || reading.data.conversation_id !== row.conversation_id ||
      !readingInChannelWindow(row, reading.data) ||
      (reading.data.channel_id && !sameCsGroup(row, reading.data)))
    ? { enabled: reading.data.enabled, can_configure: false, status: 'unavailable' } : reading.data;
  const conversationReading = { reading: reading.refreshing ? null : visibleReading, loading: reading.refreshing || !reading.data && !reading.error,
    error: reading.error?.message, onReload: () => reading.reload(), onSave: changeReading };
  const [clientWithReading] = row && !reading.refreshing && visibleReading?.status === 'completed'
    ? attachCsReadings([row], [{ ...visibleReading, client_id: row.client_id }]) : [row];
  const general = { rows: onList && !readingSignals.refreshing && readingSignals.data ? attachCsReadings(rows, readingSignals.data) : rows,
    people: people.data || [], canManage, canManageTeam: profile.role === 'superadmin', onReload: reload, refreshing: radar.refreshing };
  const radarError = radar.error && !radar.data;
  const radarPending = !radar.error && !radar.data;
  const taskBoard = { actorId: user?.id, board: tasks.refreshing ? null : tasks.data, error: tasks.error?.message,
    loading: tasks.refreshing || !tasks.data && !tasks.error, onReload: reload };

  return <div className="gestor-ia cs-ia" ref={scroll}>
    <GestorIaSidebar workspace="cs-ia" tabs={taskRoomAvailable ? TABS : TABS.filter(([key]) => key !== 'tarefas')}
      activeTab={section === 'encerrados' ? 'carteira' : section} profileName={profile.full_name || 'Minha conta'} />
    <main className="gia-main" aria-label="CS IA">
      {radarError && usesRadar && <div className="gia-notice" role="alert">{radar.error.message} <button type="button" onClick={reload}>Tentar novamente</button></div>}
      {section === 'equipe' && people.error && <p className="gia-notice" role="alert">{people.error.message}</p>}
      {onList && readingSignals.error && <p className="gia-notice" role="alert">{readingSignals.error.message}</p>}
      {atlasErrorFor === routeIdentity && <p className="gia-notice" role="alert">Não foi possível preparar o rascunho no Atlas.</p>}
      {(radarPending || radar.refreshing) && usesRadar && <p role="status">Carregando carteira de CS…</p>}
      {(!radarPending && !radarError || !usesRadar) && <div hidden={radar.refreshing && usesRadar}><Routes>
        <Route index element={<Navigate to="hoje" replace />} />
        <Route path="hoje" element={<CsIaToday {...general} settings={settings.refreshing || settings.error ? null : settings.data}
          settingsError={settings.error?.message} onOpenAtlas={atlas.data === true ? openAtlas : undefined} />} />
        <Route path="carteira" element={<CsIaPortfolio {...general} modules={moduleSettings} />} />
        <Route path="encerrados" element={<CsIaChurn entries={churn.refreshing ? [] : churn.data || []}
          loading={churn.refreshing || !churn.data && !churn.error} error={churn.error?.message}
          confirmedId={location.state?.csChurnId} onReload={reload} />} />
        <Route path="grupos" element={<CsIaGroups {...general} readStore={store} />} />
        <Route path="tarefas" element={taskRoomAvailable ? <CsIaTaskRoom rows={rows} {...taskBoard} />
          : <section className="gia-panel gia-stack"><h1>Tarefas</h1>
            {taskRoomPending ? <p role="status">Consultando disponibilidade da sala de Tarefas…</p> :
              <p role="alert">{tasksEnabled && settings.data?.task_board_enabled === false
                ? 'A sala de Tarefas está desligada nas configurações do CS.'
                : 'Tarefas está indisponível para esta sessão.'}</p>}
            <Link className="gia-action-link cs-back" to="/cs-ia/carteira">Voltar à carteira</Link></section>} />
        <Route path="equipe" element={<CsIaTeam {...general} organization={organization.data} onReload={() => organization.reload()}
          responses={{ days: responseDays, rows: responseTimes.refreshing ? [] : responseTimes.data || [],
            loading: responseTimes.refreshing || !responseTimes.data && !responseTimes.error,
            error: responseTimes.error?.message, onReload: () => responseTimes.reload() }} viewerId={profile.id}
          refreshing={organization.refreshing || !organization.data && !organization.error} error={organization.error?.message}
          onSaveLabel={(...args) => changeTeam(saveCsTeamLabel, ...args)} onSavePerson={(...args) => changeTeam(saveCsTeamPerson, ...args)} />} />
        <Route path="configuracoes" element={<CsIaSettings settings={settings.data} settingsError={settings.error?.message} canManage={canManage}
          modules={moduleSettings} canConfigureAtlas={canPrepareDemand && ATLAS_EVENTS_PILOT}
          onSaveSettings={saveSettings} onSaveTaskControls={saveTaskControls} onReloadSettings={() => settings.reload()} />} />
        <Route path="clientes/:clientId" element={row ? <CsIaClient key={row.client_id} row={clientWithReading}
          history={history.refreshing ? null : history.data} historyLoading={history.refreshing || !history.data && !history.error}
          historyError={history.error?.message} onReloadHistory={() => history.reload()}
          source={source}
          canManage={canManage} modules={moduleSettings} canOpenAtlas={atlas.data === true} onSaveStatus={saveStatus} onOpenAtlas={openAtlas}
          onChurn={closeRelationship} conversationReading={conversationReading} onGroupChange={reload} tasks={{ ...taskBoard,
            movement: taskRuleProps(movement, csTaskMoveOptions), creation: taskRuleProps(creation, csTaskCreationOptions),
            contextual: taskRuleProps(contextual, csTaskContextOptions),
            demand: { allowed: canPrepareDemand, onCreate: createDemand, error: demandAccess.error?.message || automation.error?.message,
              reference: demandReference ? { key: location.key, text: reference.data, error: reference.error?.message,
                pendingAccess: atlasDemandEnabled && !demandAccess.error && demandAccess.data === undefined, onReload: () => reference.reload() } : null,
              settings: ATLAS_EVENTS_PILOT, rule: !automation.refreshing && automation.data ? csAtlasCreationRule(row, automation.data) : null,
              groupRequests: groupRequestsEnabled ? {
                ...(groupRequests.refreshing || demandAccess.refreshing ? null : groupRequests.data),
                error: groupRequests.error?.message, onReload: () => groupRequests.reload(),
              } : null } }} />
          : <div className="gia-panel"><h1>Cliente indisponível</h1><Link to="/cs-ia/carteira">Voltar à carteira</Link></div>} />
        <Route path="*" element={<Navigate to="/cs-ia/hoje" replace />} />
      </Routes></div>}
    </main>
  </div>;
}
