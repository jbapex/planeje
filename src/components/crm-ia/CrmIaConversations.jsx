import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AtendimentoWaitTimeBadge from '../atendimento/AtendimentoWaitTimeBadge';
import '../atendimento/Atendimento.css';
import { ArrowLeft, ArrowLeftRight, Bot, CalendarClock, Check, ChevronDown, Clock3, ListFilter, MessagesSquare, MoreHorizontal, RefreshCw, Search, UserCheck } from 'lucide-react';
import { CrmIaEditor, CrmIaField, CrmIaPagination, CrmIaQueue, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { attendanceName, dateRange, dateTime, named } from './crmIaPresentation';
import AtendimentoComposer from '../atendimento/AtendimentoComposer';
import { ATENDIMENTO_MEDIA_MAX_BYTES, readFileAsBase64, validateAtendimentoMediaFile } from '@/lib/atendimentoMediaSend';
import CrmIaMessageMedia from './CrmIaMessageMedia';
import CrmIaNotificationFeed from './CrmIaNotificationFeed';
import CrmIaAvatar from './CrmIaAvatar';
import CrmIaConversationContext, { CrmIaAiMessageFlag } from './CrmIaConversationContext';
import { conversationMessageSender, conversationSchedulePresets, futureConversationSchedule, mergeConversationMessages, refreshConversationMessages } from './crmIaConversationModel';

export default function CrmIaConversations({ api, mutate, workspace, revision, canManage, profile }) {
  const [params, setParams] = useSearchParams();
  const [reload, setReload] = useState(0);
  const [queueScope, setQueueScope] = useState(null);
  const queueTrigger = useRef(null);
  const listQueueTrigger = useRef(null);
  const selected = params.get('contact_id') && params.get('channel_id') ? { contact_id: params.get('contact_id'), channel_id: params.get('channel_id') } : null;
  const [opened, setOpened] = useState(selected);
  const contactId = selected?.contact_id;
  const selectedChannel = selected?.channel_id;
  useEffect(() => { if (contactId && selectedChannel) setOpened({ contact_id: contactId, channel_id: selectedChannel }); }, [contactId, selectedChannel]);
  const displayed = selected || opened;
  const search = params.get('search') || '';
  const attendance = params.get('attendance') || '';
  const channel = params.get('channel_id') || '';
  const defaults = dateRange(7);
  const filters = Object.fromEntries(['since', 'until', 'pipeline_id', 'stage_id', 'origin', 'sort'].map(key => [key, params.get(key) || defaults[key] || '']));
  const offset = Math.max(0, Number.parseInt(params.get('offset'), 10) || 0);
  const read = useCrmRead(api, 'conversations', { ...filters, search, attendance, channel_id: channel, owner_id: params.get('owner_id') || '', offset, limit: 30 }, `${revision}:${reload}`, workspace.permissions.conversations === true, 15000);
  const rows = read.data?.rows || [];
  const attendanceOptions = [{ value: '', label: 'Tudo' }, { value: 'ai', label: 'IA ativa' }, { value: 'human', label: 'Atendimento humano' }, { value: 'waiting', label: 'Aguardando uma pessoa' }, { value: 'followup', label: 'Follow-up' }, { value: 'resolved', label: 'Resolvidas' }];
  function filter(key, value) { setParams(old => { const next = new URLSearchParams(old); if (value) next.set(key, value); else next.delete(key); if (key !== 'offset') next.delete('offset'); if (key === 'channel_id') next.delete('contact_id'); return next; }, { replace: key === 'search' }); }
  function choose(row) { setParams(old => { const next = new URLSearchParams(old); next.set('contact_id', row.contact_id); next.set('channel_id', row.channel_id); next.delete('offset'); return next; }); }
  function back() { setParams(old => { const next = new URLSearchParams(old); next.delete('contact_id'); return next; }); }
  function openQueue(event) { queueTrigger.current = event?.currentTarget || null; setQueueScope(selected ? { ...selected } : {}); }
  function restoreQueueFocus(event) { event.preventDefault(); const trigger = queueTrigger.current; if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus(); else listQueueTrigger.current?.focus(); }
  if (workspace.permissions.conversations !== true) return <p className="crm-ia-state" role="status">Conversas indisponíveis para esta sessão.</p>;
  return <div className={`crm-ia-inbox${selected ? ' has-selection' : ''}`}>
    <div className="crm-ia-conversation-layout">
      <section className="crm-ia-conversation-list" aria-label="Lista de conversas">
        <div className="crm-ia-inbox-controls">
          <div className="crm-ia-inbox-actions"><span>{read.data?.total === undefined ? 'Suas conversas' : `${read.data.total} ${read.data.total === 1 ? 'conversa' : 'conversas'} neste recorte`}</span><div>
            <CrmIaNotificationFeed {...{ api, mutate, workspace, revision }} compact />
            <button type="button" className="crm-ia-icon-button" aria-label="Atualizar conversas" title="Atualizar conversas" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /></button>
            <button type="button" className="crm-ia-icon-button" aria-label="Mensagens agendadas" title="Mensagens agendadas" aria-haspopup="dialog" ref={listQueueTrigger} onClick={openQueue}><CalendarClock size={16} aria-hidden="true" /></button>
          </div></div>
          <div className="crm-ia-inbox-search"><Search size={15} aria-hidden="true" /><CrmIaField label="Buscar conversas" value={search} onChange={value => filter('search', value)} placeholder="Buscar nome ou telefone…" /></div>
          <div className="crm-ia-inbox-segments" role="group" aria-label="Quem atende">{[['', 'Todas'], ['ai', 'IA'], ['human', 'Humana']].map(([value, label]) => <button type="button" key={label} aria-pressed={value ? attendance === value : !['ai', 'human'].includes(attendance)} onClick={() => filter('attendance', value)}>{label}</button>)}</div>
          <details className="crm-ia-inbox-filters" onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.open = false; }}>
            <summary><ListFilter size={14} aria-hidden="true" /><span>{attendanceOptions.find(item => item.value === attendance)?.label || 'Tudo'}</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="crm-ia-inbox-filter-panel"><CrmIaField label="Atendimento" value={attendance} onChange={value => filter('attendance', value)} options={attendanceOptions} />
              <CrmIaField label="Canal das conversas" value={channel} onChange={value => filter('channel_id', value)} options={[{ value: '', label: 'Todos os canais' }, ...workspace.channels]} />
              <CrmIaField label="Atendente" value={params.get('owner_id')} onChange={value => filter('owner_id', value)} options={[{ value: '', label: 'Todos os atendentes' }, ...workspace.people]} />
              <p>Período das conversas</p><CrmIaField label="Última mensagem desde" type="date" value={filters.since} onChange={value => filter('since', value)} /><CrmIaField label="Última mensagem até" type="date" value={filters.until} onChange={value => filter('until', value)} />
              <small>Data da última mensagem, no fuso America/Sao_Paulo.</small>
            </div>
          </details>
        </div>
        <div className="crm-ia-inbox-rows"><CrmIaState read={read} retry={() => setReload(value => value + 1)} empty={rows.length === 0 && 'Nenhuma conversa neste recorte.'}>
          <ul>{rows.map(row => <li key={`${row.contact_id}:${row.channel_id}`}><button type="button" aria-label={`Abrir conversa de ${row.nome || 'Contato sem nome'}`} aria-pressed={selected?.contact_id === row.contact_id && selected?.channel_id === row.channel_id} onClick={() => choose(row)}>
            <span className={`crm-ia-contact-avatar is-${row.attendance}`} aria-hidden="true">{Array.from(row.nome?.trim() || '?')[0].toLocaleUpperCase('pt-BR')}</span>
            <span className="crm-ia-conversation-preview"><span className="crm-ia-conversation-preview-heading"><strong>{row.nome || 'Contato sem nome'}</strong><time dateTime={row.last_message_at} title={dateTime(row.last_message_at)}>{dateTime(row.last_message_at).split(',')[0].slice(0, 5)}</time></span><span className="crm-ia-conversation-snippet">{row.last_message || 'Sem trecho disponível'}</span><span className="crm-ia-conversation-meta"><small>{attendanceName(row.attendance)}</small>{row.awaiting_since && <span className="crm-ia-conversation-wait" title={`Espera desde ${dateTime(row.awaiting_since)}`}><Clock3 size={11} aria-hidden="true" />Aguardando<span className="sr-only"> desde {dateTime(row.awaiting_since)}</span></span>}</span></span>
          </button></li>)}</ul>
          {(read.data?.total > 30 || offset > 0) && <CrmIaPagination total={read.data?.total} offset={offset} limit={30} onPage={value => filter('offset', String(value))} />}
        </CrmIaState></div>
      </section>
      {displayed && <div className="crm-ia-inbox-detail" aria-label="Detalhe da conversa" hidden={!selected}><CrmIaConversation key={`${displayed.contact_id}:${displayed.channel_id}`} {...{ api, mutate, workspace, revision, canManage, profile }} visible={Boolean(selected)} onBack={back} onQueue={openQueue} conversation={rows.find(row => row.contact_id === displayed.contact_id && row.channel_id === displayed.channel_id) || displayed} /></div>}
      {!selected && <section className="crm-ia-inbox-empty"><MessagesSquare size={22} aria-hidden="true" /><h2>Selecione uma conversa</h2><p>Escolha uma conversa à esquerda para ver o histórico e responder.</p></section>}
    </div>
    {queueScope && <CrmIaEditor className="crm-ia-queue-dialog" title="Mensagens agendadas" description="Confira os envios e o canal antes de cancelar uma mensagem." onClose={() => setQueueScope(null)} onCloseAutoFocus={restoreQueueFocus}><CrmIaQueue {...{ api, revision, mutate, canManage }} filters={queueScope} /></CrmIaEditor>}
  </div>;
}

