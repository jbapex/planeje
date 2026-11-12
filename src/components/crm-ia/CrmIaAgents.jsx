import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrmIaEditor, CrmIaField, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { AGENT_TYPES, count, lines, money, named, versionOf } from './crmIaPresentation';
import { CRM_IA_TTS_VOICES, normalizeCrmIaAudio } from '../../../supabase/functions/_shared/crmIaVoice';
import { agentAudioMode, agentDraftPayload, agentDraftScope, createAgentDraftSession } from './crmIaAgentDraft';
import CrmIaAgentProfiles from './CrmIaAgentProfiles';
import CrmIaAgentNavigation from './CrmIaAgentNavigation';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const blank = label => ({ value: '', label });
const notificationDefaults = value => ({ enabled: false, ...value, recipient: { type: 'lead_owner', person_id: null, phone: null, ...value?.recipient } });
const AGENT_TABS = [['agentes', 'Agentes'], ['knowledge', 'Base de conhecimento'], ['products', 'Produtos e serviços'], ['concierge', 'Concierge']];
const SCHEDULE_FIELDS = [
  ['duration_minutes', 'Duração em minutos', 30, 5, 720], ['interval_minutes', 'Intervalo entre horários', 30, 5, 720],
  ['buffer_before', 'Folga antes, em minutos', 0, 0, 240], ['buffer_after', 'Folga depois, em minutos', 0, 0, 240],
  ['min_notice_hours', 'Antecedência mínima, em horas', 1, 0, 720], ['max_future_days', 'Janela futura, em dias', 60, 1, 366],
  ['daily_limit', 'Máximo de compromissos por dia', 8, 1, 200],
];

export default function CrmIaAgents({ api, mutate, workspace, canManage, revision }) {
  const [params, setParams] = useSearchParams();
  const tab = AGENT_TABS.some(([id]) => id === params.get('aba')) ? params.get('aba') : 'agentes';
  const pipelineId = params.get('pipeline_id') || workspace.pipelines[0]?.id || '';
  const [editing, setEditing] = useState(null);
  useEffect(() => setEditing(null), [workspace.client.id]);
  const [reload, setReload] = useState(0);
  const usage = useCrmRead(api, 'usage', {}, `${revision}:${reload}`, tab === 'agentes');
  const changeTab = value => setParams(old => { const next = new URLSearchParams(old); next.set('aba', value); return next; });
  return <div className="crm-ia-stack"><div className="crm-ia-section-tabs" role="group" aria-label="Áreas dos agentes">{AGENT_TABS.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => changeTab(id)}>{label}</button>)}</div>
    {tab === 'agentes' ? <><div className="crm-ia-toolbar"><CrmIaField label="Funil dos agentes" value={pipelineId} onChange={id => setParams(old => { const next = new URLSearchParams(old); next.set('pipeline_id', id); return next; })} options={[blank('Selecione um funil'), ...workspace.pipelines]} /><span className="crm-ia-muted">Autonomia e configuração são controles separados.</span></div>
      <div className="crm-ia-agent-grid">{AGENT_TYPES.map(([type, title, description]) => { const agent = workspace.agents.find(item => item.funil?.crm_ia?.tipo === type && item.funil.crm_ia.pipeline_id === pipelineId); const measured = usage.data?.by_agent?.find(item => item.id === agent?.id); return <article className="crm-ia-card crm-ia-agent-card" key={type}><div className="crm-ia-section-heading"><span className={`crm-ia-agent-symbol is-${type}`} aria-hidden="true">{type === 'qualificacao' ? 'Q' : type === 'followup' ? 'F' : 'A'}</span><span className="crm-ia-badge">{agent ? agent.auto_responder ? 'Autonomia ligada' : agent.ativo ? 'Preparado · manual' : 'Desativado' : 'Não configurado'}</span></div><h2>{title}</h2><p>{description}</p><strong>{agent?.nome || 'Prepare este agente'}</strong><p className="crm-ia-muted">{agent?.objetivo || 'Defina identidade, etapas e regras de passagem.'}</p><small>Respostas registradas: {count(measured?.responses)}</small>{canManage && <button className="crm-ia-link-button" type="button" disabled={!pipelineId} onClick={() => setEditing({ clientId: workspace.client.id, type, row: agent })}>{`Configurar ${title}`}</button>}</article>; })}</div>
      <section className="crm-ia-card"><div className="crm-ia-section-heading"><h2>Uso da IA</h2><button type="button" onClick={() => setReload(value => value + 1)}>Atualizar uso</button></div><CrmIaState read={usage} retry={() => setReload(value => value + 1)}><p>{count(usage.data?.responses)} respostas · {count(usage.data?.tokens)} tokens registrados</p><p className="crm-ia-muted">Franquia e saldo do provedor não estão disponíveis nesta leitura.</p></CrmIaState></section>
      {workspace.agents.filter(agent => !agent.funil?.crm_ia?.tipo).length > 0 && <section className="crm-ia-card"><h2>Agentes existentes</h2><p className="crm-ia-muted">Preserve as regras anteriores ao vincular um tipo do CRM IA.</p><ul className="crm-ia-list">{workspace.agents.filter(agent => !agent.funil?.crm_ia?.tipo).map(agent => <li key={agent.id}><strong>{agent.nome}</strong>{canManage && <button type="button" onClick={() => setEditing({ clientId: workspace.client.id, type: 'qualificacao', row: agent })}>Configurar {agent.nome}</button>}</li>)}</ul></section>}
    </> : tab === 'concierge' ? <CrmIaConcierge {...{ workspace, mutate, canManage }} /> : <CrmIaCatalog tab={tab} {...{ workspace, mutate, canManage }} />}
    {editing?.clientId === workspace.client.id && <CrmIaAgentEditor key={`${workspace.client.id}:${editing.row?.id || `${editing.type}:${pipelineId}`}`} {...{ api, mutate, workspace, pipelineId }} row={editing.row} type={editing.type} onClose={() => setEditing(null)} />}
  </div>;
}

