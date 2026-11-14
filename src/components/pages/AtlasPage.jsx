import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Brain, ChevronDown, Paperclip, MessageSquare, Plus, Send, Sparkles, RefreshCw, BookmarkCheck, GitBranch, Loader2, AlertCircle, ArrowLeft, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { canManageCsIa } from '@/components/cs-ia/csIaData';
import AtlasMemory from '@/components/atlas/AtlasMemory';
import AtlasMissions from '@/components/atlas/AtlasMissions';
import useAtlas from '@/components/atlas/useAtlas';
import useAtlasVoice from '@/components/atlas/useAtlasVoice';
import AtlasVoiceControls from '@/components/atlas/AtlasVoiceControls';
import AtlasOffice from '@/components/atlas/AtlasOffice';
import AtlasClientChoice from '@/components/atlas/AtlasClientChoice';
import AtlasDictationButton from '@/components/atlas/AtlasDictationButton';
import { atlasDate, atlasStatusLabel } from '@/components/atlas/atlasPresentation';
import { markAtlasInbox, setAtlasPreferences } from '@/lib/atlasApi';
import { csAtlasDemandLink, readCsAtlasDraft } from '@/lib/csIaAtlasDraft';
import { ATLAS_DEMANDS_ENABLED } from '@/lib/atlasDemands';
import { GESTOR_REPORT_TEXT_LIMIT, readGestorAtlasDraft } from '@/lib/gestorIaAtlasDraft';
import { reportEditor } from '@/components/gestor-ia/gestorIaClientModel';
import { plainTextToRichHtml } from '@/lib/richText';
import { atlasResponseToHtml } from '@/lib/atlasResponsePresentation';
import {officeMissionActivity,liveOfficeMissions} from '@/lib/atlasOfficeMissions';
import atlasAvatar from '@/assets/atlas/atlas-avatar-3d-v1.png';
import AtlasConversationNav from '@/components/atlas/AtlasConversationNav';
import AtlasConversationComposer, { atlasAgentPrefix } from '@/components/atlas/AtlasConversationComposer';
import AtlasConversationSuggestions from '@/components/atlas/AtlasConversationSuggestions';
import AtlasExecutorItems from '@/components/atlas/AtlasExecutorItems';
import AtlasExecutorActivity from '@/components/atlas/AtlasExecutorActivity';
import { AtlasSquadKnowledgeDialog } from '@/components/atlas/AtlasSquadKnowledge';
import AtlasAutomationCanvas from '@/components/atlas/AtlasAutomationCanvas';
import { atlasExecutorMessageBody } from '@/lib/atlasExecutorRequest';
import { tryUuid } from '@/lib/centralTrafego';
import '@/components/atlas/atlas.css';
import '@/components/atlas/AtlasConversation.css';

const CHAT_PATH = '/assistant/atlas?view=conversation';

const GATE_COPY = {
  ATLAS_NOT_CONFIGURED: ['O Atlas está sendo preparado', 'O acesso pessoal ainda precisa ser configurado. Assim que estiver habilitado, seu núcleo de agentes estará aqui.'],
  ATLAS_DISABLED: ['Atlas ainda não habilitado', 'Seu espaço está reservado. A conversa será liberada quando a configuração estiver concluída.'],
  ATLAS_FORBIDDEN: ['Este espaço é pessoal', 'O Atlas está reservado à conta autorizada de Josias.'],
  ATLAS_UNAUTHENTICATED: ['Entre para abrir o Atlas', 'Sua sessão precisa estar ativa para acessar o assistente pessoal.'],
  UNAUTHENTICATED: ['Entre para abrir o Atlas', 'Sua sessão expirou. Entre novamente para acessar seu assistente pessoal.'],
};

function AtlasGate({ loading, error, onReload }) {
  const known = GATE_COPY[error?.code];
  const [title, description] = loading ? ['Abrindo seu espaço', 'Conferindo acesso ao Atlas…'] : known || ['Não foi possível abrir o Atlas', 'O serviço não respondeu como esperado. Tente carregar novamente.'];
  return <div className="atlas-gate">
    <div className="atlas-gate-emblem"><Brain size={48} strokeWidth={1.1} aria-hidden="true" /></div>
    <span className="atlas-section-kicker">Atlas · assistente pessoal</span>
    <h1>{title}</h1><p>{description}</p>
    {loading ? <Loader2 className="atlas-spin" size={20} aria-label="Carregando" /> : <div className="atlas-gate-actions"><button className="atlas-button" type="button" onClick={onReload}><RefreshCw size={15} aria-hidden="true" />Verificar novamente</button><Link className="atlas-text-button" to="/assistant"><ArrowLeft size={14} aria-hidden="true" />Voltar ao ApexIA</Link></div>}
  </div>;
}

