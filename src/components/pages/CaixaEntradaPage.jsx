import React, { useState, useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Inbox, Loader2, MessageSquare, Phone, RefreshCw, Trash2 } from 'lucide-react';

const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente';
  return '/client-area';
};

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
  const phone = (phoneRaw && phoneRaw !== 'unknown' ? phoneRaw : phoneFromJid) || '';
  const nameRaw = row.sender_name || phone || '';
  const name = (nameRaw && nameRaw !== 'unknown') ? nameRaw : (phone ? `+${phone.replace(/^\+/, '')}` : 'Sem nome');
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

const CaixaEntradaPage = ({ embeddedInCrm }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const prefix = getRoutePrefix(profile);
  const {
    effectiveClienteId,
    config,
    loading: configLoading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingJid, setDeletingJid] = useState(null);

  const loadInboxFromSupabase = useCallback(async () => {
    if (!effectiveClienteId) return;
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('cliente_whatsapp_inbox')
      .select('id, from_jid, sender_name, body, msg_timestamp, created_at, is_group, group_name, phone, profile_pic_url')
      .eq('cliente_id', effectiveClienteId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: error.message });
      setChats([]);
      return;
    }
    const byJid = new Map();
    (rows || []).forEach((row) => {
      const jid = row.from_jid;
      if (!byJid.has(jid)) byJid.set(jid, parseInboxRow(row));
    });
    setChats(Array.from(byJid.values()));
  }, [effectiveClienteId, toast]);

  useEffect(() => {
    if (effectiveClienteId) loadInboxFromSupabase();
    else setChats([]);
  }, [effectiveClienteId, loadInboxFromSupabase]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    const channel = supabase
      .channel(`inbox:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_inbox', filter: `cliente_id=eq.${effectiveClienteId}` },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          setChats((prev) => {
            const byJid = new Map(prev.map((c) => [c.from_jid, c]));
            byJid.set(row.from_jid, parseInboxRow(row));
            return Array.from(byJid.values());
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveClienteId]);

  const fetchChats = loadInboxFromSupabase;

  const deleteConversation = useCallback(
    async (chat) => {
      if (!effectiveClienteId || !chat?.from_jid) return;
      const nome = chat.name || chat.phone || chat.from_jid;
      if (!window.confirm(`Apagar toda a conversa com "${nome}"? As mensagens serão removidas da caixa de entrada.`)) return;
      setDeletingJid(chat.from_jid);
      const { error } = await supabase
        .from('cliente_whatsapp_inbox')
        .delete()
        .eq('cliente_id', effectiveClienteId)
        .eq('from_jid', chat.from_jid);
      setDeletingJid(null);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao apagar', description: error.message });
        return;
      }
      setChats((prev) => prev.filter((c) => c.from_jid !== chat.from_jid));
      toast({ title: 'Conversa apagada' });
    },
    [effectiveClienteId, toast]
  );

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
          Configure a API e conecte o WhatsApp nas abas API e Canais para ver a caixa de entrada.
        </p>
      </div>
    );
  }

  return (
    <>
      {!embeddedInCrm && <Helmet title="Caixa de entrada - CRM" />}
      <div className={`space-y-4 ${!embeddedInCrm ? 'p-4 md:p-6 max-w-2xl mx-auto' : ''}`}>
        {!embeddedInCrm && (
          <div>
            <h1 className="text-xl font-semibold">Caixa de entrada</h1>
            <p className="text-sm text-muted-foreground">
              Conversas recebidas no WhatsApp conectado. Clique para ver o contato como lead.
            </p>
          </div>
        )}

        {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
          <Card>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4" />
                Conversas
              </CardTitle>
              <CardDescription>
                Mensagens recebidas via webhook uazapi. Configure o webhook na aba Canais.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchChats} disabled={loading || configLoading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando…
              </div>
            ) : loading && chats.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Buscando conversas…
              </div>
            ) : chats.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nenhuma conversa no momento.</p>
                <p className="mt-1">Conecte o WhatsApp na aba Canais e configure a URL do webhook. Novas mensagens aparecem aqui em tempo real.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {chats.map((chat) => (
                  <li key={chat.from_jid || chat.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={chat.profilePicUrl || undefined} alt="" />
                      <AvatarFallback>
                        {(chat.name || chat.phone || '?').toString().charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{chat.name}</span>
                        {chat.timestamp && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatTime(chat.timestamp)}
                          </span>
                        )}
                        {chat.isGroup && chat.groupName && (
                          <span className="text-xs text-muted-foreground shrink-0">· {chat.groupName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <Phone className="h-3 w-3 shrink-0" />
                          {chat.phone ? (chat.phone.startsWith('+') ? chat.phone : `+${chat.phone}`) : 'Número indisponível'}
                        </span>
                        {chat.lastMessage && (
                          <span className="truncate block mt-0.5">{chat.lastMessage}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      title="Apagar conversa"
                      disabled={deletingJid === chat.from_jid}
                      onClick={() => deleteConversation(chat)}
                    >
                      {deletingJid === chat.from_jid ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default CaixaEntradaPage;