function WindowFields({ rows, onChange }) {
  return <div className="crm-ia-stack"><p className="crm-ia-muted">Sem janelas, o agente pode atuar em qualquer horário autorizado. A pausa humana continua válida.</p>{rows.map((row, index) => <div className="crm-ia-window" key={index}><div className="crm-ia-days">{DAYS.map((day, number) => <CrmIaField key={day} label={`${day}, janela ${index + 1}`} type="checkbox" value={row.dias?.includes(number)} onChange={checked => onChange(rows.map((item, i) => i === index ? { ...item, dias: checked ? [...(item.dias || []), number].sort() : item.dias.filter(value => value !== number) } : item))} />)}</div><CrmIaField label={`Início da janela ${index + 1}`} type="time" value={row.inicio} onChange={inicio => onChange(rows.map((item, i) => i === index ? { ...item, inicio } : item))} /><CrmIaField label={`Fim da janela ${index + 1}`} type="time" value={row.fim} onChange={fim => onChange(rows.map((item, i) => i === index ? { ...item, fim } : item))} /><button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remover janela {index + 1}</button></div>)}<button type="button" onClick={() => onChange([...rows, { dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00' }])}>Adicionar janela</button></div>;
}

function CadenceFields({ rows, onChange, reminders = false }) {
  return <div className="crm-ia-stack">{rows.map((row, index) => <div className="crm-ia-toolbar" key={index}><CrmIaField label={`${reminders ? 'Antecedência do lembrete' : 'Intervalo da tentativa'} ${index + 1}`} type="number" min="1" value={row.valor} onChange={valor => onChange(rows.map((item, i) => i === index ? { ...item, valor: Number(valor) } : item))} /><CrmIaField label={`Unidade ${index + 1}`} value={row.unidade} onChange={unidade => onChange(rows.map((item, i) => i === index ? { ...item, unidade } : item))} options={[{ value: 'horas', label: 'Horas' }, { value: 'dias', label: 'Dias' }]} /><button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remover {index + 1}</button></div>)}<button type="button" onClick={() => onChange([...rows, { valor: 1, unidade: 'dias' }])}>{reminders ? 'Adicionar lembrete' : 'Adicionar tentativa'}</button></div>;
}

function CrmIaAgentEditor({ row = {}, type, pipelineId, workspace, api, mutate, onClose }) {
  const [initialRow] = useState(row);
  const [initialAudio] = useState(() => {
    try { return { settings: normalizeCrmIaAudio(row.funil?.crm_ia?.audio) }; }
    catch { return { settings: normalizeCrmIaAudio(), error: 'A configuração de áudio anterior é inválida. Ao salvar, serão usadas as opções exibidas.' }; }
  });
  const [draft, setDraft] = useState(() => ({ nome: '', objetivo: '', instrucoes: '', tom: 'cordial', modelo: 'openai/gpt-4o-mini', base_ids: [], setor_ids: [], ativo: true, auto_responder: false, ...row }));
  const [rules, setRules] = useState(() => ({ tipo: type, pipeline_id: pipelineId, stage_ids: [], idiomas: ['pt'], variaveis: [], profiles: [], gatilhos: [], janelas: [], cadencia: [], destino: { tipo: 'humano' }, agendamento: {}, ...row.funil?.crm_ia, notification: notificationDefaults(row.funil?.crm_ia?.notification), audio: initialAudio.settings }));
  const [activeSection, setActiveSection] = useState('identity');
  const sectionsRef = useRef(null);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const [audioRefresh, setAudioRefresh] = useState(0);
  const [draftState, setDraftState] = useState({ phase: 'loading', ready: false });
  const [session] = useState(() => createAgentDraftSession({ scope: agentDraftScope(row, type, pipelineId),
    api: (action, payload) => action === 'publish_agent_draft' ? mutate(action, payload) : api(action, payload), onState: setDraftState }));
  const mounted = useRef(true);
  const draftRef = useRef(draft);
  const rulesRef = useRef(rules);
  const capabilities = useCrmRead(api, 'capabilities', {}, audioRefresh);
  const audio = rules.audio;
  const availability = workspace.config.data.availability || {};
  const set = (key, value) => { const next = { ...draftRef.current, [key]: value }; draftRef.current = next; setDraft(next); session.change(agentDraftPayload(next, rulesRef.current, initialRow)); };
  const updateRules = next => { rulesRef.current = next; setRules(next); session.change(agentDraftPayload(draftRef.current, next, initialRow)); };
  const rule = (key, value) => updateRules({ ...rulesRef.current, [key]: value });
  const audioRule = (key, value) => rule('audio', { ...rulesRef.current.audio, [key]: value });
  const schedule = (key, value) => rule('agendamento', { ...rulesRef.current.agendamento, [key]: value });
  const title = AGENT_TYPES.find(([id]) => id === rules.tipo)?.[1] || 'Agente';
  const stages = workspace.stages.filter(stage => stage.pipeline_id === rules.pipeline_id);
  const loadDraft = useCallback(async () => {
    try {
      const result = await session.load();
      if (!mounted.current) return;
      const saved = result.draft?.payload || result.published || initialRow, savedRules = saved.funil?.crm_ia || {};
      const baseAudio = result.published ? normalizeCrmIaAudio(result.published.funil?.crm_ia?.audio) : initialAudio.settings;
      const savedAudio = savedRules.audio === undefined ? baseAudio : savedRules.audio && typeof savedRules.audio === 'object' && !Array.isArray(savedRules.audio)
        ? { ...baseAudio, ...savedRules.audio } : normalizeCrmIaAudio(savedRules.audio);
      const nextDraft = { nome: '', objetivo: '', instrucoes: '', tom: 'cordial', modelo: 'openai/gpt-4o-mini', base_ids: [], setor_ids: [], ativo: true, auto_responder: false, ...initialRow, ...saved };
      const nextRules = { tipo: type, pipeline_id: pipelineId, stage_ids: [], idiomas: ['pt'], variaveis: [], profiles: [], gatilhos: [], janelas: [], cadencia: [], destino: { tipo: 'humano' }, agendamento: {}, ...initialRow.funil?.crm_ia, ...savedRules, notification: notificationDefaults(savedRules.notification ?? initialRow.funil?.crm_ia?.notification), audio: savedAudio };
      draftRef.current = nextDraft; rulesRef.current = nextRules; setDraft(nextDraft); setRules(nextRules);
    } catch { /* The session retains the error and unsaved input. */ }
  }, [session, initialRow, type, pipelineId, initialAudio.settings]);
  useEffect(() => {
    mounted.current = true; void loadDraft();
    return () => { mounted.current = false; void session.dispose().catch(() => {}); };
  }, [session, loadDraft]);
  const close = () => {
    if (!draftState.ready) { onClose(); return; }
    void session.flush().then(() => { if (mounted.current) onClose(); }).catch(() => {});
  };
  async function discard() {
    try { await session.discard(); if (mounted.current) onClose(); } catch { /* Keep the draft and show the session error. */ }
  }
  async function save() {
    const draft = draftRef.current, rules = rulesRef.current, audio = rules.audio;
    if (!draft.nome.trim()) throw new Error('Informe o nome do agente.');
    if (!rules.pipeline_id) throw new Error('Selecione o funil.');
    if (rules.janelas.some(item => !item.dias?.length || !item.inicio || item.inicio >= item.fim)) throw new Error('Confira os dias e os horários das janelas.');
    if (rules.cadencia.some(item => !Number.isFinite(item.valor) || item.valor <= 0)) throw new Error('Informe intervalos positivos para a cadência.');
    if (rules.notification.enabled && (rules.tipo !== 'qualificacao' || rules.notification.recipient.type === 'person' && !rules.notification.recipient.person_id
      || rules.notification.recipient.type === 'phone' && !rules.notification.recipient.phone?.trim())) throw new Error('Revise o destinatário do resumo da Qualificação.');
    if (rules.tipo === 'agendamento') for (const [key, label, , min, max] of SCHEDULE_FIELDS) {
      const value = rules.agendamento[key];
      if (value != null && (!Number.isFinite(value) || (key !== 'min_notice_hours' && !Number.isInteger(value)) || value < min || value > max)) throw new Error(`Confira a disponibilidade: ${label} deve ficar entre ${min} e ${max}.`);
    }
    normalizeCrmIaAudio(audio);
    session.change({ ...agentDraftPayload(draft, rules, initialRow), nome: draft.nome.trim() });
    await session.publish();
  }
  async function testAgent() {
    if (!row.id || !message.trim() || testing) return;
    setTesting(true); setTestError(''); setAnswer(null);
    try { setAnswer(await api('test_agent', { agent_id: row.id, messages: [{ role: 'user', content: message.trim() }] })); }
    catch (failure) { setTestError(failure.message); } finally { setTesting(false); }
  }
  const navigate = id => {
    setActiveSection(id);
    const section = sectionsRef.current?.querySelector(`#crm-ia-agent-${id}`);
    if (!section) return;
    if (section.tagName === 'DETAILS') section.open = true;
    (section.querySelector('summary') || section).focus();
    section.scrollIntoView({ block: 'nearest' });
  };
  return <CrmIaEditor className="crm-ia-agent-editor" title={`Configurar ${title}`} description="Rascunho privado salvo automaticamente. Fechar preserva o rascunho; somente Publicar altera o agente em atendimento." onClose={close} onSave={save} saveLabel="Publicar agente" disabled={!draftState.ready || ['publishing', 'discarding'].includes(draftState.phase)} footerActions={({ pending, disabled }) => <button type="button" disabled={pending || disabled} onClick={() => void discard()}>Descartar rascunho</button>}>
    <div className="crm-ia-toolbar"><p role="status">{({ loading: 'Carregando rascunho…', clean: 'Rascunho privado carregado', dirty: 'Alterações aguardando salvamento', saving: 'Salvando rascunho…', saved: 'Rascunho privado salvo', publishing: 'Publicando agente…', discarding: 'Descartando rascunho…', error: 'Rascunho preservado para revisão' })[draftState.phase]}</p><button type="button" onClick={() => void loadDraft()}>Reabrir rascunho salvo</button></div>
    {draftState.error && <p className="crm-ia-error" role="alert">{draftState.error}</p>}{draftState.sourceConflict && <p className="crm-ia-error" role="alert">A versão publicada mudou. Revise o rascunho antes de publicar; descartar preserva o agente atual.</p>}
    {rules.tipo !== 'qualificacao' && rules.profiles?.length > 0 && <p className="crm-ia-error" role="alert">Perfis pertencem à Qualificação. Volte a esse tipo para revisar ou remover os perfis antes de publicar.</p>}
    <div className="crm-ia-agent-layout"><CrmIaAgentNavigation draft={draft} rules={rules} published={Boolean(row.id)} active={activeSection} onNavigate={navigate} /><div className="crm-ia-agent-sections" ref={sectionsRef}>
    <section id="crm-ia-agent-identity" tabIndex={-1}><h3>Identidade do agente</h3><div className="crm-ia-form-grid"><CrmIaField label="Nome do agente" value={draft.nome} onChange={value => set('nome', value)} maxLength={60} required /><CrmIaField label="Tipo do agente" value={rules.tipo} disabled={!row.id} onChange={value => rule('tipo', value)} options={AGENT_TYPES.map(([value, label]) => ({ value, label }))} /><CrmIaField label="Tom de voz" value={draft.tom} onChange={value => set('tom', value)} options={[{ value: 'formal', label: 'Profissional' }, { value: 'cordial', label: 'Acolhedor' }, { value: 'direto', label: 'Direto' }, { value: 'entusiasmado', label: 'Entusiasmado' }, ...(draft.tom === 'descontraido' ? [{ value: 'descontraido', label: 'Descontraído · configuração anterior' }] : [])]} /><CrmIaField label="Modelo do agente" value={draft.modelo} onChange={value => set('modelo', value)} options={[...new Set([draft.modelo, 'openai/gpt-4o-mini', 'openai/gpt-4o'])].map(value => ({ value, label: value }))} /><CrmIaField label="Objetivo" type="textarea" value={draft.objetivo} onChange={value => set('objetivo', value)} maxLength={500} /><CrmIaField label="Instruções" type="textarea" value={draft.instrucoes} onChange={value => set('instrucoes', value)} maxLength={8000} /></div></section>
    <details id="crm-ia-agent-scope" open><summary>Etapas, idioma e conhecimento</summary><CrmIaField label="Funil do agente" value={rules.pipeline_id} disabled={!row.id} onChange={value => updateRules({ ...rulesRef.current, pipeline_id: value, stage_ids: [] })} options={[blank('Selecione'), ...workspace.pipelines]} /><div className="crm-ia-check-grid">{stages.map(stage => <CrmIaField key={stage.id} type="checkbox" label={`Atuar em ${stage.nome}`} value={rules.stage_ids.includes(stage.id)} onChange={enabled => rule('stage_ids', enabled ? [...rules.stage_ids, stage.id] : rules.stage_ids.filter(id => id !== stage.id))} />)}</div><div className="crm-ia-check-grid">{[['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol']].map(([id, label]) => <CrmIaField key={id} type="checkbox" label={label} value={rules.idiomas.includes(id)} onChange={enabled => rule('idiomas', enabled ? [...rules.idiomas, id] : rules.idiomas.filter(value => value !== id))} />)}</div><CrmIaField label="Base de conhecimento" value={draft.base_ids[0] || ''} onChange={value => set('base_ids', value ? [value] : [])} options={[blank('Sem base'), ...workspace.bases]} /><p className="crm-ia-muted">Conhecimento e idiomas também orientam a resposta quando os recursos de áudio estão autorizados.</p></details>
    <details id="crm-ia-agent-audio"><summary>Respostas e compreensão de áudio</summary>
      {initialAudio.error && <p className="crm-ia-error" role="alert">{initialAudio.error}</p>}
      {capabilities.pending && <p role="status">Consultando recursos de áudio…</p>}
      {capabilities.error && <p role="alert">Não foi possível consultar os recursos de áudio. <button type="button" onClick={() => setAudioRefresh(value => value + 1)}>Atualizar recursos de áudio</button></p>}
      {!capabilities.pending && !capabilities.error && capabilities.data?.audio?.available !== true && <p className="crm-ia-muted">Geração de voz indisponível neste servidor. As respostas continuam em texto.</p>}
      <CrmIaField label="Respostas em áudio" value={agentAudioMode(audio)} disabled={capabilities.data?.audio?.available !== true && !audio.enabled} onChange={mode => rule('audio', { ...rulesRef.current.audio, mode, enabled: mode !== 'never' })} options={[{ value: 'never', label: 'Nunca' }, { value: 'always', label: 'Sempre' }, { value: 'mirror', label: 'Espelhar o áudio recebido' }]} />
      {audio.enabled && <div className="crm-ia-form-grid"><CrmIaField label="Voz do agente" value={audio.voice} onChange={value => audioRule('voice', value)} options={CRM_IA_TTS_VOICES.map(value => ({ value, label: value }))} /><CrmIaField label="Velocidade da voz" type="number" min="0.25" max="4" step="0.05" value={audio.speed} onChange={value => audioRule('speed', value === '' ? '' : Number(value))} /></div>}
      <CrmIaField label="Entender áudios recebidos" type="checkbox" value={audio.input_enabled} disabled={capabilities.data?.audio?.input_available !== true && !audio.input_enabled} onChange={value => audioRule('input_enabled', value)} />
      <p className="crm-ia-muted">As duas opções são independentes e começam desligadas. Áudio pode consumir a franquia do provedor quando o atendimento automático estiver autorizado. A mensagem de voz informa que foi gerada por IA. O teste abaixo responde somente em texto.</p>
    </details>
    {rules.tipo === 'qualificacao' && <details id="crm-ia-agent-variables" open><summary>Variáveis a descobrir</summary><ol className="crm-ia-variable-list">{rules.variaveis.map((variable, index) => <li key={index}><CrmIaField label={`Variável ${index + 1}`} value={variable.nome} onChange={nome => rule('variaveis', rules.variaveis.map((item, i) => i === index ? { ...item, nome } : item))} /><CrmIaField label={`Pergunta ${index + 1}`} value={variable.pergunta} onChange={pergunta => rule('variaveis', rules.variaveis.map((item, i) => i === index ? { ...item, pergunta } : item))} /><div className="crm-ia-toolbar">{index > 0 && <button type="button" onClick={() => { const next = [...rules.variaveis]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; rule('variaveis', next); }}>Subir variável {index + 1}</button>}<button type="button" onClick={() => rule('variaveis', rules.variaveis.filter((_, i) => i !== index))}>Remover variável {index + 1}</button></div></li>)}</ol><button type="button" onClick={() => rule('variaveis', [...rules.variaveis, { nome: '', pergunta: '' }])}>Adicionar variável</button></details>}
    {rules.tipo === 'qualificacao' && <details id="crm-ia-agent-profiles" open><summary>Perfis</summary><CrmIaAgentProfiles profiles={rules.profiles || []} people={workspace.people} onChange={value => rule('profiles', value)} /></details>}
    {rules.tipo === 'qualificacao' && <details id="crm-ia-agent-notification"><summary>Resumo por WhatsApp</summary>
      <CrmIaField label="Enviar resumo por WhatsApp ao concluir" type="checkbox" value={rules.notification.enabled === true} onChange={enabled => rule('notification', { ...rulesRef.current.notification, enabled })} />
      <p className="crm-ia-muted">Após a qualificação e a resposta confirmada ao contato, envie um resumo em texto à pessoa escolhida.</p>
      {rules.notification.enabled && <><CrmIaField label="Destinatário do resumo" value={rules.notification.recipient.type} onChange={type => rule('notification', { ...rulesRef.current.notification, recipient: { type, person_id: null, phone: null } })} options={[{ value: 'lead_owner', label: 'Responsável do lead' }, { value: 'person', label: 'Outra pessoa da equipe' }, { value: 'phone', label: 'Outro número' }]} />
        {rules.notification.recipient.type === 'person' && <CrmIaField label="Pessoa destinatária do resumo" value={rules.notification.recipient.person_id} onChange={person_id => rule('notification', { ...rulesRef.current.notification, recipient: { type: 'person', person_id: person_id || null, phone: null } })} options={[blank('Selecione uma pessoa'), ...workspace.people]} />}
        {rules.notification.recipient.type === 'phone' ? <CrmIaField label="WhatsApp destinatário do resumo" type="tel" value={rules.notification.recipient.phone} onChange={phone => rule('notification', { ...rulesRef.current.notification, recipient: { type: 'phone', person_id: null, phone } })} maxLength={30}>Número brasileiro com DDD. O DDI 55 é opcional.</CrmIaField> : <p className="crm-ia-muted">O WhatsApp vem do cadastro da pessoa. Se estiver ausente ou indisponível, o aviso não será enviado.</p>}
      </>}
    </details>}
    <details id="crm-ia-agent-timing"><summary>Gatilhos e horário de atuação</summary><CrmIaField label="Frases para repassar à equipe, uma por linha" type="textarea" value={rules.gatilhos.join('\n')} onChange={value => rule('gatilhos', lines(value))} /><WindowFields rows={rules.janelas} onChange={value => rule('janelas', value)} /><CrmIaField label="Mensagem fora do horário" type="textarea" value={rules.mensagem_fora_horario} onChange={value => rule('mensagem_fora_horario', value)} /></details>
    {rules.tipo === 'followup' && <details id="crm-ia-agent-cadence" open><summary>Cadência de follow-up</summary><p className="crm-ia-muted">Intervalos contados a partir do último silêncio, com conferência de resposta e pausa humana antes do envio.</p><CadenceFields rows={rules.cadencia} onChange={value => rule('cadencia', value)} /></details>}
    {rules.tipo === 'agendamento' && <details id="crm-ia-agent-schedule" open><summary>Agenda, duração e lembretes</summary><p className="crm-ia-muted">A disponibilidade é configurada em Agenda. Um horário só será confirmado depois da reserva.</p><div className="crm-ia-form-grid"><CrmIaField label="Agenda do responsável" value={rules.agendamento.owner_id} onChange={value => schedule('owner_id', value || null)} options={[blank('Responsável do lead'), ...workspace.people]} />{SCHEDULE_FIELDS.map(([key, label, fallback, min, max]) => <CrmIaField key={key} label={label} type="number" min={min} max={max} step={key === 'min_notice_hours' ? 'any' : 1} value={rules.agendamento[key] ?? availability[({ max_future_days: 'horizon_days', daily_limit: 'max_per_day' })[key] || key] ?? fallback} onChange={value => schedule(key, Number(value))} />)}<CrmIaField label="Assunto do compromisso" value={rules.agendamento.title} onChange={value => schedule('title', value)} /><CrmIaField label="Local" value={rules.agendamento.location_type || ''} onChange={value => schedule('location_type', value)} options={[blank('Não informar'), { value: 'presencial', label: 'Presencial' }, { value: 'online', label: 'Online' }, { value: 'telefone', label: 'Telefone' }]} /></div><CrmIaField label="Instruções para o compromisso" type="textarea" value={rules.agendamento.instructions} onChange={value => schedule('instructions', value)} /><CrmIaField label="Avisar titular do compromisso por WhatsApp" type="checkbox" value={rules.agendamento.notify_owner === true} onChange={value => schedule('notify_owner', value)} /><p className="crm-ia-muted">A criação confirmada do compromisso envia um aviso em texto ao WhatsApp do titular da agenda.</p><CadenceFields reminders rows={rules.agendamento.reminders || []} onChange={value => schedule('reminders', value)} /></details>}
    <details id="crm-ia-agent-handoff"><summary>Ao concluir e repasse</summary><CrmIaField label="Próximo destino" value={rules.destino.tipo} onChange={tipo => rule('destino', { ...rules.destino, tipo })} options={[{ value: 'humano', label: 'Equipe humana' }, { value: 'agente', label: 'Outro agente' }, { value: 'encerrar', label: 'Encerrar' }]} />{rules.destino.tipo === 'agente' && <CrmIaField label="Agente de destino" value={rules.destino.agente_id} onChange={agente_id => rule('destino', { ...rules.destino, agente_id })} options={[blank('Selecione'), ...workspace.agents.filter(agent => agent.id !== row.id)]} />}<CrmIaField label="Avançar para etapa" value={rules.destino.stage_id} onChange={stage_id => rule('destino', { ...rules.destino, stage_id: stage_id || null })} options={[blank('Manter etapa atual'), ...stages]} /><CrmIaField label="Mensagem de transição" type="textarea" value={rules.destino.message} onChange={message => rule('destino', { ...rules.destino, message })} /><CrmIaField label="Ao desinteresse" value={rules.desinteresse || 'encerrar'} onChange={value => rule('desinteresse', value)} options={[{ value: 'encerrar', label: 'Encerrar conversa' }, { value: 'humano', label: 'Repassar à equipe' }]} /></details>
    <section className="crm-ia-autonomy" id="crm-ia-agent-autonomy" tabIndex={-1}><h3>Ativação do agente</h3><CrmIaField label="Agente disponível" type="checkbox" value={draft.ativo} onChange={value => set('ativo', value)} /><CrmIaField label="Autorizar respostas automáticas deste agente" type="checkbox" value={draft.auto_responder} onChange={value => set('auto_responder', value)} /><p>Publicar com autonomia autorizada pode iniciar respostas reais conforme canal, etapas, horários e pausa humana. O salvamento do rascunho não ativa o agente.</p></section>
    {row.id && <details id="crm-ia-agent-test"><summary>Testar sem enviar WhatsApp</summary><p className="crm-ia-muted">O teste usa somente a versão publicada e o provedor configurado para a conta. Alterações do rascunho ficam fora deste teste.</p><CrmIaField label="Mensagem de teste" type="textarea" value={message} onChange={setMessage} maxLength={4000} /><button type="button" disabled={testing || !message.trim()} onClick={testAgent}>{testing ? 'Testando…' : 'Testar agente'}</button>{testError && <p role="alert" className="crm-ia-error">{testError}</p>}{answer && <div className="crm-ia-test-answer" role="status"><p className="crm-ia-prose">{answer.resposta}</p><small>{typeof answer.agente === 'object' ? answer.agente?.nome : answer.agente} · {answer.modelo || row.modelo || 'Modelo configurado'}</small></div>}</details>}
    </div></div>
  </CrmIaEditor>;
}

function CrmIaCatalog({ tab, workspace, mutate, canManage }) {
  const knowledge = tab === 'knowledge';
  const entries = knowledge ? workspace.bases : workspace.products;
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState('');
  function edit(row = {}) { setEditing(row); setDraft(knowledge ? { nome: '', conteudo: '', ...row } : { name: '', code: '', ...row, crm_ia_details: { description: '', price: '', url: '', active: true, media: [], ...row.crm_ia_details } }); }
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const details = (key, value) => setDraft(old => ({ ...old, crm_ia_details: { ...old.crm_ia_details, [key]: value } }));
  return <section className="crm-ia-card"><div className="crm-ia-section-heading"><h2>{knowledge ? 'Base de conhecimento' : 'Produtos e serviços'}</h2>{canManage && <button type="button" className="crm-ia-primary" onClick={() => edit()}>{knowledge ? 'Nova base' : 'Adicionar produto ou serviço'}</button>}</div><CrmIaField label="Buscar no catálogo" value={search} onChange={setSearch} />
    <ul className="crm-ia-list">{entries.filter(item => named(item).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(item => <li key={item.id}><div><strong>{named(item)}</strong><p>{knowledge ? `${item.conteudo?.length || 0} caracteres` : item.crm_ia_details?.description}</p>{!knowledge && <small>{money(item.crm_ia_details?.price)} · {item.crm_ia_details?.active === false ? 'Inativo' : 'Ativo'}</small>}</div>{canManage && <button type="button" onClick={() => edit(item)}>Editar {named(item)}</button>}</li>)}</ul>{!entries.length && <p className="crm-ia-state">{knowledge ? 'Nenhuma base cadastrada.' : 'Nenhum produto ou serviço cadastrado.'}</p>}
    {editing && <CrmIaEditor title={knowledge ? 'Base de conhecimento' : 'Produto ou serviço'} onClose={() => setEditing(null)} onSave={() => {
      if (!(knowledge ? draft.nome : draft.name)?.trim()) throw new Error('Informe um nome.');
      if (!knowledge && draft.crm_ia_details.price !== '' && (!Number.isFinite(Number(draft.crm_ia_details.price)) || Number(draft.crm_ia_details.price) < 0)) throw new Error('Informe um preço válido.');
      return mutate(knowledge ? 'save_base' : 'save_product', knowledge ? { ...versionOf(editing), nome: draft.nome.trim(), conteudo: draft.conteudo } : { ...versionOf(editing), item_tipo: draft.item_tipo || 'produto', name: draft.name.trim(), code: draft.code, crm_ia_details: { ...draft.crm_ia_details, price: draft.crm_ia_details.price === '' ? null : Number(draft.crm_ia_details.price) } });
    }}>{knowledge ? <><CrmIaField label="Nome da base" value={draft.nome} onChange={value => set('nome', value)} maxLength={80} required /><CrmIaField label="Empresa, horários, perguntas frequentes, políticas e contexto" type="textarea" value={draft.conteudo} onChange={value => set('conteudo', value)} maxLength={30000} rows={14} /><small>{draft.conteudo.length.toLocaleString('pt-BR')} caracteres · limite de 30.000 do cadastro atual</small></> : <><CrmIaField label="Nome do item" value={draft.name} onChange={value => set('name', value)} required /><CrmIaField label="Tipo do item" value={draft.item_tipo || 'produto'} onChange={value => set('item_tipo', value)} options={[{ value: 'produto', label: 'Produto' }, { value: 'servico', label: 'Serviço' }]} /><CrmIaField label="Código" value={draft.code} onChange={value => set('code', value)} /><CrmIaField label="Descrição" type="textarea" value={draft.crm_ia_details.description} onChange={value => details('description', value)} /><CrmIaField label="Preço" type="number" min="0" step="0.01" value={draft.crm_ia_details.price} onChange={value => details('price', value)} /><CrmIaField label="Link do produto ou serviço" type="url" value={draft.crm_ia_details.url} onChange={value => details('url', value)} /><CrmIaField label="Item ativo" type="checkbox" value={draft.crm_ia_details.active} onChange={value => details('active', value)} /><p className="crm-ia-muted">As mídias existentes são preservadas. Upload de novas mídias permanece na gestão oficial do catálogo.</p></>}</CrmIaEditor>}
  </section>;
}

function CrmIaConcierge({ workspace, mutate, canManage }) {
  const saved = workspace.config.data.concierge || {};
  const initial = () => ({ enabled: false, human_wait_minutes: 10, appointment_confirm: false, appointment_reschedule: false, appointment_cancel: false,
    no_show_recovery: false, no_show_delay_minutes: 60, no_show_expire_hours: 168, ...saved });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  function save() {
    for (const [key, min, max] of [['no_show_delay_minutes', 0, 10080], ['no_show_expire_hours', 1, 720]]) {
      if (!Number.isFinite(draft[key]) || !Number.isInteger(draft[key]) || draft[key] < min || draft[key] > max) throw new Error(`Confira o prazo de recuperação: informe um valor entre ${min} e ${max}.`);
    }
    return mutate('save_config', { section: 'concierge', data: draft, revision: workspace.config.revision });
  }
  return <section className="crm-ia-card"><div className="crm-ia-section-heading"><h2>Concierge</h2><span className="crm-ia-badge">{saved.enabled === true ? 'Autorizado' : 'Desligado'}</span></div><p>Responda dúvidas pela base e organize o retorno à equipe dentro das capacidades da conta.</p><p className="crm-ia-muted">Salvar as regras não ativa o Concierge sem autorização explícita.</p>{canManage && <button type="button" onClick={() => { setDraft(initial()); setEditing(true); }}>Configurar Concierge</button>}
    {editing && <CrmIaEditor title="Concierge" onClose={() => setEditing(false)} onSave={save}><CrmIaField label="Autorizar Concierge" type="checkbox" value={draft.enabled === true} onChange={value => set('enabled', value)} /><CrmIaField label="Base do Concierge" value={draft.base_id} onChange={value => set('base_id', value || null)} options={[blank('Selecione'), ...workspace.bases]} /><CrmIaField label="Quando atuar" value={draft.mode || 'outside_hours'} onChange={value => set('mode', value)} options={[{ value: 'outside_hours', label: 'Fora do horário da equipe' }, { value: 'always', label: 'Sempre, respeitando a pausa humana' }]} /><CrmIaField label="Espera depois de atendimento humano, em minutos" type="number" min="0" value={draft.human_wait_minutes ?? 10} onChange={value => set('human_wait_minutes', Number(value))} />
      <h3>Ações sobre compromissos existentes</h3>{[['appointment_confirm', 'Permitir confirmação de presença'], ['appointment_reschedule', 'Permitir remarcação'], ['appointment_cancel', 'Permitir cancelamento'], ['no_show_recovery', 'Recuperar não comparecimento']].map(([key, label]) => <CrmIaField key={key} label={label} type="checkbox" value={draft[key] === true} onChange={value => set(key, value)} />)}
      <CrmIaField label="Atraso após marcar ausência, em minutos" type="number" min="0" max="10080" value={draft.no_show_delay_minutes} onChange={value => set('no_show_delay_minutes', value === '' ? '' : Number(value))} /><CrmIaField label="Prazo da recuperação, em horas" type="number" min="1" max="720" value={draft.no_show_expire_hours} onChange={value => set('no_show_expire_hours', value === '' ? '' : Number(value))} /><p className="crm-ia-muted">Recuperação em tentativa única. A equipe marca a ausência após o término; silêncio não significa não comparecimento. Estas opções não ligam a autonomia geral.</p>
      <CrmIaField label="Frases para repasse humano, uma por linha" type="textarea" value={(draft.handoff_phrases || []).join('\n')} onChange={value => set('handoff_phrases', lines(value))} /><CrmIaField label="Mensagem de repasse" type="textarea" value={draft.handoff_message} onChange={value => set('handoff_message', value)} maxLength={300} /><CrmIaField label="Instruções extras" type="textarea" value={draft.instructions} onChange={value => set('instructions', value)} maxLength={500} /><p className="crm-ia-muted">A IA apresenta a proposta e exige confirmação explícita do contato antes de alterar o compromisso. Quando houver Google Agenda conectado, a resposta aguarda o recibo da sincronização.</p></CrmIaEditor>}
  </section>;
}

export { WindowFields };