export default function AtlasPage() {
  const { user, profile } = useAuth();
  const { moduleSettings } = useModuleSettings() || {};
  const location=useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const params = new URLSearchParams(location.search);
  const officeView = params.has('office_client') || (!params.has('topic') && !params.has('conversation') && params.get('view') !== 'conversation');
  const routeTab = !officeView && params.get('tab') === 'knowledge' ? 'memory' : params.get('tab');
  const requestedTab = (officeView ? ['conversation', 'missions', 'memory'] : ['conversation', 'memory']).includes(routeTab) ? routeTab : null;
  const atlas = useAtlas(user?.id, { executor: !officeView });
  const { base, loading, newConversation, setDraft, setError } = atlas;
  const openedTopic=useRef(null);
  const openedSessionRoute = useRef(null);
  const lastConversationId = useRef(null);
  const topicId = params.get('topic');
  const routeConversationId = topicId ? null : tryUuid(params.get('conversation'));
  const openedContextDraft = useRef(null);
  const [reportContext, setReportContext] = useState(null);
  const voice = useAtlasVoice(atlas, user?.id);
  const [tab, setTab] = useState(requestedTab || 'conversation');
  useEffect(() => { setTab(requestedTab || 'conversation'); }, [requestedTab]);
  const [officeChatOpen, setOfficeChatOpen] = useState(false);
  const chatTrigger = useRef(null);
  const officeOptions = useRef(null);
  const [dictating,setDictating]=useState(false);
  const [textQuestion, setTextQuestion] = useState(null);
  const [automationPane, setAutomationPane] = useState('chat');
  const answerDraft = useRef('');
  useEffect(() => { setTextQuestion(null); }, [atlas.conversationId, officeView]);
  const composerRef = useRef(null);
  const composerPosition = useRef(null);
  const composerMotion = useRef(null);
  const messagesRef = useRef(null);
  const busy = atlas.sending || atlas.responding || atlas.historyLoading || atlas.processing || voice.active || dictating;
  const conversationWork = atlas.jobs.filter(job => job.conversation_id === atlas.conversationId && ['queued', 'running'].includes(job.status));
  const reportAnswer = reportContext?.ownerId === user?.id && reportContext?.clientId === atlas.clientId &&
    reportContext?.epoch === atlas.conversationEpoch && !busy && !conversationWork.length
    ? [...atlas.messages].reverse().find((message) => message.role === 'assistant' && (!message.job_id || message.job_status === 'completed'))?.content?.trim() : '';
  const managerActivity=useMemo(()=>officeMissionActivity(atlas.jobs,{heartbeatAt:atlas.base?.worker?.heartbeat_at}),[atlas.jobs,atlas.base?.worker?.heartbeat_at]);
  const currentActivity=liveOfficeMissions(officeMissionActivity(atlas.jobs.filter(j=>j.conversation_id===atlas.conversationId),{heartbeatAt:atlas.base?.worker?.heartbeat_at}));
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const conversationTitle = atlas.base?.conversations?.find(item => item.id === atlas.conversationId)?.title || 'Nova conversa';
  const emptyChat = (officeView || !routeConversationId) && !atlas.messages.length && !atlas.interactions?.length && !atlas.clientChoice && !atlas.historyLoading && !atlas.sending && !atlas.processing;
  const pendingQuestions = officeView ? [] : (atlas.interactions || []).filter(item => item.kind === 'question' && item.state === 'awaiting_input');
  const automationItem = [...(atlas.interactions || [])].reverse().find(item => item.kind === 'proposal' && item.action === 'save_automation');
  const clientName = atlas.base?.clients?.find((client) => client.id === atlas.clientId)?.empresa || 'Visão geral';
  const csDemandLinks = ATLAS_DEMANDS_ENABLED && canManageCsIa(profile, moduleSettings) &&
    moduleSettings.tasks === true && moduleSettings.assistant === true && atlas.clientId && !busy
    ? new Map(atlas.runs.map(run => [run.id, csAtlasDemandLink({ run, ownerId: user?.id, clientId: atlas.clientId, conversationId: atlas.conversationId })])) : null;


  useLayoutEffect(() => {
    const form = !officeView && tab === 'conversation' ? composerRef.current?.closest('form') : null;
    if (!form) { composerPosition.current = null; return; }
    const previous = composerPosition.current;
    const top = form.getBoundingClientRect().top;
    composerPosition.current = { top, emptyChat };
    if (previous && previous.emptyChat !== emptyChat && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      composerMotion.current?.cancel();
      composerMotion.current = form.animate?.(
        [{ transform: `translateY(${previous.top - top}px)` }, { transform: 'translateY(0)' }],
        { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
    }
  }, [officeView, tab, emptyChat, atlas.draft]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [atlas.messages.length, atlas.sending, atlas.clientChoice, officeChatOpen]);

  useEffect(()=>{
    const params=new URLSearchParams(location.search), topicId=params.get('topic'), conversation=params.get('conversation');
    if(!atlas.base?.enabled || !topicId || openedTopic.current===topicId)return;
    const item=atlas.base.inbox?.find(i=>i.id===topicId); if(!item)return;
    openedTopic.current=topicId;
    if(conversation)atlas.openConversation(conversation);
    else {atlas.newConversation(item.client_id||'');atlas.setDraft(`Vamos tratar este assunto: ${item.title}. ${item.body}\nReferência no Planeje: ${JSON.stringify(item.evidence||{})}`);}
    void markAtlasInbox(topicId).catch(atlas.handleError);
  },[atlas.base,location.search]);

  useEffect(() => {
    const source = location.state?.crmIaDraft != null ? 'crmIaDraft' : location.state?.gestorIaDraft != null ? 'gestorIaDraft' : 'csDraft';
    if (location.state?.[source] == null || openedContextDraft.current === location.key || loading || !base?.enabled || busy) return;
    const params = new URLSearchParams(location.search);
    if (params.get('view') !== 'conversation' || ['topic', 'conversation', 'office_client'].some((key) => params.has(key))) return;

    openedContextDraft.current = location.key;
    const readDraft = source === 'csDraft' ? readCsAtlasDraft : readGestorAtlasDraft;
    const draft = readDraft({ state: source === 'crmIaDraft' ? { gestorIaDraft: location.state.crmIaDraft } : location.state, ownerId: user?.id, base });
    setOfficeChatOpen(false);
    setTab('conversation');
    if (draft) {
      const epoch = newConversation(draft.clientId, { csScope: draft.csScope });
      setReportContext(draft.reportPeriod && epoch != null ? { ownerId: user.id, clientId: draft.clientId, period: draft.reportPeriod, epoch } : null);
      setDraft(draft.message);
    } else {
      setError(source === 'crmIaDraft' ? 'Não foi possível abrir o rascunho do CRM para esta conta.' : source === 'gestorIaDraft' ? 'Não foi possível abrir o rascunho do Gestor para este cliente.' : 'Não foi possível carregar o rascunho do CS para este cliente.');
    }
    const state = { ...location.state };
    delete state[source];
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state });
  }, [base, busy, loading, location, navigate, newConversation, setDraft, setError, user?.id]);

  const { conversationId, openConversation } = atlas;
  useEffect(() => {
    if (officeView || topicId || !base?.enabled || loading || busy || openedSessionRoute.current?.key === location.key) return;
    const previous = openedSessionRoute.current;
    openedSessionRoute.current = { key: location.key, id: routeConversationId };
    if (routeConversationId && routeConversationId !== conversationId) {
      setTab(requestedTab || 'conversation');
      void openConversation(routeConversationId, { resetDraft: true });
    } else if (!routeConversationId && navigationType === 'POP' && previous?.id) {
      newConversation('');
      setDraft('');
      setTab('conversation');
    }
  }, [officeView, topicId, base?.enabled, loading, busy, location.key, routeConversationId, conversationId, requestedTab, navigationType, openConversation, newConversation, setDraft]);

  useEffect(() => {
    if (lastConversationId.current === conversationId) return;
    lastConversationId.current = conversationId;
    if (!officeView && !topicId && conversationId && conversationId !== routeConversationId && openedSessionRoute.current?.key === location.key) {
      navigate(CHAT_PATH + '&conversation=' + conversationId, { replace: true });
    }
  }, [officeView, topicId, conversationId, routeConversationId, navigate, location.key]);

  function changeChatContext(clientId, mode = atlas.mode) {
    if (atlas.newConversation(clientId, { mode }) == null) return false;
    if (params.has('conversation') || topicId) navigate(CHAT_PATH, { replace: true });
    return true;
  }

  function changeMode(mode) {
    if (mode !== atlas.mode) changeChatContext(atlas.clientId, mode);
    setTab('conversation');
  }
  function teach(prompt) {
    if (atlas.mode === 'automation') changeChatContext(atlas.clientId, 'chat');
    selectPrompt(prompt);
  }
  function preferText(item) {
    answerDraft.current = atlas.draft;
    atlas.setDraft(''); setTextQuestion(item);
    requestAnimationFrame(() => composerRef.current?.focus());
  }
  const responseContext = textQuestion && pendingQuestions.some(item => item.id === textQuestion.id && item.revision === textQuestion.revision) ? {
    item: textQuestion,
    onCancel() { atlas.setDraft(answerDraft.current); setTextQuestion(null); },
    async onSend(text) {
      try { await atlas.respondToInteraction({ id: textQuestion.id, revision: textQuestion.revision, decision: 'text', text }); setTextQuestion(null); }
      catch (failure) { atlas.handleError(failure); }
    },
  } : null;

  function messageBody(message) {
    if (message.role !== 'user' || typeof message.content !== 'string') return message.content;
    const content = atlasExecutorMessageBody(message.content);
    const specialist = atlas.base?.agents?.find(agent => agent.id !== 'central' && content.startsWith(atlasAgentPrefix(agent.name)));
    return specialist ? content.slice(atlasAgentPrefix(specialist.name).length) : content;
  }

  async function preference(field,value){try{await setAtlasPreferences({[field]:value});await atlas.refreshBase();}catch(e){atlas.handleError(e);}}
  function selectPrompt(prompt, agent) {
    voice.stop();
    atlas.setDraft((agent && agent.id !== 'central' ? atlasAgentPrefix(agent.name) : '') + prompt);
    setTab('conversation');
    requestAnimationFrame(() => {
      const field = composerRef.current;
      field?.focus();
      field?.setSelectionRange(prompt.length, prompt.length);
    });
  }
  const disabled = atlas.base && !atlas.base.enabled;
  const gateError = disabled ? { code: 'ATLAS_DISABLED' } : atlas.gateError;

  function startConversation() {
    voice.stop(); setAutomationPane('chat');
    if (!changeChatContext('')) return;
    atlas.setDraft('');
    setTab('conversation');
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  function restoreConversation(id) {
    if (id === atlas.conversationId) { setTab('conversation'); return; }
    voice.stop();
    navigate(CHAT_PATH + '&conversation=' + id);
    setTab('conversation');
  }
  function openOfficeChat({conversationId,showMission} = {}) {
    if (!conversationId && !showMission) { closeOfficeChat(false); setTab('conversation'); navigate(CHAT_PATH); return true; }
    if(conversationId&&conversationId!==atlas.conversationId&&busy)return false;
    chatTrigger.current = document.activeElement;
    setOfficeChatOpen(true); setTab(showMission?'missions':'conversation');
    if(conversationId&&conversationId!==atlas.conversationId)void atlas.openConversation(conversationId);
    return true;
  }
  function closeOfficeChat(restoreFocus = true) {
    voice.stop(); setOfficeChatOpen(false);
    if (restoreFocus) chatTrigger.current?.focus?.();
  }
  useEffect(() => {
    const open = () => { chatTrigger.current = document.activeElement; setTab('conversation'); if (officeView) setOfficeChatOpen(true); else setTimeout(() => composerRef.current?.focus(), 0); };
    const close = () => { voice.stop(); setOfficeChatOpen(false); };
    window.addEventListener('atlas-personal:open', open);
    window.addEventListener('atlas-team:open', close);
    return () => { window.removeEventListener('atlas-personal:open', open); window.removeEventListener('atlas-team:open', close); };
  }, [officeView, voice.stop]);
  useEffect(() => {
    if (!officeView || !officeChatOpen) return;
    composerRef.current?.focus();
    const escape = event => { if (event.key === 'Escape') { voice.stop(); setOfficeChatOpen(false); chatTrigger.current?.focus?.(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [officeView, officeChatOpen, voice.stop]);
  const controls = atlas.base ? <>
          <div className="atlas-workspace-toolbar">
            <nav aria-label="Seções do Atlas" className="atlas-tabs">
              {[['conversation', MessageSquare, 'Conversa'], ['missions', GitBranch, 'Missões'], ['memory', BookmarkCheck, 'Memória']].map(([value, Icon, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={15} aria-hidden="true" /><span>{label}</span></button>)}
            </nav>
            {officeView && <button type="button" className="atlas-new-button" disabled={busy} onClick={() => { atlas.newConversation(); setTab('conversation'); }} aria-label="Iniciar nova conversa"><Plus size={16} aria-hidden="true" /><span>Nova conversa</span></button>}
          </div>
          {officeView && <div className="atlas-office-chat-links"><button type="button" className="atlas-text-button" onClick={() => { closeOfficeChat(false); window.dispatchEvent(new CustomEvent('atlas-team:list')); }}>Acompanhamento da equipe ↗</button><details><summary>Conversas recentes</summary>{(atlas.base.conversations || []).map(conversation => <button type="button" className="atlas-text-button" disabled={busy} key={conversation.id} onClick={() => { atlas.openConversation(conversation.id); setTab('conversation'); }}>{conversation.title || 'Conversa com Atlas'}</button>)}</details></div>}
          {officeView && <div className="atlas-context-row"><label htmlFor="atlas-client">Contexto</label><select id="atlas-client" value={atlas.clientId} disabled={busy} onChange={(event) => { voice.stop(); atlas.newConversation(event.target.value); }}><option value="">Visão geral · meu negócio</option>{(atlas.base.clients || []).map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}</select></div>}
          {officeView && atlas.conversationId && <p className="atlas-context-note">Trocar o contexto abre uma nova conversa.</p>}
  </> : null;
  const workspace = atlas.base && !gateError && !atlas.loading ? (
        <section className={`atlas-workspace ${officeView ? 'atlas-office-chat' : ''}`} id="atlas-workspace" role={officeView ? 'dialog' : undefined} aria-label={officeView ? 'Conversa pessoal com Atlas no escritório' : 'Espaço pessoal do Atlas'} hidden={officeView && !officeChatOpen}>
          {officeView && <div className="atlas-chat-heading"><img className="atlas-office-chat-avatar" src={atlasAvatar} alt="Robô Atlas" width="64" height="64"/><div><strong>Atlas</strong><span>Seu gerente · pode falar comigo</span><button type="button" className="atlas-office-client-chip" aria-label={'Alterar contexto: '+clientName} onClick={()=>{officeOptions.current.open=true;officeOptions.current.querySelector('select')?.focus();}}>{clientName} <ChevronDown size={12} aria-hidden="true"/></button></div><button className="atlas-chat-toggle atlas-chat-close" type="button" aria-label="Fechar conversa pessoal" onClick={() => closeOfficeChat()}><X size={18} aria-hidden="true" /></button></div>}
          {officeView ? <details ref={officeOptions} className="atlas-office-chat-options" open={tab==='conversation'?undefined:true}><summary>Detalhes e histórico</summary>{controls}<AtlasVoiceControls voice={voice} disabled={dictating || atlas.sending || atlas.historyLoading || atlas.processing} /></details> : <>
            <header className="atlas-converse-top" data-welcome={emptyChat && tab === 'conversation'}><div className="atlas-converse-identity"><img src={atlasAvatar} width="36" height="36" alt="" /><div><span>Conversar · Atlas</span><h1 className={emptyChat && tab === 'conversation' ? 'sr-only' : undefined}>{tab === 'missions' ? 'Missões' : tab === 'memory' ? 'Conhecimento' : conversationTitle}</h1></div></div>
              <button type="button" className="atlas-converse-knowledge-button" aria-label="Conhecimento do Squad" disabled={busy || Boolean(responseContext)} onClick={() => setTab(tab === 'memory' ? 'conversation' : 'memory')}><Brain size={18} aria-hidden="true" /></button>
            </header>
          </>}
          {atlas.error && <div className="atlas-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><div><p>{atlas.error}</p>{atlas.retryKind === 'uncertain' && <span>Reenviar consulta o mesmo pedido para evitar duplicidade.</span>}{atlas.retryKind === 'terminal' && <span>Uma nova tentativa será registrada como outra missão.</span>}</div></div>}
          {atlas.historyLoading && <div className="atlas-loading-history" role="status"><Loader2 className="atlas-spin" size={18} aria-hidden="true" />Carregando conversa…</div>}
          {(tab === 'conversation' || !officeView && tab === 'memory') && <section className={`atlas-conversation ${!officeView && emptyChat ? 'is-empty' : ''}`} aria-label="Conversa com Atlas">
            {!officeView && emptyChat && <div className="atlas-converse-welcome"><img src={atlasAvatar} width="80" height="80" alt="" /><h2><span>Por onde começamos{firstName ? `, ${firstName}` : ''}?</span></h2><p>Seu Squad de CRM IA, CS IA e Gestor IA. Peça, ensine e acompanhe a execução.</p></div>}
            <div className="atlas-messages" hidden={!officeView && emptyChat} ref={messagesRef} role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions text">
              {officeView && emptyChat && <div className="atlas-welcome"><span className="atlas-welcome-icon"><Sparkles size={28} strokeWidth={1.3} aria-hidden="true" /></span><span className="atlas-section-kicker">Vamos pensar juntos</span><h2>O que vamos resolver hoje?</h2><p>Traga uma decisão, uma ideia ou um problema.<br />Eu reúno o contexto e os especialistas para ajudar.</p><div className="atlas-suggestions"><button type="button" onClick={() => selectPrompt('Confira os clientes sem resposta, o tráfego e as entregas que dependem de mim hoje.')}><span>Clareza para o dia</span><ArrowUpRight size={14} aria-hidden="true" /></button><button type="button" onClick={() => selectPrompt('Vamos desenvolver uma campanha. Me ajude a organizar o briefing antes de propor ideias.')}><span>Desenvolver uma ideia</span><ArrowUpRight size={14} aria-hidden="true" /></button></div></div>}
              {atlas.messages.map((message, index) => {
                const trace = !officeView && (message.job_id ? atlas.jobs.find(job => job.id === message.job_id) : message.role === 'assistant' && atlas.runs.find(run => run.id === message.run_id));
                const demandLink = message.role === 'assistant' && !message.job_id && csDemandLinks?.get(message.run_id);
                const executionItems = message.role === 'assistant' ? atlas.interactions?.filter(item => item.run_id === message.run_id && !(item.kind === 'question' && item.state === 'awaiting_input')) || [] : [];
                return <article key={message.id || `${message.run_id}-${index}`} className={`atlas-message atlas-message-${message.role === 'user' ? 'user' : 'assistant'}`}>
                  <div className="atlas-message-author">{message.role!=='user'&&<img src={atlasAvatar} alt="" width="24" height="24" aria-hidden="true"/>}{message.role === 'user' ? 'Você' : 'Atlas'}{message.created_at && <time dateTime={message.created_at}>{atlasDate(message.created_at)}</time>}</div>
                  {message.job_status && <span className="atlas-message-status">{officeView&&message.job_status==='completed'?(message.thread_ids?.length?'Retorno recebido':'Consulta finalizada'):atlasStatusLabel(message.job_status)}</span>}
                  <div className="atlas-message-content atlas-rich-content" dangerouslySetInnerHTML={{__html:!officeView && message.role === 'assistant'
                    ? atlasResponseToHtml(messageBody(message), [...(trace?.steps || []).filter(step => step.source?.available !== false).flatMap(step => step.source?.links || []), ...executionItems.flatMap(item => item.links || [])])
                    : plainTextToRichHtml(messageBody(message))}}/>
                  {!officeView && Array.isArray(message.attachments) && message.attachments.length > 0 && <ul className="atlas-message-attachments" aria-label="Anexos deste pedido">{message.attachments.map(file => <li key={file.id}><Paperclip size={13} aria-hidden="true" /><span>{file.name}</span><small>{Math.max(1,Math.ceil(file.size / 1024))} KiB</small></li>)}</ul>}
                  {trace?.steps?.length > 0 && <AtlasExecutorActivity steps={trace.steps} agents={atlas.base.agents} active={['processing', 'running'].includes(trace.status)} />}
                  {!officeView && <AtlasExecutorItems items={executionItems} clients={atlas.base.clients} busy={busy} onRespond={atlas.respondToInteraction} onReconcile={atlas.reconcileInteraction} />}
                  {demandLink && <Link className="atlas-text-button" {...demandLink}>Preparar demanda no CS <ArrowUpRight size={14} aria-hidden="true" /></Link>}
                  {message.job_id && <div className="atlas-message-actions"><button type="button" className="atlas-text-button" onClick={() => setTab('missions')}>Ver andamento</button>{message.retry_message && <button type="button" className="atlas-text-button" disabled={busy} onClick={() => { atlas.setDraft(message.retry_message); composerRef.current?.focus(); }}>Retomar pedido</button>}</div>}
                  {message.thread_ids?.map((id,i)=><button type="button" className="atlas-text-button" key={id} onClick={()=>window.dispatchEvent(new CustomEvent('atlas-team:open',{detail:{threadId:id}}))}>Ver conversa com a equipe{message.thread_ids.length>1?' '+(i+1):''} ↗</button>)}
                </article>;
              })}
              {!officeView && atlas.pendingMessage && <article className="atlas-message atlas-message-user" aria-label="Pedido em envio">
                <div className="atlas-message-author">Você <span>· Enviando</span></div>
                <div className="atlas-message-content">{messageBody({ role: 'user', content: atlas.pendingMessage })}</div>
              </article>}
              {!officeView && <AtlasExecutorItems items={atlas.interactions?.filter(item => ['proposed', 'executing', 'uncertain'].includes(item.state) && !atlas.messages.some(message => message.role === 'assistant' && message.run_id === item.run_id)) || []} clients={atlas.base.clients} busy={busy} onRespond={atlas.respondToInteraction} onReconcile={atlas.reconcileInteraction} />}
              {!officeView && (atlas.sending || atlas.processing || atlas.responding) && <AtlasExecutorActivity steps={atlas.latestRun?.status === 'processing' ? atlas.latestRun.steps : []} agents={atlas.base.agents} active />}
              {atlas.clientChoice && <AtlasClientChoice key={JSON.stringify(atlas.clientChoice)} choice={atlas.clientChoice} clients={atlas.base.clients || []} disabled={busy} onConfirm={atlas.confirmClient} onCancel={atlas.cancelClientChoice} />}
              {officeView && (atlas.sending || atlas.processing) && <div className="atlas-waiting" role="status"><Loader2 className="atlas-spin" size={16} aria-hidden="true" /><span>{atlas.processing ? 'Missão em andamento. Consultando o resultado…' : 'Pedido enviado. Aguardando o Atlas…'}</span>{atlas.processing && !atlas.sending && <button type="button" className="atlas-text-button" onClick={atlas.refreshHistory}>Atualizar</button>}</div>}
            </div>
            {conversationWork.length>0&&(!officeView||!currentActivity.fresh||!currentActivity.workers.length)&&<button type="button" className="atlas-background-work" onClick={()=>setTab('missions')}><GitBranch size={14}/>{conversationWork.length} missão(ões) em segundo plano · Pode continuar conversando <ArrowUpRight size={14}/></button>}
            {officeView&&currentActivity.fresh&&currentActivity.workers.length>0&&<button type="button" className="atlas-chat-live-work" onClick={()=>setTab('missions')}><Loader2 className="atlas-spin" size={14} aria-hidden="true"/><span>{currentActivity.workers.filter(w=>w.agent!=='central').map(w=>w.name+': '+w.text.toLowerCase()).join(' · ')||'Estou reunindo os registros para você'}<small>Ver o que estou consultando ↗</small></span></button>}
            {reportAnswer && <div className="atlas-context-row">
              {reportAnswer.length <= GESTOR_REPORT_TEXT_LIMIT
                ? <Link className="atlas-text-button" to={reportEditor(reportContext.clientId, reportContext.period)}
                  state={{ gestorReportCopy: { ownerId: reportContext.ownerId, clientId: reportContext.clientId, period: reportContext.period, content: reportAnswer } }}>
                  Levar resposta ao relatório <ArrowUpRight size={14} aria-hidden="true" />
                </Link> : <p className="atlas-context-note">Peça uma versão de até {GESTOR_REPORT_TEXT_LIMIT} caracteres para revisar no relatório.</p>}
            </div>}
            {atlas.csScope === 'portfolio' && <p className="atlas-context-note">Triagem do CS IA. Ao enviar, o Atlas consulta o radar atual da carteira autorizada.</p>}
            {atlas.csScope === 'client' && <p className="atlas-context-note">Ficha do CS IA. Ao enviar, o Atlas usa as fontes autorizadas do cliente, incluindo radar, diário de saúde, sinais do grupo, resumo do CRM e progresso salvo da meta principal.</p>}
            {!officeView && pendingQuestions.length > 0 && <div className="atlas-converse-question-dock" hidden={Boolean(responseContext)}><AtlasExecutorItems items={pendingQuestions} clients={atlas.base.clients} busy={busy} onRespond={atlas.respondToInteraction} onReconcile={atlas.reconcileInteraction} onPreferText={preferText} textModeId={responseContext?.item.id} /></div>}
            {officeView ? <form className="atlas-composer" onSubmit={event=>{if(dictating){event.preventDefault();return;}atlas.send(event);}}>
              <label className="sr-only" htmlFor="atlas-message">Seu pedido ao Atlas</label>
              <textarea id="atlas-message" ref={composerRef} value={atlas.draft} onChange={(event) => atlas.setDraft(event.target.value)} disabled={busy} placeholder={atlas.clientChoice ? 'Confirme o cliente acima ou escreva o nome aqui…' : 'Fale comigo. O que vamos resolver?'} rows={3} maxLength={atlas.messageLimit} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if(!dictating && atlas.draft.length<=atlas.messageLimit) atlas.send(event); } }} />
              <AtlasDictationButton disabled={atlas.sending||atlas.historyLoading||atlas.processing||voice.active||(officeView&&!officeChatOpen)} onActiveChange={setDictating} onText={text=>atlas.setDraft((atlas.draft.trim()?atlas.draft+'\n':'')+text)}/>
              {atlas.draft.length>atlas.messageLimit&&<p role="alert">Resuma sua mensagem para até {atlas.messageLimit.toLocaleString('pt-BR')} caracteres antes de enviar.</p>}
              <div className="atlas-composer-footer"><span><span className="atlas-small-dot" />{clientName}</span><button type="submit" className="atlas-send" disabled={busy || !atlas.draft.trim()||atlas.draft.length>atlas.messageLimit}>{atlas.sending ? <Loader2 className="atlas-spin" size={16} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}<span>{atlas.retryKind === 'terminal' ? 'Nova tentativa' : atlas.retryKind === 'uncertain' ? 'Reenviar' : 'Enviar'}</span></button></div>
            </form> : <AtlasConversationComposer key={atlas.conversationEpoch} {...{ atlas, busy, dictating, setDictating, voice, clientName, composerRef }} avatar={atlasAvatar} onContextChange={changeChatContext} onModeChange={changeMode} onKnowledge={() => setTab(tab === 'memory' ? 'conversation' : 'memory')} responseContext={responseContext} />}
            {!officeView && emptyChat && <AtlasConversationSuggestions agents={atlas.base.agents || []} avatar={atlasAvatar} onPrompt={selectPrompt} />}
            {!officeView && !emptyChat && <p className="atlas-converse-footnote">Alterações, envios e publicações passam pela sua aprovação.</p>}

            {officeView && <p className="atlas-composer-note">Pode continuar este assunto por texto ou áudio.</p>}
          </section>}
          {tab === 'missions' && <AtlasMissions runs={[...atlas.jobs.filter(job => job.conversation_id === atlas.conversationId),...atlas.runs]} processing={conversationWork.length>0 || atlas.processing} onRefresh={async()=>{await atlas.refreshHistory();await atlas.refreshBase();}} onError={atlas.handleError} />}
          {tab === 'memory' && (officeView ? <><div className="atlas-preferences"><label><input type="checkbox" checked={atlas.base.preferences?.auto_memory!==false} onChange={e=>preference('auto_memory',e.target.checked)}/>Aprender com minhas conversas</label><label><input type="checkbox" checked={atlas.base.preferences?.monitor_enabled!==false} onChange={e=>preference('monitor_enabled',e.target.checked)}/>Acompanhar operação no horário comercial</label><label><input type="checkbox" checked={atlas.base.preferences?.transcribe_group_audio===true} onChange={e=>preference('transcribe_group_audio',e.target.checked)}/>Transcrever áudios recebidos nos grupos para o Atlas</label></div><AtlasMemory memories={atlas.base.memories || []} clients={atlas.base.clients || []} clientId={atlas.clientId} onError={atlas.handleError} onSaved={(memory) => atlas.setBase((current) => ({ ...current, memories: [memory, ...(current.memories || []).filter((item) => item.id !== memory.id && item.id !== memory.replaces_id)] }))} onRevoked={(id) => atlas.setBase((current) => ({ ...current, memories: (current.memories || []).filter((item) => item.id !== id) }))} /></> : <AtlasSquadKnowledgeDialog open onClose={() => setTab('conversation')} onReturnFocus={() => composerRef.current?.focus()} knowledge={(atlas.base.knowledge || []).filter(item => (item.client_id || '') === atlas.clientId)} coverage={atlas.base.knowledge_coverage} clientName={clientName} busy={busy} onTeach={teach} />)}
        </section>
  ) : null;
  if(officeView)return atlas.loading||gateError||!atlas.base?<div className="atlas-page"><AtlasGate loading={atlas.loading} error={gateError} onReload={atlas.load}/></div>:<div className="atlas-page atlas-office-shell"><AtlasOffice key={user?.id} onOpenConversation={openOfficeChat} managerActivity={managerActivity}/>{workspace}</div>;

  if (atlas.loading || gateError || !atlas.base) return <div className="atlas-page"><AtlasGate loading={atlas.loading} error={gateError} onReload={atlas.load} /></div>;

  return <div className="atlas-page atlas-converse" data-mode={tab === 'conversation' ? atlas.mode : 'chat'} data-pane={automationPane}>
    <AtlasConversationNav key={user?.id} atlas={atlas} avatar={atlasAvatar} name={profile?.full_name} ownerId={user?.id} busy={busy || Boolean(responseContext)} tab={tab} onTab={setTab} onNew={startConversation} onOpen={restoreConversation} />
    {atlas.mode === 'automation' && tab === 'conversation' && <div className="atlas-automation-switch" role="group" aria-label="Visualização da automação"><button type="button" aria-pressed={automationPane === 'chat'} onClick={() => setAutomationPane('chat')}>Conversa</button><button type="button" aria-pressed={automationPane === 'flow'} onClick={() => setAutomationPane('flow')}>Fluxo</button></div>}
    {workspace}
    {atlas.mode === 'automation' && tab === 'conversation' && <AtlasAutomationCanvas item={automationItem} run={atlas.latestRun} busy={busy} onSave={payload => atlas.respondToInteraction(payload).catch(atlas.handleError)} onRun={atlas.executeAutomation} onPrompt={prompt => { setAutomationPane('chat'); selectPrompt(prompt); }} />}
  </div>;
}
