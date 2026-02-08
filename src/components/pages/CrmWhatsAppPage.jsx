import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  MessageSquare,
  Phone,
  Send,
  Loader2,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function parseInboxRow(row) {
  const phoneFromJid = row.from_jid && row.from_jid !== 'unknown'
    ? String(row.from_jid).replace(/@.*$/, '').trim()
    : '';
  const phoneRaw = (row.phone && String(row.phone).trim()) || phoneFromJid;
  const phone = phoneRaw && phoneRaw !== 'unknown' ? phoneRaw : (phoneFromJid || '');
  const nameRaw = row.sender_name || phone || '';
  const name = (nameRaw && nameRaw !== 'unknown') ? nameRaw : (phone || 'Sem nome');
  return {
    id: row.id,
    from_jid: row.from_jid,
    phone,
    name,
    lastMessage: row.body || '',
    timestamp: row.msg_timestamp || row.created_at,
    isGroup: row.is_group || false,
    groupName: row.group_name || null,
    profilePicUrl: row.profile_pic_url || null,
  };
}

const CrmWhatsAppPage = ({ embeddedInCrm, initialFromJid, onInitialChatSelected }) => {
  const { toast } = useToast();
  const {
    effectiveClienteId,
    config,
    loading: configLoading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig();

  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef(null);
  const listRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!effectiveClienteId) return;
    setListLoading(true);
    const [inboxRes, sentRes] = await Promise.all([
      supabase
        .from('cliente_whatsapp_inbox')
        .select('id, from_jid, sender_name, body, msg_timestamp, created_at, is_group, group_name, phone, profile_pic_url')
        .eq('cliente_id', effectiveClienteId)
        .order('created_at', { ascending: false }),
      supabase
        .from('cliente_whatsapp_sent')
        .select('to_jid, body, created_at')
        .eq('cliente_id', effectiveClienteId)
        .order('created_at', { ascending: false }),
    ]);
    setListLoading(false);
    const byJid = new Map();
    (inboxRes.data || []).forEach((row) => {
      const jid = row.from_jid;
      if (!byJid.has(jid)) byJid.set(jid, parseInboxRow(row));
    });
    (sentRes.data || []).forEach((row) => {
      const jid = row.to_jid;
      if (!byJid.has(jid)) {
        byJid.set(jid, {
          id: `sent-${jid}`,
          from_jid: jid,
          phone: String(jid).replace(/@.*$/, ''),
          name: String(jid).replace(/@.*$/, ''),
          lastMessage: row.body || '',
          timestamp: row.created_at,
          isGroup: false,
          groupName: null,
          profilePicUrl: null,
        });
      }
    });
    setConversations(Array.from(byJid.values()));
  }, [effectiveClienteId]);

  const loadThread = useCallback(async (jid) => {
    if (!effectiveClienteId || !jid) {
      setThreadMessages([]);
      return;
    }
    setThreadLoading(true);
    const [inboxRes, sentRes] = await Promise.all([
      supabase
        .from('cliente_whatsapp_inbox')
        .select('id, from_jid, body, msg_timestamp, created_at')
        .eq('cliente_id', effectiveClienteId)
        .eq('from_jid', jid)
        .order('created_at', { ascending: true }),
      supabase
        .from('cliente_whatsapp_sent')
        .select('id, to_jid, body, created_at')
        .eq('cliente_id', effectiveClienteId)
        .eq('to_jid', jid)
        .order('created_at', { ascending: true }),
    ]);
    const incoming = (inboxRes.data || []).map((r) => ({
      id: r.id,
      direction: 'in',
      body: r.body,
      at: r.msg_timestamp || r.created_at,
    }));
    const outgoing = (sentRes.data || []).map((r) => ({
      id: r.id,
      direction: 'out',
      body: r.body,
      at: r.created_at,
    }));
    const merged = [...incoming, ...outgoing].sort(
      (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
    );
    setThreadMessages(merged);
    setThreadLoading(false);
  }, [effectiveClienteId]);

  useEffect(() => {
    if (effectiveClienteId) loadConversations();
    else setConversations([]);
  }, [effectiveClienteId, loadConversations]);

  useEffect(() => {
    if (selectedChat?.from_jid) loadThread(selectedChat.from_jid);
    else setThreadMessages([]);
  }, [selectedChat?.from_jid, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  useEffect(() => {
    if (!initialFromJid || !onInitialChatSelected) return;
    const found = conversations.find((c) => c.from_jid === initialFromJid);
    if (found) {
      setSelectedChat(found);
      onInitialChatSelected();
      return;
    }
    const fallback = {
      id: `initial-${initialFromJid}`,
      from_jid: initialFromJid,
      phone: String(initialFromJid).replace(/@.*$/, ''),
      name: initialFromJid,
      lastMessage: '',
      timestamp: null,
      isGroup: false,
      groupName: null,
      profilePicUrl: null,
    };
    setSelectedChat(fallback);
    onInitialChatSelected();
  }, [initialFromJid, onInitialChatSelected, conversations]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    const ch = supabase
      .channel(`whatsapp-crm:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_inbox', filter: `cliente_id=eq.${effectiveClienteId}` },
        () => loadConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_sent', filter: `cliente_id=eq.${effectiveClienteId}` },
        () => {
          loadConversations();
          if (selectedChat?.from_jid) loadThread(selectedChat.from_jid);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [effectiveClienteId, selectedChat?.from_jid, loadConversations, loadThread]);

  const handleSend = useCallback(async () => {
    const text = (inputText || '').trim();
    if (!text || !selectedChat?.from_jid || sending || !effectiveClienteId) return;
    setSending(true);
    setInputText('');
    try {
      const { data, error } = await supabase.functions.invoke('uazapi-send-message', {
        body: { to: selectedChat.from_jid, body: text },
      });
      if (error) throw error;
      if (data?.error) {
        const e = new Error(data.error);
        if (data.details) e.details = data.details;
        throw e;
      }
      await loadThread(selectedChat.from_jid);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: err.message || 'Tente novamente.',
      });
      if (err.details) console.warn('[WhatsApp enviar] Resposta da API:', err.details);
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, selectedChat, sending, effectiveClienteId, toast]);

  if (!effectiveClienteId && !isAdminWithoutCliente) {
    return (
      <div className="p-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">Nenhum cliente associado.</p>
      </div>
    );
  }
  if (!config?.subdomain || !config?.token) {
    return (
      <div className="p-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Configure a API e conecte o WhatsApp nas abas API e Canais para usar o chat.
        </p>
      </div>
    );
  }

  const showList = !selectedChat;
  const showThread = !!selectedChat;

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${!embeddedInCrm ? 'p-4 md:p-6 max-w-4xl mx-auto' : ''}`}>
      {!embeddedInCrm && (
        <div className="mb-4">
          <h1 className="text-xl font-semibold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Receba e envie mensagens. Selecione uma conversa e digite para responder.
          </p>
        </div>
      )}

      {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cliente</CardTitle>
            <CardDescription>Selecione o cliente</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientesForAdmin.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.empresa || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-1 min-h-0 border rounded-lg bg-card overflow-hidden flex-col md:flex-row">
        {/* Lista de conversas */}
        <div
          ref={listRef}
          className={`border-b md:border-b-0 md:border-r bg-muted/30 flex flex-col w-full md:w-80 shrink-0 ${showList ? 'flex' : 'hidden md:flex'}`}
        >
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-sm font-medium">Conversas</span>
            <Button variant="ghost" size="sm" onClick={loadConversations} disabled={listLoading || configLoading}>
              {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </Button>
          </div>
          <ul className="flex-1 overflow-y-auto min-h-0">
            {listLoading && conversations.length === 0 ? (
              <li className="p-4 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Carregando…
              </li>
            ) : conversations.length === 0 ? (
              <li className="p-4 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Nenhuma conversa. Mensagens recebidas ou enviadas aparecem aqui.
              </li>
            ) : (
              conversations.map((chat) => (
                <li key={chat.from_jid || chat.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedChat(chat)}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 rounded-lg transition-colors ${selectedChat?.from_jid === chat.from_jid ? 'bg-muted' : ''}`}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={chat.profilePicUrl || undefined} alt="" />
                      <AvatarFallback>{(chat.name || chat.phone || '?').toString().charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-sm truncate">{chat.name}</span>
                        {chat.timestamp && (
                          <span className="text-xs text-muted-foreground shrink-0">{formatTime(chat.timestamp)}</span>
                        )}
                      </div>
                      {chat.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{chat.lastMessage}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${showThread ? 'flex' : 'hidden md:flex'}`}>
          {selectedChat ? (
            <>
              <div className="p-2 border-b flex items-center gap-2 bg-muted/30">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedChat(null)}
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={selectedChat.profilePicUrl || undefined} alt="" />
                  <AvatarFallback>{(selectedChat.name || selectedChat.phone || '?').toString().charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{selectedChat.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedChat.phone ? (selectedChat.phone.startsWith('+') ? selectedChat.phone : `+${selectedChat.phone}`) : selectedChat.from_jid}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {threadLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  threadMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.direction === 'out'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.body}
                      </div>
                    </div>
                  ))
                )}
                <div ref={threadEndRef} />
              </div>
              <div className="p-2 border-t flex gap-2">
                <Input
                  placeholder="Digite uma mensagem..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSend} disabled={sending || !inputText.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Selecione uma conversa para enviar mensagens.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrmWhatsAppPage;
