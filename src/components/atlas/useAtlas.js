import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bootstrapAtlas, createAtlasRequestId, loadAtlasHistory, loadAtlasProgress, sendAtlasMessage } from '@/lib/atlasApi';
import { atlasConversationTimeline, latestAtlasRun } from './atlasPresentation';
import { atlasClientCandidates, atlasClientQuestion } from '@/lib/atlasConversationClients';
import { CS_ATLAS_MESSAGE_LIMIT } from '@/lib/csIaAtlasDraft';

const LOCK_CODES = new Set(['ATLAS_NOT_CONFIGURED', 'ATLAS_FORBIDDEN', 'ATLAS_DISABLED', 'ATLAS_UNAUTHENTICATED', 'UNAUTHENTICATED']);

export default function useAtlas(userId) {
  const [base, setBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gateError, setGateError] = useState(null);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [runs, setRuns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [draft, setDraft] = useState('');
  const [clientChoice, setClientChoice] = useState(null);
  const [csScope, setCsScope] = useState(null);
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retryKind, setRetryKind] = useState(null);
  const requestRef = useRef(null);
  const busyRef = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const messageLimit = csScope ? CS_ATLAS_MESSAGE_LIMIT : 12000;
  const processing = latestAtlasRun(runs)?.status === 'processing';
  const working = jobs.some(j => ['queued','running'].includes(j.status));
  const latestRun = useMemo(() => jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'queued') || latestAtlasRun([...jobs,...runs]), [jobs,runs]);

  const handleError = useCallback((failure) => {
    if (LOCK_CODES.has(failure.code)) {
      setGateError(failure);
      setBase(null);
      setMessages([]);
      setRuns([]);
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
      const next = await bootstrapAtlas();
      if (mounted.current && version === epoch.current) { setBase(next); setJobs(next.jobs || []); }
    } catch (failure) {
      if (mounted.current && version === epoch.current) { setBase(null); setGateError(failure); }
    } finally {
      if (mounted.current && version === epoch.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    setBase(null); setMessages([]); setRuns([]); setJobs([]); setDraft(''); setClientChoice(null); setClientId(''); setConversationId(null); setCsScope(null);
    requestRef.current = null; busyRef.current = false; setSending(false); setPendingMessage(''); setHistoryLoading(false); setRetryKind(null);
    load();
    return () => { mounted.current = false; epoch.current += 1; };
  }, [load]);

  const applyHistory = useCallback((history) => {
    setMessages(Array.isArray(history.messages) ? history.messages : []);
    setRuns(Array.isArray(history.runs) ? history.runs : []);
    setJobs(current => [...(history.jobs || []), ...current.filter(j => j.conversation_id !== history.conversation?.id)]);
    if (history.conversation) {
      setConversationId(history.conversation.id);
      setClientId(history.conversation.client_id || '');
      setBase((current) => current ? { ...current, conversations: [history.conversation, ...(current.conversations || []).filter((item) => item.id !== history.conversation.id)] } : current);
    }
  }, []);

  async function openConversation(id, { resetDraft = false } = {}) {
    if (busyRef.current || processing) return;
    const version = ++epoch.current;
    if (resetDraft) setDraft('');
    else if (clientChoice) setDraft(clientChoice.message);
    setHistoryLoading(true); setError(''); setClientChoice(null);
    requestRef.current = null; setRetryKind(null);
    try {
      const history = await loadAtlasHistory(id);
      if (mounted.current && version === epoch.current) { setCsScope(null); applyHistory(history); }
    } catch (failure) {
      if (mounted.current && version === epoch.current) handleError(failure);
    } finally {
      if (mounted.current && version === epoch.current) setHistoryLoading(false);
    }
  }

  function newConversation(nextClientId = clientId, { csScope: scope = null } = {}) {
    if (busyRef.current || historyLoading || processing) return;
    epoch.current += 1;
    setConversationId(null); setClientId(nextClientId || ''); setMessages([]); setRuns([]); setError(''); setRetryKind(null);
    if (clientChoice) setDraft(clientChoice.message);
    setClientChoice(null);
    setCsScope(scope === (nextClientId ? 'client' : 'portfolio') ? scope : null);
    requestRef.current = null;
    return epoch.current;
  }

  const refreshHistory = useCallback(async () => {
    if (!conversationId) return;
    const version = epoch.current;
    try {
      const history = await loadAtlasHistory(conversationId);
      if (mounted.current && version === epoch.current) {
        applyHistory(history); setError('');
        const pending = requestRef.current;
        const settled = (history.runs || []).find((run) => run.id === pending?.runId || run.request_id === pending?.payload?.request_id);
        if (pending && settled?.status === 'completed') {
          setDraft((current) => current.trim() === pending.payload.message ? '' : current);
          setCsScope(null);
          requestRef.current = null; setRetryKind(null);
        } else if (pending && settled?.status === 'failed') {
          requestRef.current = null; setRetryKind('terminal');
          setError(settled.error || 'Esta missão falhou. Você pode fazer uma nova tentativa.');
        }
      }
      return history;
    } catch (failure) {
      if (mounted.current && version === epoch.current) handleError(failure);
      return null;
    }
  }, [conversationId, applyHistory, handleError]);

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
      if (run?.status === 'completed') { requestRef.current = null; setDraft(''); setCsScope(null); setRetryKind(null); return; }
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
    const retrying = requestRef.current?.fingerprint === JSON.stringify([conversationId, clientId || null, message]);
    if (!selection?.confirmed && !retrying && !csScope) {
      const question = atlasClientQuestion(message, base.clients, clientId);
      if (question) { setClientChoice(question); setDraft(''); setError(''); return needsClient; }
    }
    const targetClient = selection?.confirmed ? selection.clientId || '' : clientId;
    if (targetClient && !(base.clients || []).some(client => client.id === targetClient)) { setError('Selecione um cliente disponível nesta conta.'); return; }
    let targetConversation = conversationId;
    if (targetClient !== clientId) {
      epoch.current += 1; targetConversation = null;
      setConversationId(null); setClientId(targetClient); setMessages([]); setRuns([]);
    }
    setClientChoice(null);
    if (typeof spokenMessage === 'string' || selection?.confirmed) setDraft(message);
    const version = epoch.current;
    const fingerprint = JSON.stringify([targetConversation, targetClient || null, message]);
    const previous = requestRef.current;
    const request = previous?.fingerprint === fingerprint ? previous : { fingerprint, payload: { request_id: createAtlasRequestId(), conversation_id: targetConversation || undefined, client_id: targetClient || null, message,
      ...(csScope === 'portfolio' && !targetClient && { cs_portfolio: true }), ...(csScope === 'client' && targetClient && { cs_client: true }) } };
    requestRef.current = request;
    busyRef.current = true; setSending(true); setPendingMessage(message); setError(''); setRetryKind(null);
    let settled = false;
    let progressTimer;
    const pollProgress = async () => {
      if (settled || !mounted.current || version !== epoch.current) return;
      try {
        const { run } = await loadAtlasProgress(request.payload.request_id);
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
      const response = await sendAtlasMessage(request.payload);
      if (!mounted.current || version !== epoch.current) return;
      setPendingMessage('');
      request.runId = response.run_id;
      if (response.conversation_id) {
        setConversationId(response.conversation_id);
        // Retrying an uncertain request uses its original payload, including the absent conversation id.
        request.fingerprint = JSON.stringify([response.conversation_id, targetClient || null, message]);
      }
      const run = { id: response.run_id, status: response.status, steps: response.steps || [], result: response.message?.content || null, error: response.error, received_at: new Date().toISOString() };
      if (run.id) setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      if (response.status === 'failed') {
        requestRef.current = null; setRetryKind('terminal'); setError(response.error || 'A missão falhou. Seu pedido está preservado para uma nova tentativa.');
      } else if (response.status === 'completed') {
        requestRef.current = null; setDraft(''); setCsScope(null);
        if (response.message?.content) setMessages((current) => [...current, { id: `${response.run_id}-user`, role: 'user', content: message, run_id: response.run_id }, { ...response.message, id: `${response.run_id}-assistant`, run_id: response.run_id }]);
      }
      if (response.conversation_id) {
        try {
          const history = await loadAtlasHistory(response.conversation_id);
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
      if (mounted.current && version === epoch.current) { busyRef.current = false; setSending(false); setPendingMessage(''); }
    }
  }

  const refreshBase = useCallback(async () => {
    const version=epoch.current;
    try { const next=await bootstrapAtlas(); if(mounted.current && version===epoch.current){setBase(next);setJobs(next.jobs||[]);} }
    catch(failure){if(mounted.current && version===epoch.current)handleError(failure);}
  },[handleError]);
  useEffect(()=>{
    if(!base?.enabled)return undefined;
    const timer=setInterval(()=>{if(conversationId&&!busyRef.current)void refreshHistory();else void refreshBase();},4000);
    const baseTimer=setInterval(()=>{if(!busyRef.current)void refreshBase();},20000);
    return()=>{clearInterval(timer);clearInterval(baseTimer);};
  },[base?.enabled,conversationId,refreshHistory,refreshBase]);
  const timeline=useMemo(()=>atlasConversationTimeline(messages,jobs,conversationId),[messages,jobs,conversationId]);
  function confirmClient(id) { if(clientChoice) return send(undefined, clientChoice.message, { confirmed: true, clientId: id }); }
  function cancelClientChoice() { if(clientChoice)setDraft(clientChoice.message); setClientChoice(null); }
  return { jobs, working, refreshBase, base, setBase, loading, gateError, error, setError, load, clientId, conversationId, conversationEpoch: epoch.current, messages:timeline, runs, latestRun, draft, setDraft, csScope, messageLimit, clientChoice, confirmClient, cancelClientChoice, sending, pendingMessage, historyLoading, processing, retryKind, send, openConversation, newConversation, refreshHistory, handleError };
}
