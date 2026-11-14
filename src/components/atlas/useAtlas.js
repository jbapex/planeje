import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bootstrapAtlas, createAtlasRequestId, loadAtlasHistory, loadAtlasProgress, sendAtlasMessage, respondAtlasInteraction, reconcileAtlasInteraction, uploadAtlasMessageAttachments, runAtlasAutomation } from '@/lib/atlasApi';
import { atlasConversationTimeline, latestAtlasRun } from './atlasPresentation';
import { atlasClientCandidates, atlasClientQuestion } from '@/lib/atlasConversationClients';
import { CS_ATLAS_MESSAGE_LIMIT } from '@/lib/csIaAtlasDraft';
import { ATLAS_EXECUTOR_MESSAGE_LIMIT, atlasExecutorMessageBody } from '@/lib/atlasExecutorRequest';

const LOCK_CODES = new Set(['ATLAS_NOT_CONFIGURED', 'ATLAS_FORBIDDEN', 'ATLAS_DISABLED', 'ATLAS_UNAUTHENTICATED', 'UNAUTHENTICATED']);
const displayConversation = conversation => conversation ? { ...conversation, title: atlasExecutorMessageBody(conversation.title) } : conversation;

export default function useAtlas(userId, { executor = false } = {}) {
  const [base, setBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gateError, setGateError] = useState(null);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [runs, setRuns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [responding, setResponding] = useState(false);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('chat');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [clientChoice, setClientChoice] = useState(null);
  const [csScope, setCsScope] = useState(null);
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retryKind, setRetryKind] = useState(null);
  const requestRef = useRef(null);
  const manualRetryRef = useRef(null);
  const attachmentRequests = useRef(new Map());
  const busyRef = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const messageLimit = executor ? ATLAS_EXECUTOR_MESSAGE_LIMIT : csScope ? CS_ATLAS_MESSAGE_LIMIT : 12000;
  const decorateBase = useCallback(next => next ? { ...next,
    ...(Array.isArray(next.conversations) && { conversations: next.conversations.map(displayConversation) }),
    ...(executor && { agents: (next.executor_agents || next.agents || []).filter(agent => ['central','crm','cs','gestor'].includes(agent.id)) }),
  } : next, [executor]);
  const processing = latestAtlasRun(runs)?.status === 'processing';
  const working = jobs.some(j => ['queued','running'].includes(j.status));
  const latestRun = useMemo(() => jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'queued') || latestAtlasRun([...jobs,...runs]), [jobs,runs]);

  const handleError = useCallback((failure) => {
    if (LOCK_CODES.has(failure.code)) {
      setGateError(failure);
      setBase(null);
      setMessages([]);
      setRuns([]);
      setInteractions([]);
    } else setError(failure.message || 'Não foi possível concluir esta ação.');
  }, []);

  const load = useCallback(async () => {
    const version = ++epoch.current;
    setLoading(true);
    setGateError(null);
    setError('');
    if (!userId) {
      setBase(null);
      setGateError({ code: 'ATLAS_UNAUTHENTICATED', message: 'Entre na sua conta para abrir o Atlas.' });
      setLoading(false);
      return;
    }
    try {
      const next = await bootstrapAtlas({ executor });
      if (mounted.current && version === epoch.current) { setBase(decorateBase(next)); setJobs(next.jobs || []); }
    } catch (failure) {
      if (mounted.current && version === epoch.current) { setBase(null); setGateError(failure); }
    } finally {
      if (mounted.current && version === epoch.current) setLoading(false);
    }
  }, [userId, decorateBase, executor]);

  useEffect(() => {
    mounted.current = true;
    setMode('chat'); setFiles([]); setUploading(false);
    setBase(null); setMessages([]); setRuns([]); setJobs([]); setInteractions([]); setResponding(false); setDraft(''); setClientChoice(null); setClientId(''); setConversationId(null); setCsScope(null);
    attachmentRequests.current.clear(); manualRetryRef.current = null; requestRef.current = null; busyRef.current = false; setSending(false); setUploading(false); setPendingMessage(''); setHistoryLoading(false); setRetryKind(null);
    load();
    return () => { mounted.current = false; epoch.current += 1; };
  }, [load]);

  const applyHistory = useCallback((history) => {
    setMessages(Array.isArray(history.messages) ? history.messages : []);
    setRuns(Array.isArray(history.runs) ? history.runs : []);
    setInteractions(Array.isArray(history.interactions) ? history.interactions : []);
    setJobs(current => [...(history.jobs || []), ...current.filter(j => j.conversation_id !== history.conversation?.id)]);
    if (history.conversation) {
      setConversationId(history.conversation.id);
      setMode(history.conversation.mode || 'chat');
      setClientId(history.conversation.client_id || '');
      setBase((current) => current ? { ...current, conversations: [displayConversation(history.conversation), ...(current.conversations || []).filter((item) => item.id !== history.conversation.id)] } : current);
    }
  }, []);

  async function openConversation(id, { resetDraft = false } = {}) {
    if (busyRef.current || processing) return;
    const version = ++epoch.current;
    setFiles([]);
    if (resetDraft) setDraft('');
    else if (clientChoice) setDraft(clientChoice.message);
    setHistoryLoading(true); setError(''); setClientChoice(null);
    requestRef.current = null; manualRetryRef.current = null; setRetryKind(null);
    try {
      const history = await loadAtlasHistory(id, { executor });
      if (mounted.current && version === epoch.current) { setCsScope(null); applyHistory(history); }
    } catch (failure) {
      if (mounted.current && version === epoch.current) handleError(failure);
    } finally {
      if (mounted.current && version === epoch.current) setHistoryLoading(false);
    }
  }

  function newConversation(nextClientId = clientId, { csScope: scope = null, mode: nextMode = mode } = {}) {
    if (busyRef.current || historyLoading || processing) return;
    epoch.current += 1;
    setMode(nextMode === 'automation' ? 'automation' : 'chat'); setFiles([]);
    setConversationId(null); setClientId(nextClientId || ''); setMessages([]); setRuns([]); setInteractions([]); setError(''); setRetryKind(null);
    if (clientChoice) setDraft(clientChoice.message);
    setClientChoice(null);
    setCsScope(scope === (nextClientId ? 'client' : 'portfolio') ? scope : null);
    requestRef.current = null; manualRetryRef.current = null;
    return epoch.current;
  }

  const refreshHistory = useCallback(async () => {
    if (!conversationId) return;
    const version = epoch.current;
    try {
      const history = await loadAtlasHistory(conversationId, { executor });
      if (mounted.current && version === epoch.current) {
        applyHistory(history);
        const pending = requestRef.current;
        const settled = (history.runs || []).find((run) => run.id === pending?.runId || run.request_id === pending?.payload?.request_id);
        if (pending && settled?.status === 'completed') {
          setError(''); setFiles([]);
          setDraft((current) => current.trim() === pending.payload.message ? '' : current);
          setCsScope(null);
          requestRef.current = null; setRetryKind(null);
        } else if (pending && settled?.status === 'failed') {
          manualRetryRef.current = pending.operation ? { fingerprint: pending.fingerprint, operation: pending.operation } : null;
          if (pending.retryMessage) setDraft(current => current.trim() === pending.payload.message ? pending.retryMessage : current);
          requestRef.current = null; setRetryKind('terminal');
          setError(settled.error || 'Esta missão falhou. Você pode fazer uma nova tentativa.');
        }
      }
      return history;
    } catch (failure) {
      if (mounted.current && version === epoch.current) handleError(failure);
      return null;
    }
  }, [conversationId, applyHistory, handleError, executor]);

  // Poll only a run the server reported as in progress; timers never invent agent states.
  useEffect(() => {
    if (!processing || !conversationId || sending) return undefined;
    let cancelled = false;
    let timeout;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      const history = await refreshHistory();
      if (cancelled) return;
      const run = latestAtlasRun(history?.runs);
      if (run?.status === 'completed') { requestRef.current = null; setDraft(''); setFiles([]); setCsScope(null); setRetryKind(null); return; }
      if (run?.status === 'failed') { requestRef.current = null; setRetryKind('terminal'); setError(run.error || 'Esta missão falhou. Você pode fazer uma nova tentativa.'); return; }
      attempts += 1;
      if (history && attempts < 20) timeout = setTimeout(poll, 4000);
      else setError('A missão ainda não teve sua conclusão confirmada. Use Atualizar missão para consultar o estado.');
    };
    timeout = setTimeout(poll, 2500);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [processing, conversationId, sending, refreshHistory]);

  async function send(event, spokenMessage, selection) {
    event?.preventDefault();
    let message = (typeof spokenMessage === 'string' ? spokenMessage : draft).trim();
    if (!message && executor && files.length) message = 'Analise os arquivos anexados.';
    if (!message || busyRef.current || historyLoading || processing || !base?.enabled) return;
    if (message.length > messageLimit) { setError(`Resuma sua mensagem para até ${messageLimit.toLocaleString('pt-BR')} caracteres.`); return; }
    const needsClient = { status: 'needs_client', error: 'Confirme o cliente nas opções da conversa. Seu pedido está preservado.' };
    if (clientChoice && !selection?.confirmed) {
      const matches = atlasClientCandidates(message, base.clients);
      const yes = /^(sim|isso|esse|essa|correto|pode seguir)[.!\s]*$/i.test(message);
      const selected = matches.length === 1 ? matches[0] : yes && clientChoice.candidates.length === 1 ? clientChoice.candidates[0] : null;
      if (!selected) { setClientChoice({ ...clientChoice, candidates: matches, search: true, query: message }); setDraft(''); return needsClient; }
      selection = { confirmed: true, clientId: selected.id };
      message = clientChoice.message;
    }
    const currentFingerprint = JSON.stringify([conversationId, clientId || null, message, mode, files.map(file => file.id)]);
    const retrying = requestRef.current?.fingerprint === currentFingerprint || manualRetryRef.current?.fingerprint === currentFingerprint;
    if (!selection?.confirmed && !selection?.executorReply && !selection?.automation && !retrying && !csScope) {
      const question = atlasClientQuestion(message, base.clients, clientId, { executor });
      if (question) { setClientChoice(question); setDraft(''); setError(''); return needsClient; }
    }
    const targetClient = selection?.confirmed ? selection.clientId || '' : clientId;
    if (targetClient && !(base.clients || []).some(client => client.id === targetClient)) { setError('Selecione um cliente disponível nesta conta.'); return; }
    let targetConversation = conversationId;
    if (targetClient !== clientId) {
      epoch.current += 1; targetConversation = null;
      setConversationId(null); setClientId(targetClient); setMessages([]); setRuns([]); setInteractions([]);
    }
    setClientChoice(null);
    if (typeof spokenMessage === 'string' || selection?.confirmed) setDraft(message);
    const version = epoch.current;
    const fingerprint = JSON.stringify([targetConversation, targetClient || null, message, mode, files.map(file => file.id)]);
    const operation = selection?.automation || (manualRetryRef.current?.fingerprint === fingerprint ? manualRetryRef.current.operation : null);
    let request = requestRef.current;
    if (request?.fingerprint !== fingerprint) {
      const requestId = selection?.executorReply?.resume_request_id || createAtlasRequestId();
      const requestFiles = files.map(entry => attachmentRequests.current.has(entry.id) && attachmentRequests.current.get(entry.id) !== requestId ? { ...entry, id: createAtlasRequestId() } : entry);
      if (requestFiles.some((entry,index) => entry.id !== files[index].id)) setFiles(requestFiles);
      request = { operation, fingerprint: JSON.stringify([targetConversation,targetClient || null,message,mode,requestFiles.map(file => file.id)]), files: requestFiles, retryMessage: selection?.retryMessage,
        payload: { request_id: requestId, conversation_id: targetConversation || undefined, client_id: targetClient || null, message,
          ...(executor ? { executor: true, mode, attachment_ids: requestFiles.map(file => file.id), ...(operation && operation), ...(selection?.executorReply && { executor_reply: selection.executorReply.id }) }
            : { ...(csScope === 'portfolio' && !targetClient && { cs_portfolio: true }), ...(csScope === 'client' && targetClient && { cs_client: true }) }) } };
    }
    requestRef.current = request; manualRetryRef.current = null;
    busyRef.current = true; setSending(true); setPendingMessage(message); setError(''); setRetryKind(null);
    let settled = false;
    let progressTimer;
    const pollProgress = async () => {
      if (settled || !mounted.current || version !== epoch.current) return;
      try {
        const { run } = await loadAtlasProgress(request.payload.request_id, { executor });
        if (settled || !mounted.current || version !== epoch.current) return;
        if (run) {
          request.runId = run.id;
          setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
        }
      } catch { /* The chat response owns error handling; progress is read-only and optional. */ }
      if (!settled && mounted.current && version === epoch.current) progressTimer = setTimeout(pollProgress, 2000);
    };
    progressTimer = setTimeout(pollProgress, 900);
    try {
      if (executor && request.files?.length && !request.uploaded) {
        setUploading(true);
        for (const file of request.files) attachmentRequests.current.set(file.id,request.payload.request_id);
        await uploadAtlasMessageAttachments({ files: request.files, requestId: request.payload.request_id, conversationId: request.payload.conversation_id || null, clientId: request.payload.client_id });
        request.uploaded = true;
        if (!mounted.current || version !== epoch.current) return;
        setUploading(false);
      }
      const response = await (request.payload.proposal_id || request.payload.automation_id ? runAtlasAutomation : sendAtlasMessage)(request.payload);
      if (!mounted.current || version !== epoch.current) return;
      setPendingMessage('');
      if (Array.isArray(response.interactions)) setInteractions(response.interactions);
      request.runId = response.run_id;
      if (response.conversation_id) {
        setConversationId(response.conversation_id);
        // Retrying an uncertain request uses its original payload, including the absent conversation id.
        request.fingerprint = JSON.stringify([response.conversation_id, targetClient || null, message, mode, request.files.map(file => file.id)]);
      }
      const run = { id: response.run_id, request_id: request.payload.request_id, status: response.status, steps: response.steps || [], result: response.message?.content || null, error: response.error, received_at: new Date().toISOString() };
      if (run.id) setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      if (response.status === 'failed') {
        manualRetryRef.current = request.operation ? { fingerprint: request.fingerprint, operation: request.operation } : null;
        if (request.retryMessage) setDraft(current => current.trim() === request.payload.message ? request.retryMessage : current);
        requestRef.current = null; setRetryKind('terminal'); setError(response.error || 'A missão falhou. Seu pedido está preservado para uma nova tentativa.');
      } else if (response.status === 'completed') {
        requestRef.current = null; setDraft(''); setFiles([]); setCsScope(null);
        if (response.message?.content) setMessages((current) => [...current, { id: `${response.run_id}-user`, role: 'user', content: message, run_id: response.run_id }, { ...response.message, id: `${response.run_id}-assistant`, run_id: response.run_id }]);
      }
      if (response.conversation_id) {
        try {
          const history = await loadAtlasHistory(response.conversation_id, { executor });
          if (mounted.current && version === epoch.current) applyHistory(history);
        } catch (failure) {
          if (mounted.current && version === epoch.current) handleError(failure);
        }
      }
      return response;
    } catch (failure) {
      if (mounted.current && version === epoch.current) {
        setRetryKind('uncertain');
        handleError(failure);
      }
    } finally {
      settled = true; clearTimeout(progressTimer);
      if (mounted.current && version === epoch.current) { busyRef.current = false; setSending(false); setUploading(false); setPendingMessage(''); }
    }
  }

  async function respondToInteraction(payload) {
    if (busyRef.current || historyLoading || processing) throw new Error('Aguarde a etapa atual antes de responder.');
    if (!executor || !interactions.some(item => item.id === payload.id && item.revision === payload.revision && item.conversation_id === conversationId)) throw new Error('Atualize o histórico antes de responder a este item.');
    const version = epoch.current;
    let confirmed;
    busyRef.current = true; setResponding(true); setError('');
    try {
      const decision = Object.fromEntries(['id', 'revision', 'decision', 'answers', 'text'].filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]]));
      const response = await respondAtlasInteraction(decision);
      if (!mounted.current || version !== epoch.current) return response;
      confirmed = response.item;
      if (!confirmed?.id || confirmed.id !== payload.id) throw new Error('A decisão ainda não foi confirmada no histórico.');
      setInteractions(current => current.map(item => item.id === confirmed.id ? confirmed : item));
    } catch (failure) {
      if (mounted.current && version === epoch.current) {
        const history = await refreshHistory();
        confirmed = history?.interactions?.find(item => item.id === payload.id && !['awaiting_input', 'proposed'].includes(item.state) && item.decision === payload.decision &&
          (payload.decision === 'answer' ? Object.keys(item.answers || {}).length === Object.keys(payload.answers || {}).length && Object.entries(payload.answers || {}).every(([key, value]) => JSON.stringify(item.answers?.[key]) === JSON.stringify(value))
            : payload.decision === 'text' ? item.answers?.text === payload.text?.trim() : true));
        if (!confirmed) { handleError(failure); throw failure; }
      }
    } finally {
      if (mounted.current && version === epoch.current) { busyRef.current = false; setResponding(false); }
    }
    return continueAfterItem(confirmed, version);
  }

  async function continueAfterItem(item, version) {
    if (!item || !mounted.current || version !== epoch.current || ['executing', 'uncertain'].includes(item.state)) return;
    if (item.app === 'atlas' && item.state === 'completed') await refreshBase();
    if (mounted.current && version === epoch.current) {
      const resumeIds = new Set([item,...interactions].map(record => record.resume_request_id).filter(Boolean));
      const continuationRuns = new Set(runs.filter(run => resumeIds.has(run.request_id)).map(run => run.id));
      const origin = messages.findIndex(message => message.role === 'user' && message.run_id === item.run_id);
      const preceding = origin < 0 ? messages : messages.slice(0,origin + 1);
      const retryMessage = preceding.filter(message => message.role === 'user' && !continuationRuns.has(message.run_id))
        .map(message => atlasExecutorMessageBody(message.content)).filter(content => typeof content === 'string' && content.trim() && content.trim() !== 'Continuar após minha resposta.').at(-1)
        || `Retome o pedido desta conversa com a resposta já registrada em “${item.title}” e os recibos confirmados, sem repetir operações concluídas.`;
      return send(undefined, 'Continuar após minha resposta.', { executorReply: item, retryMessage });
    }
  }

  async function reconcileInteraction(id) {
    if (busyRef.current || historyLoading || processing) throw new Error('Aguarde a etapa atual antes de conferir.');
    if (!executor || !interactions.some(item => item.id === id && item.conversation_id === conversationId && ['executing', 'uncertain'].includes(item.state))) throw new Error('Atualize o histórico antes de conferir este item.');
    const version = epoch.current;
    let confirmed;
    busyRef.current = true; setResponding(true); setError('');
    try {
      const response = await reconcileAtlasInteraction(id);
      if (!mounted.current || version !== epoch.current) return;
      confirmed = response.item;
      if (confirmed?.id !== id || confirmed.conversation_id !== conversationId) throw new Error('O resultado ainda não foi confirmado no histórico.');
      setInteractions(current => current.map(item => item.id === id ? confirmed : item));
    } catch (failure) {
      if (mounted.current && version === epoch.current) {
        const history = await refreshHistory();
        confirmed = history?.interactions?.find(item => item.id === id && item.state === 'completed');
        if (!confirmed) { handleError(failure); throw failure; }
      }
    } finally {
      if (mounted.current && version === epoch.current) { busyRef.current = false; setResponding(false); }
    }
    return continueAfterItem(confirmed, version);
  }

  const refreshBase = useCallback(async () => {
    const version=epoch.current;
    try { const next=await bootstrapAtlas({ executor, clientId }); if(mounted.current && version===epoch.current){setBase(decorateBase(next));setJobs(next.jobs||[]);} }
    catch(failure){if(mounted.current && version===epoch.current)handleError(failure);}
  },[handleError,decorateBase,executor,clientId]);
  useEffect(() => { if (executor && base?.enabled) void refreshBase(); }, [executor,base?.enabled,refreshBase]);
  useEffect(()=>{
    if(!base?.enabled)return undefined;
    const timer=setInterval(()=>{if(conversationId&&!busyRef.current)void refreshHistory();else void refreshBase();},4000);
    const baseTimer=setInterval(()=>{if(!busyRef.current)void refreshBase();},20000);
    return()=>{clearInterval(timer);clearInterval(baseTimer);};
  },[base?.enabled,conversationId,refreshHistory,refreshBase]);
  const timeline=useMemo(()=>atlasConversationTimeline(messages,jobs,conversationId),[messages,jobs,conversationId]);
  function confirmClient(id) { if(clientChoice) return send(undefined, clientChoice.message, { confirmed: true, clientId: id }); }
  function cancelClientChoice() { if(clientChoice)setDraft(clientChoice.message); setClientChoice(null); }
  return { mode, files, setFiles, uploading, executeAutomation: pointer => send(undefined, 'Executar agora: ' + (pointer.name || 'Fluxo manual'), { automation: Object.fromEntries(['proposal_id','automation_id','revision'].filter(key => Object.hasOwn(pointer,key)).map(key => [key,pointer[key]])) }), jobs, working, refreshBase, base, setBase, loading, gateError, error, setError, load, clientId, conversationId, conversationEpoch: epoch.current, messages:timeline, runs, latestRun, draft, setDraft, csScope, messageLimit, clientChoice, confirmClient, cancelClientChoice, sending, pendingMessage, responding, interactions, respondToInteraction, reconcileInteraction, historyLoading, processing, retryKind, send, openConversation, newConversation, refreshHistory, handleError };
}
