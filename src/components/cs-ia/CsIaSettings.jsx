import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { createGestorReads, useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { loadCsConnectionSummary, saveCsChannelFollowing } from './csIaData';
import { loadCsAnalysisSettings, saveCsAnalysisSettings } from './csIaSettingsData';
import { prepareSettings, SETTING_LIMITS } from './csIaPresentation';

const panels = [
  ['faixas', 'Faixas de saúde'], ['alertas', 'Gatilhos de alerta'], ['horario', 'Horário de atendimento'],
  ['leitura', 'Leitura das conversas'], ['tarefas', 'Tarefas'], ['cargos', 'Cargos'], ['conexoes', 'Conexões'],
];
const rules = {
  faixas: {
    note: 'A nota é de 0 a 100. Os limites indicam onde começam as faixas Saudável, Com resultado e Atenção.',
    fields: [['healthy_min', 'Saudável a partir de'], ['result_min', 'Com resultado a partir de'], ['attention_min', 'Atenção a partir de']],
    toggle: ['radar_enabled', 'Registrar avaliações diárias às 9h de Brasília'],
  },
  alertas: {
    note: 'A queda compara avaliações do mesmo vínculo. Os dias de inatividade consideram a última atividade registrada no grupo.',
    fields: [['score_drop', 'Queda de nota em pontos'], ['quiet_days', 'Inatividade em dias'], ['critical_quiet_days', 'Inatividade crítica em dias']],
  },
  horario: {
    note: 'O tempo de espera considera apenas o expediente em horário de Brasília. Use 24 para encerrar à meia-noite.',
    fields: [['start_hour', 'Hora de início'], ['end_hour', 'Hora de fim']],
    toggle: ['weekends', 'Incluir fins de semana no expediente'],
  },
};

function OfficialLink({ to, state, children }) {
  return <Link className="gia-action-link cs-back" to={to} state={state}>{children} <ArrowUpRight aria-hidden="true" /></Link>;
}

const connectionKey = 'conexoes-cs';
const readConnections = () => loadCsConnectionSummary(supabase);
const recordedStatus = { connected: 'Conectado', connecting: 'Conectando', disconnected: 'Desconectado', unknown: 'Sem estado registrado' };

function Connections({ canManage }) {
  const [readStore] = useState(createGestorReads);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const focusId = useRef(null);
  const channels = useGestorRead(readStore, connectionKey, true, readConnections, false);
  const pending = Boolean(channels.request || !channels.data && !channels.error);

  useEffect(() => {
    const refresh = () => { void readStore.run(connectionKey, readConnections, true); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [readStore]);

  useEffect(() => {
    if (pending || busy || !focusId.current) return;
    (document.getElementById(focusId.current) || document.getElementById('cs-refresh-channels'))?.focus();
    focusId.current = null;
  }, [pending, busy]);

  async function changeFollowing(id, following, version) {
    if (!canManage || busy || pending || !version) return;
    setBusy(true);
    setNotice(null);
    focusId.current = `cs-follow-${id}`;
    try {
      await saveCsChannelFollowing(supabase, id, following, version);
      setNotice({ text: following ? 'Acompanhamento retomado para atividade nova.' : 'Acompanhamento pausado.' });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      await readStore.get(connectionKey).request;
      await channels.reload();
      setBusy(false);
    }
  }

  return <>
    <p>Veja a situação registrada dos canais e quantos clientes desta carteira têm grupo vinculado em cada um.</p>
    <div className="cs-actions">
      <button id="cs-refresh-channels" type="button" className="gia-action-link" onClick={() => channels.reload()} disabled={pending || busy}>Atualizar canais</button>
      <OfficialLink to={canManage ? '/conversas/canais?aba=webhook' : '/conversas/canais'}>Abrir canais de Atendimento</OfficialLink>
    </div>
    {(busy || pending) && <p role="status">{busy ? 'Salvando acompanhamento…' : 'Consultando canais…'}</p>}
    {notice && !busy && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'gia-notice' : 'cs-success'}>{notice.text}</p>}
    {channels.error && !pending && <p className="gia-notice" role="alert">{channels.error.message}</p>}
    {channels.data && !pending && (channels.data.length ? <ul className="cs-card-grid" aria-label="Canais do CS IA">
      {channels.data.map(({ id, name, instance_status, linked_clients, following, version, can_configure }) => <li className="gia-panel cs-card" key={id}>
        <h3>{name}</h3>
        <p className="gia-caption">Situação registrada · {recordedStatus[instance_status] || recordedStatus.unknown}</p>
        <p>{linked_clients === 1 ? '1 cliente vinculado' : `${linked_clients} clientes vinculados`}</p>
        {canManage && can_configure && <label className="cs-checkbox">
          <input id={`cs-follow-${id}`} type="checkbox" role="switch" aria-label={`Usar no CS · ${name}`}
            checked={following === true} disabled={busy} onChange={(event) => changeFollowing(id, event.target.checked, version)} />
          Usar no CS
        </label>}
        {following === false && <p className="gia-caption">Acompanhamento pausado</p>}
      </li>)}
    </ul> : <p className="gia-empty">Nenhum canal do CS disponível para esta sessão.</p>)}
    {canManage && <p className="gia-caption">Ao pausar o CS, o WhatsApp segue conectado. O CS retoma os sinais e as rotinas autorizadas a partir da atividade nova.</p>}
    {canManage && <p className="gia-caption">Confira a conexão ao vivo no Atendimento. Para receber saídas de participantes, habilite os eventos de grupo no canal autorizado.</p>}
  </>;
}

const taskFields = ['task_board_enabled', 'task_automation_enabled'];
const readingFields = ['reading_enabled', 'transcription_enabled'];

function VersionedControls({ settings, settingsError, canManage, onSave, onReload, fields, version, name, saveLabel, children }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  if (settingsError) return <p role="alert" className="gia-notice">Não foi possível consultar as opções {name}.{' '}
    <button type="button" onClick={onReload}>Tentar novamente</button></p>;
  if (!settings?.[version]) return <p role="status">Consultando opções {name}…</p>;
  const values = draft || settings;
  const dirty = fields.some(key => values[key] !== settings[key]);
  const outdated = Boolean(draft && draft[version] !== settings[version]);

  function change(key, value) {
    setDraft(previous => ({ ...(previous || settings), [key]: value }));
    setNotice(null);
  }

  async function save(event) {
    event.preventDefault();
    if (!canManage || busy || !dirty || outdated) return;
    setBusy(true);
    setNotice(null);
    try {
      await onSave(draft);
      setDraft(null);
      setNotice({ text: `Opções ${name} salvas.` });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return <form className="gia-stack" onSubmit={save}>
    <fieldset className="gia-stack" disabled={!canManage || busy || outdated}>{children(values, change)}</fieldset>
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'gia-notice' : 'cs-success'}>{notice.text}</p>}
    {outdated && !notice?.error && <p role="alert" className="gia-notice">As opções mudaram em outra sessão. Descarte o rascunho para editar a versão atual.</p>}
    {canManage && <div className="cs-actions">
      {draft && <button type="button" className="gia-action-link" disabled={busy} onClick={() => { setDraft(null); setNotice(null); }}>Descartar alterações</button>}
      <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || !dirty || outdated}>{busy ? 'Salvando…' : saveLabel}</button>
    </div>}
  </form>;
}

function TaskControls(props) {
  return <VersionedControls {...props} fields={taskFields} version="task_controls_version" name="da sala de Tarefas" saveLabel="Salvar opções de Tarefas">
    {({ task_board_enabled: board, task_automation_enabled: automation }, change) => <>
      <legend>Quadro de tarefas</legend>
      <label className="cs-checkbox"><input type="checkbox" role="switch" checked={board}
        aria-describedby="cs-task-board-help" onChange={event => change('task_board_enabled', event.target.checked)} />Usar o quadro de tarefas</label>
      <p id="cs-task-board-help" className="gia-caption">{board
        ? 'A sala Tarefas aparece no menu para quem tem acesso ao módulo.'
        : 'A sala Tarefas fica fora do menu. As tarefas continuam na ficha e em Tarefas para quem tem acesso.'}</p>
      <label className="cs-checkbox"><input type="checkbox" role="switch" checked={board && automation} disabled={!board}
        aria-describedby="cs-task-automation-help" onChange={event => change('task_automation_enabled', event.target.checked)} />Permitir automação de tarefas pelo WhatsApp</label>
      <p id="cs-task-automation-help" className="gia-caption">{board
        ? 'Cada grupo pode autorizar a criação de tarefas e o registro de início por comando ou pelo contexto. Ao retomar, só entram mensagens novas.'
        : 'Ligue o quadro para permitir a automação de tarefas pelo WhatsApp.'}</p>
    </>}
  </VersionedControls>;
}

const analysisKey = 'opcoes-leitura-cs';
const readAnalysis = () => loadCsAnalysisSettings(supabase);

function ReadingControls({ active, canManage }) {
  const [store] = useState(createGestorReads);
  const settings = useGestorRead(store, analysisKey, active, readAnalysis, false);
  useEffect(() => {
    if (!active) return;
    const refresh = () => { void store.run(analysisKey, readAnalysis, true); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active, store]);

  async function save(draft) {
    if (!canManage) throw new Error('Sem permissão para editar as opções de leitura.');
    let failure;
    try {
      await saveCsAnalysisSettings(supabase, draft);
    } catch (error) {
      failure = error;
    }
    await store.get(analysisKey).request;
    const current = await settings.reload();
    if (readingFields.some(key => current?.[key] !== draft[key])) {
      throw failure || new Error('Não foi possível confirmar as opções de leitura.');
    }
  }

  return <VersionedControls settings={settings.data} settingsError={settings.error} canManage={canManage}
    onSave={save} onReload={() => settings.reload()} fields={readingFields} version="version" name="de leitura" saveLabel="Salvar opções de leitura">
    {({ reading_enabled: reading, transcription_enabled: audio }, change) => <>
      <legend>Leitura e transcrição</legend>
      <label className="cs-checkbox"><input type="checkbox" role="switch" checked={reading} aria-describedby="cs-reading-help"
        onChange={event => change('reading_enabled', event.target.checked)} />Ler as conversas dos grupos vinculados</label>
      <p id="cs-reading-help" className="gia-caption">Analisa grupos autorizados depois de uma hora sem mensagens. Pausar suspende os sinais de leitura e a automação de tarefas baseada neles.</p>
      <label className="cs-checkbox"><input type="checkbox" role="switch" checked={audio} aria-describedby="cs-transcription-help"
        onChange={event => change('transcription_enabled', event.target.checked)} />Transcrever os áudios dos grupos</label>
      <p id="cs-transcription-help" className="gia-caption">Cada grupo precisa de autorização própria. A transcrição pode gerar custo no provedor do Atlas.</p>
    </>}
  </VersionedControls>;
}

export default function CsIaSettings({ settings, settingsError, canManage, onSaveSettings, onSaveTaskControls, onReloadSettings, modules, canConfigureAtlas }) {
  const [section, setSection] = useState('faixas');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const values = draft || settings;
  const rule = rules[section];
  const title = panels.find(([key]) => key === section)[1];

  function change(key, value) {
    setDraft((previous) => ({ ...(previous || settings), [key]: value }));
    setError('');
    setSaved(false);
  }

  async function save(event) {
    event.preventDefault();
    if (!draft || busy || !canManage) return;
    let fields;
    try {
      fields = prepareSettings(draft);
    } catch (failure) {
      setError(failure.message);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSaveSettings(fields);
      setDraft(null);
      setSaved(true);
    } catch {
      setError('Não foi possível salvar as regras. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="gia-stack cs-section">
    <header className="gia-header cs-header"><div><p className="gia-eyebrow">CS IA · Squad</p><h1>Configurações</h1><p className="cs-subtitle">Defina como o radar classifica a saúde e sinaliza clientes.</p></div></header>
    <div className="cs-settings-grid">
      <nav aria-label="Seções de configurações" className="gia-panel cs-settings-nav">
        {panels.map(([id, label]) => <button className="gia-action-link" key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}
      </nav>
      <section className="gia-panel gia-stack" aria-labelledby="cs-settings-title">
        <h2 id="cs-settings-title">{title}</h2>
        {section === 'faixas' && <p className="gia-caption">Com o monitoramento do Atlas ativo, essa opção também inclui o radar atual na revisão privada do titular.</p>}
        {rule && <>
          <p className="gia-caption">{rule.note}</p>
          {settingsError && <p className="gia-notice" role="alert">Não foi possível consultar as regras do CS.</p>}
          {!values && !settingsError && <p role="status">Carregando regras…</p>}
          {values && <form className="gia-stack" onSubmit={save}>
            <fieldset className="cs-setting-fields" disabled={!canManage || busy}>
              <legend className="sr-only">{title}</legend>
              {rule.fields.map(([key, label]) => <label className="cs-filter" key={key}><span>{label}</span>
                <input type="number" inputMode="numeric" step="1" min={SETTING_LIMITS[key][0]} max={SETTING_LIMITS[key][1]} required value={values[key] ?? ''} onChange={(event) => change(key, event.target.value)} />
              </label>)}
              {rule.toggle && <label className="cs-checkbox"><input type="checkbox" checked={values[rule.toggle[0]] === true} onChange={(event) => change(rule.toggle[0], event.target.checked)} />{rule.toggle[1]}</label>}
            </fieldset>
            {error && <p className="gia-notice" role="alert">{error}</p>}
            {saved && <p className="cs-success" role="status">Regras salvas.</p>}
            {canManage ? <div className="cs-actions">
              {draft && <button type="button" className="gia-action-link" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Descartar alterações</button>}
              <button type="submit" className="gia-action-link gia-primary-action" disabled={!draft || busy}>{busy ? 'Salvando…' : 'Salvar regras'}</button>
            </div> : <p className="gia-caption">Somente administradores podem alterar estas regras.</p>}
          </form>}
        </>}
        <div hidden={section !== 'leitura'}>
          <div className="gia-stack">
            <ReadingControls active={section === 'leitura'} canManage={canManage} />
            <p className="gia-caption">Ao retomar, cada rotina considera atividade nova. O titular autorizado do Atlas pode alterar o consentimento de cada grupo na aba Conversas da ficha.</p>
            <OfficialLink to="/cs-ia/carteira">Abrir carteira</OfficialLink>
          </div>
        </div>
        <div hidden={section !== 'tarefas'}>
          <div className="gia-stack">
            <p>A sala Tarefas reúne a carteira de CS. Na sala e na ficha do cliente, a criação e a edição usam o editor oficial.</p>
            <TaskControls settings={settings} settingsError={settingsError} canManage={canManage} onSave={onSaveTaskControls} onReload={onReloadSettings} />
            {modules.tasks === true && modules.assistant === true && <p className="gia-caption">Configure as autorizações do grupo na aba Tarefas da ficha do cliente.</p>}
            {modules.tasks === true && <>
              {settings?.task_board_enabled === true && <OfficialLink to="/cs-ia/tarefas">Abrir sala de Tarefas no CS</OfficialLink>}
              <OfficialLink to="/tasks/list" state={{ csTaskView: true }}>Abrir Tarefas</OfficialLink>
            </>}
            {canConfigureAtlas && <OfficialLink to="/assistant/atlas/configuracoes">Configurar automação no Atlas</OfficialLink>}
          </div>
        </div>
        {section === 'cargos' && <>
          <p>Cadastre cargos operacionais e associe cada pessoa ao cargo correspondente na aba Equipe.</p>
          <OfficialLink to="/cs-ia/equipe?aba=cargos">Abrir cargos da equipe</OfficialLink>
        </>}
        {section === 'conexoes' && <Connections canManage={canManage} />}
      </section>
    </div>
  </div>;
}