export function CrmIaConversation({ conversation, api, mutate, workspace, revision, canManage, profile, onBack, onQueue, visible = true, embedded = false }) {
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState('');
  const [historyFailure, setHistoryFailure] = useState('');
  const olderRequest = useRef(null);
  const historyScope = useRef(null);
  const historyScroll = useRef(null);
  const scrollAnchor = useRef(null);
  const followBottom = useRef(true);
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [scheduleMenu, setScheduleMenu] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const request = useRef(null);
  const mediaRequest = useRef(null);
  const sending = useRef(false);
  const scope = { contact_id: conversation.contact_id, channel_id: conversation.channel_id };
  const channelConfig = workspace.channels.find(channel => channel.id === scope.channel_id);
  const authorized = workspace.permissions.conversations === true && Boolean(scope.contact_id && channelConfig && channelConfig.can_read !== false);
  const stateRead = useCrmRead(api, 'conversations', { ...scope, offset: 0, limit: 1 }, `${revision}:${reload}`, authorized && visible, 10000);
  const messages = useCrmRead(api, 'messages', { ...scope, offset: 0, limit: 50 }, `${revision}:${reload}`, authorized && visible, 5000);
  const stateRow = stateRead.data?.rows?.find(row => row.contact_id === scope.contact_id && row.channel_id === scope.channel_id) || messages.data?.state;
  const readable = authorized && !stateRead.error && !messages.error && !historyFailure;
  const historyKey = JSON.stringify([scope, revision, reload]);
  historyScope.current = JSON.stringify([historyKey, authorized, visible, canManage]);
  const messageRows = refreshConversationMessages(history?.key === historyKey ? history.rows : [], messages.data?.rows || []);
  useEffect(() => {
    if (!visible || !readable) { setHistory(null); setOlderError(''); setOlderBusy(false); olderRequest.current = null; scrollAnchor.current = null; return; }
    if (messages.data) setHistory(old => ({ key: historyKey, rows: refreshConversationMessages(old?.key === historyKey ? old.rows : [], messages.data.rows || []) }));
  }, [visible, readable, historyKey, messages.data]);
  useLayoutEffect(() => {
    const scroll = historyScroll.current;
    if (!scroll) return;
    if (scrollAnchor.current) { scroll.scrollTop = scrollAnchor.current.top + scroll.scrollHeight - scrollAnchor.current.height; scrollAnchor.current = null; scroll.focus({ preventScroll: true }); }
    else if (followBottom.current && messages.data) scroll.scrollTop = scroll.scrollHeight;
  }, [history, messages.data]);
  const canSend = canManage && readable
    && channelConfig.can_send !== false;
  useEffect(() => {
    if (!scheduleMenu || !visible) return undefined;
    const timer = setInterval(() => setScheduleNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [scheduleMenu, visible]);
  const quickReplies = body.startsWith('/') ? (workspace.config.data.attendance?.quick_replies || []).filter(reply => reply.shortcut && reply.shortcut.replace(/^\//, '').startsWith(body.slice(1).trim())) : [];
  async function loadOlder() {
    if (!visible || !readable || messages.pending || olderRequest.current) return;
    const token = {}, requestScope = historyScope.current;
    olderRequest.current = token; setOlderBusy(true); setOlderError('');
    try {
      const page = await api('messages', { ...scope, offset: messageRows.length, limit: 50 });
      if (olderRequest.current !== token || historyScope.current !== requestScope) return;
      if (!page.rows?.length || mergeConversationMessages(messageRows, page.rows).length === messageRows.length) {
        setReload(value => value + 1); setOlderError('O histórico foi atualizado. Carregue as mensagens antigas novamente.'); return;
      }
      const scroll = historyScroll.current;
      if (scroll) scrollAnchor.current = { top: scroll.scrollTop, height: scroll.scrollHeight };
      followBottom.current = false;
      setHistory(old => ({ key: historyKey, rows: mergeConversationMessages(page.rows, old?.key === historyKey ? old.rows : messageRows) }));
    } catch (failure) {
      if (olderRequest.current === token && historyScope.current === requestScope) {
        if (failure.code === '42501') setHistoryFailure(failure.message);
        else setOlderError(failure.message || 'Não foi possível carregar mensagens antigas.');
      }
    } finally { if (olderRequest.current === token) { olderRequest.current = null; setOlderBusy(false); } }
  }
  async function state(attendance) {
    if (!visible || !readable || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try { await mutate('save_conversation', { ...scope, attendance, ...(attendance === 'human' && { assigned_to: profile.id }), expected_updated_at: stateRow?.updated_at }); }
    catch (failure) { setError(failure.message); } finally { sending.current = false; setBusy(false); }
  }
  async function send(scheduledAt) {
    if (!visible || sending.current || !canSend || !body.trim()) return;
    const key = JSON.stringify([scope, body.trim(), scheduledAt]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    sending.current = true; setBusy(true); setError(''); setReceipt(null);
    try {
      const saved = await (scheduledAt ? mutate : api)(scheduledAt ? 'schedule_message' : 'send_message', { ...scope, body: body.trim(), request_id: request.current.id, ...(scheduledAt && { scheduled_at: scheduledAt }) });
      if (!['sent', 'pending'].includes(saved.status)) throw new Error(saved.status === 'uncertain'
        ? 'A entrega ficou incerta. Confira o histórico antes de tentar novamente.'
        : saved.status === 'sending' ? 'Este envio está em processamento. Confira a fila e o histórico.' : 'O envio falhou ou foi cancelado. Seu rascunho foi preservado.');
      setReceipt(saved); setBody(''); request.current = null; setReload(value => value + 1);
    } catch (failure) { setError(failure.message); throw failure; }
    finally { sending.current = false; setBusy(false); }
  }
  async function sendMedia(file, mediaType, caption, validationError) {
    if (validationError) { setError(validationError); return false; }
    if (!visible || sending.current || !canSend) return false;
    const check = validateAtendimentoMediaFile(file, { maxBytes: ATENDIMENTO_MEDIA_MAX_BYTES, allowAnyDocument: true });
    if (!check.ok) { setError(check.message); return false; }
    if (mediaRequest.current?.file !== file || mediaRequest.current?.caption !== caption) mediaRequest.current = { file, caption, id: crypto.randomUUID() };
    sending.current = true; setBusy(true); setError(''); setReceipt(null);
    try {
      const saved = await api('send_media', { ...scope, file: await readFileAsBase64(file),
        media_type: file.type.startsWith('video/') ? 'video' : mediaType, mimetype: file.type || 'application/octet-stream',
        doc_name: file.name, caption, request_id: mediaRequest.current.id });
      if (!['sent', 'pending'].includes(saved.status)) throw new Error(saved.status === 'uncertain'
        ? 'A entrega ficou incerta. Confira o histórico antes de tentar novamente.'
        : saved.status === 'sending' ? 'Este envio está em processamento. Confira a fila e o histórico.' : 'O envio falhou ou foi cancelado. Seu anexo foi preservado.');
      setReceipt(saved); mediaRequest.current = null; setReload(value => value + 1); return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { sending.current = false; setBusy(false); }
  }
  const backButton = onBack && <button type="button" className="crm-ia-inbox-back crm-ia-icon-button" aria-label="Voltar às conversas" onClick={onBack} disabled={busy}><ArrowLeft size={18} aria-hidden="true" /></button>;
  if (!authorized) return <section className="crm-ia-chat-unavailable">{backButton}<p className="crm-ia-state" role="status">Conversa indisponível para esta sessão.</p></section>;
  if (!readable) return <section className="crm-ia-chat-unavailable">{backButton}<p className="crm-ia-error" role="alert">{stateRead.error || messages.error || historyFailure}</p><button type="button" onClick={() => { setHistoryFailure(''); setReload(value => value + 1); }}>Atualizar conversa</button></section>;
  const displayName = stateRow?.nome || conversation.nome || 'Conversa selecionada';
  const attendance = stateRow?.attendance || conversation.attendance;
  const avatarUrl = stateRow?.profile_pic_url || conversation.profile_pic_url;
  const channelName = channelConfig.nome || 'Canal selecionado';
  const attendant = stateRow?.assigned_to ? named(workspace.people?.find(person => person.id === stateRow.assigned_to)) : 'Atendente não informado';
  const phone = stateRow?.phone || conversation.phone;
  const human = attendance !== 'ai';
  const followupDue = stateRow?.followup_due_at || conversation.followup_due_at;
  const actions = <>
    <div className="crm-ia-native-chat-status"><span className={`crm-ia-chat-attendance is-${attendance}`} title="Situação do atendimento">{attendance === 'human' ? 'Atendimento humano' : attendance === 'ai' ? 'IA atende' : attendanceName(attendance)}</span>
    {(followupDue || attendance === 'followup') && <span className="crm-ia-chat-followup" title={followupDue ? `Follow-up previsto para ${dateTime(followupDue)}` : 'Follow-up'}>Follow-up</span>}</div>
    {canManage && <><button type="button" className="crm-ia-attendance-toggle" disabled={busy || !stateRow || !visible} aria-label={human ? 'Humano atende. Devolver para a IA' : 'IA atende. Assumir humano'} onClick={() => state(human ? 'ai' : 'human')}>{human ? <UserCheck size={16} aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}{human ? 'Humano atende' : 'IA atende'}<ArrowLeftRight size={14} aria-hidden="true" /></button><button type="button" className="crm-ia-resolve-conversation" aria-label="Resolver conversa" disabled={busy || !stateRow || !visible || attendance === 'resolved'} onClick={() => state('resolved')}><Check size={16} aria-hidden="true" />Resolver</button></>}
    <div className="crm-ia-native-chat-extra-actions">{onQueue && <button type="button" className="wa-head-icon" aria-label="Mensagens agendadas" title="Mensagens agendadas" aria-haspopup="dialog" onClick={onQueue}><CalendarClock size={17} aria-hidden="true" /></button>}
    <details className="crm-ia-chat-action-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label="Mais ações da conversa" title="Mais ações da conversa"><MoreHorizontal size={18} aria-hidden="true" /></summary><div>
      <p>{channelName} · Atendente da conversa: {attendant}</p>
      <AtendimentoWaitTimeBadge conversation={visible ? { id: `${scope.contact_id}:${scope.channel_id}`, awaiting_response_since: stateRow?.awaiting_since || conversation.awaiting_since, status: attendance === 'resolved' ? 'resolvido' : 'aguardando' } : null} variant="header" />
      {canManage && <><button type="button" disabled={busy || !stateRow || !visible} onClick={() => state('human')}><UserCheck size={16} aria-hidden="true" />Assumir humano</button><button type="button" disabled={busy || !stateRow || !visible} onClick={() => state('ai')}><Bot size={16} aria-hidden="true" />Devolver à IA</button></>}
      {workspace.channels.length > 1 && <p>A pausa humana vale para este contato em todos os canais. O envio usa o canal indicado no cabeçalho.</p>}
    </div></details></div>
  </>;
  return <section className="crm-ia-card crm-ia-chat wa-atendimento" aria-label="Conversa selecionada">
    <header className={`wa-chat-header crm-ia-native-chat-header${embedded ? ' is-embedded' : ''}`}>
      {embedded ? <><div className="crm-ia-native-chat-identity"><h2 className="wa-chat-header-name">Conversa</h2><p className="wa-chat-header-meta">{channelName}</p></div><div className="wa-head-actions crm-ia-native-chat-actions">{actions}</div></> : <><div className="crm-ia-chat-avatar-row">{backButton}<Avatar className="crm-ia-chat-avatar">{avatarUrl && <AvatarImage src={avatarUrl} alt="" />}<AvatarFallback>{Array.from(displayName)[0]}</AvatarFallback></Avatar></div><CrmIaConversationContext key={`${scope.contact_id}:${scope.channel_id}:${canManage}`} {...{ api, mutate, scope, workspace, revision, canManage, profile, displayName, phone, channelName, attendant }} enabled={visible}>{actions}</CrmIaConversationContext></>}
    </header>
    <div className="crm-ia-chat-scroll wa-thread" ref={historyScroll} tabIndex={-1} role="region" aria-label="Histórico de mensagens" onScroll={event => { const el = event.currentTarget; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
    {error && <p className="crm-ia-error" role="alert">{error}</p>}
    <CrmIaState read={messages} retry={() => setReload(value => value + 1)} empty={messageRows.length === 0 && 'Nenhuma mensagem disponível neste canal.'}>
    {messageRows.length < (messages.data?.total || 0) && <div className="crm-ia-history-load"><button type="button" disabled={olderBusy || !visible} onClick={loadOlder}>{olderBusy ? 'Carregando mensagens antigas…' : 'Carregar mensagens antigas'}</button>{olderError && <p className="crm-ia-error" role="alert">{olderError}</p>}</div>}
    <ol className="crm-ia-chat-messages">{messageRows.map(message => { const sender = conversationMessageSender(message, displayName); return <li key={`${message.from_me ? 'sent' : 'inbox'}:${message.id}`} className={`wa-row ${message.from_me ? 'out' : 'in'}`}>
      {sender.kind === 'ai' ? <CrmIaAvatar className="crm-ia-message-avatar" /> : <Avatar className="crm-ia-message-avatar">{sender.avatar && <AvatarImage src={sender.avatar} alt="" />}<AvatarFallback>{Array.from(sender.label || '?')[0]}</AvatarFallback></Avatar>}
      <div className="wa-bubble-wrap"><div className={`wa-bubble ${message.from_me ? 'out' : 'in'}`}>
      <p className="wa-bubble-text">{message.body || (message.media_type ? `Mensagem de ${message.media_type}` : 'Sem texto')}</p><span className="wa-bubble-meta"><time className="wa-bubble-time" dateTime={message.created_at} title={dateTime(message.created_at)}>{dateTime(message.created_at).split(', ')[1] || '—'}</time></span>
      <CrmIaMessageMedia {...{ api, scope, message }} />{message.transcription?.status === 'ready' && <details className="crm-ia-bubble-transcript"><summary>Transcrição automática</summary><p>{message.transcription.text}</p></details>}{message.transcription?.status === 'failed' && <small>Não foi possível transcrever este áudio.</small>}{message.voice_synthetic && <small>Voz gerada por IA.</small>}
      <CrmIaAiMessageFlag key={`${message.id}:${message.my_flag?.updated_at || ''}`} {...{ message, scope, mutate }} onSaved={() => setReload(value => value + 1)} />
    </div><div className={`crm-ia-message-sender is-${sender.kind}`}><strong>{sender.label}</strong></div></div></li>; })}</ol></CrmIaState>
    </div>{receipt && <p className="crm-ia-success" role="status">{receipt.status === 'sent' ? 'Envio confirmado pelo serviço.' : 'Mensagem registrada na fila de envio.'}</p>}
    {canSend ? <form className="crm-ia-message-composer" onSubmit={event => { event.preventDefault(); void send().catch(() => {}); }}><AtendimentoComposer value={body} onChange={setBody} onSend={() => send().catch(() => {})} onSendMedia={sendMedia} sending={busy} disabled={!canSend || !visible} conversationId={`${scope.contact_id}:${scope.channel_id}`} hideNotes messageLabel="Mensagem ao contato" maxLength={4000} maxMediaBytes={ATENDIMENTO_MEDIA_MAX_BYTES} />{quickReplies.length > 0 && <div className="crm-ia-quick-replies" role="group" aria-label="Respostas rápidas">{quickReplies.map(reply => <button type="button" key={reply.shortcut} aria-label={`Inserir /${reply.shortcut.replace(/^\//, '')}`} onClick={() => setBody(reply.text)}><strong>/{reply.shortcut.replace(/^\//, '')}</strong><span>{reply.text}</span></button>)}</div>}<div className="crm-ia-toolbar"><span className="crm-ia-muted">Texto, áudio e anexos até 4 MB.</span><button type="button" disabled={busy || !body.trim()} aria-expanded={scheduleMenu} onClick={() => { setScheduleNow(new Date()); setScheduleMenu(value => !value); }}>Agendar para</button><button type="button" disabled={busy || !body.trim()} onClick={() => { setWhen(''); setScheduleMenu(false); setSchedule(true); }}>Programar mensagem</button></div>{scheduleMenu && <div className="crm-ia-schedule-presets" role="group" aria-label="Atalhos de agendamento"><p className="crm-ia-muted">Ao selecionar um horário, a mensagem entra diretamente na fila. Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>{conversationSchedulePresets(scheduleNow).map(preset => <button type="button" key={preset.id} disabled={busy || preset.disabled || !body.trim()} onClick={async () => {
      try { await send(futureConversationSchedule(preset.scheduled_at)); setScheduleMenu(false); }
      catch (failure) { setError(failure.message); }
    }}>{preset.label}</button>)}</div>}</form> : <p className="crm-ia-muted">Esta sessão está em modo de consulta.</p>}
    {schedule && canSend && visible && <CrmIaEditor title="Programar mensagem" description="Confira o texto, o canal e a data antes de confirmar." onClose={() => setSchedule(false)} saveLabel="Confirmar agendamento" onSave={async () => {
      await send(futureConversationSchedule(when));
    }}><p className="crm-ia-prose">{body}</p><CrmIaField label="Data e hora do envio" type="datetime-local" value={when} onChange={setWhen} required /><p className="crm-ia-muted">Fuso deste navegador: {Intl.DateTimeFormat().resolvedOptions().timeZone}. O canal selecionado será preservado.</p></CrmIaEditor>}
  </section>;
}
