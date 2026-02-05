import React, { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Loader2, QrCode, Phone, User, Link2, Copy, Activity, CheckCircle2, Clock, Radio } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';

const QR_REFRESH_SECONDS = 45;

function formatLastEventAgo(dateStr) {
  if (!dateStr) return '';
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
  return `há ${Math.floor(sec / 3600)} h`;
}

function parseChannelData(data) {
  if (!data) return null;
  const connected = data.connected === true || data.status?.loggedIn === true || data.instance?.status === 'connected';
  if (!connected) return null;
  const jid = data.jid ?? data.instance?.jid ?? data.status?.jid;
  const number = jid ? String(jid).replace(/@.*$/, '').trim() || null : null;
  const profileName = data.instance?.profileName ?? data.profileName ?? data.profile?.name ?? '';
  const profilePicUrl = data.instance?.profilePicUrl ?? data.profilePicUrl ?? data.profile?.pic ?? '';
  const instanceName = data.instance?.name ?? data.instanceName ?? '';
  return { number, profileName: profileName || null, profilePicUrl: profilePicUrl || null, instanceName: instanceName || null };
}

function formatPhoneDisplay(num) {
  if (!num) return '';
  const s = String(num).replace(/\D/g, '');
  if (s.length === 13 && s.startsWith('55')) return `+55 (${s.slice(2, 4)}) ${s.slice(4, 9)}-${s.slice(9)}`;
  if (s.length >= 10) return `+${s}`;
  return num;
}

const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente';
  return '/client-area';
};

const ClienteCanaisPage = ({ onGoToApi, embeddedInCrm }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const prefix = getRoutePrefix(profile);
  const {
    effectiveClienteId,
    config,
    loading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
    updateInstanceStatus,
    generateWebhookSecret,
    setUseSse,
  } = useClienteWhatsAppConfig();

  const [connecting, setConnecting] = useState(false);
  const [connectResponse, setConnectResponse] = useState(null);
  const [qrImageSrc, setQrImageSrc] = useState(null);
  const [channelData, setChannelData] = useState(null);
  const [webhookGenerating, setWebhookGenerating] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookConfiguring, setWebhookConfiguring] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [webhookLogViewing, setWebhookLogViewing] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseEventCount, setSseEventCount] = useState(0);
  const [sseConnectionState, setSseConnectionState] = useState('idle');
  const [sseEventLog, setSseEventLog] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const qrRefreshIntervalRef = useRef(null);
  const sseRef = useRef(null);
  const sseFirstEventToastRef = useRef(false);

  const parseAndSetQr = (data, setQr) => {
    const qr =
      data?.instance?.qrcode ??
      data?.qrcode ??
      data?.qr_code ??
      data?.qr ??
      data?.data ??
      (typeof data?.base64 === 'string' ? data.base64 : null);
    if (typeof qr === 'string') {
      if (/^data:image\//i.test(qr)) setQr(qr);
      else if (/^https?:\/\//i.test(qr)) setQr(qr);
      else setQr(`data:image/png;base64,${qr}`);
    }
  };

  useEffect(() => {
    return () => {
      if (qrRefreshIntervalRef.current) clearInterval(qrRefreshIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!effectiveClienteId) return;
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('cliente_whatsapp_webhook_log')
        .select('id, created_at, status, from_jid, type, body_preview, error_message, raw_payload')
        .eq('cliente_id', effectiveClienteId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (data) setWebhookLogs(data);
    };
    fetchLogs();
    const channel = supabase
      .channel(`webhook-log:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_webhook_log', filter: `cliente_id=eq.${effectiveClienteId}` },
        (payload) => {
          const row = payload.new;
          setWebhookLogs((prev) => [{ ...row }, ...prev].slice(0, 50));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveClienteId]);

  useEffect(() => {
    if (webhookLogs.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [webhookLogs.length]);

  useEffect(() => {
    if (!config?.use_sse || !config?.subdomain?.trim() || !config?.token?.trim() || !effectiveClienteId) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
        setSseConnected(false);
        setSseConnectionState('idle');
      }
      return;
    }
    setSseConnectionState('connecting');
    setSseEventCount(0);
    setSseEventLog([]);
    const baseUrl = `https://${config.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
    const token = encodeURIComponent(config.token.trim());
    const sseUrl = `${baseUrl}/sse?token=${token}`;
    console.log('[SSE uazapi] Conectando:', sseUrl);
    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
      setSseConnectionState('connected');
      console.log('[SSE uazapi] Conexão aberta. Envie uma mensagem no WhatsApp e veja aqui se chega algum evento.');
    };
    es.onerror = () => {
      setSseConnected(false);
      setSseConnectionState('error');
      console.warn('[SSE uazapi] Erro ou stream fechado. Confira em docs.uazapi.com se o path do SSE é /sse ou outro (ex.: /instance/sse).');
    };

    const handleEvent = async (event) => {
      const eventType = event.type || 'message';
      const dataStr = event.data;
      console.log('[SSE uazapi] Evento recebido:', eventType, dataStr?.slice?.(0, 300) ?? dataStr);
      setSseEventLog((prev) => [
        {
          id: `ev-${Date.now()}-${prev.length}`,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          from_jid: null,
          phone: null,
          bodyPreview: `[${eventType}] ${(dataStr && String(dataStr).slice(0, 50)) || '—'}`,
          eventType,
        },
        ...prev,
      ].slice(0, 30));

      try {
        const data = dataStr ? JSON.parse(dataStr) : {};
        const payload = data.data ?? data.payload ?? data;
        const raw = typeof payload === 'object' && payload !== null ? payload : { body: payload };
        const row = normalizeUazapiPayload(raw);
        if (!row.from_jid || row.from_jid === 'unknown') return;
        await supabase.from('cliente_whatsapp_inbox').upsert(
          {
            cliente_id: effectiveClienteId,
            message_id: row.message_id,
            from_jid: row.from_jid,
            sender_name: row.sender_name,
            msg_timestamp: row.msg_timestamp,
            type: row.type || 'text',
            body: row.body,
            phone: row.phone,
            profile_pic_url: row.profile_pic_url,
            is_group: row.is_group,
            group_name: row.group_name,
            raw_payload: raw,
          },
          { onConflict: 'cliente_id,message_id' }
        );
        setSseEventCount((c) => c + 1);
        setSseEventLog((prev) => [
          {
            id: `${Date.now()}-${row.message_id}`,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            from_jid: row.from_jid,
            phone: row.phone,
            bodyPreview: (row.body || '').slice(0, 60) || `[${eventType}]`,
            eventType,
          },
          ...prev,
        ].slice(0, 30));
        if (!sseFirstEventToastRef.current) {
          sseFirstEventToastRef.current = true;
          toast({ title: 'SSE ativo', description: 'Primeira mensagem recebida via SSE. Veja na Caixa de entrada.' });
        }
      } catch (err) {
        console.warn('[SSE uazapi] Erro ao processar evento:', err);
      }
    };

    es.addEventListener('message', handleEvent);
    es.addEventListener('messages', handleEvent);
    es.addEventListener('notification', handleEvent);
    es.addEventListener('event', handleEvent);

    return () => {
      es.removeEventListener('message', handleEvent);
      es.removeEventListener('messages', handleEvent);
      es.removeEventListener('notification', handleEvent);
      es.removeEventListener('event', handleEvent);
      es.close();
      sseRef.current = null;
      sseFirstEventToastRef.current = false;
      setSseConnected(false);
      setSseConnectionState('idle');
    };
  }, [config?.use_sse, config?.subdomain, config?.token, effectiveClienteId]);

  useEffect(() => {
    if (!config?.subdomain?.trim() || !config?.token?.trim()) return;
    const baseUrl = `https://${config.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/instance/status`, {
          method: 'GET',
          headers: { token: config.token.trim() },
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        const channel = parseChannelData({ ...data, connected: data?.instance?.status === 'connected' || data?.loggedIn });
        if (channel?.number || channel?.profileName) setChannelData(channel);
      } catch {
        if (!cancelled) {
          const resConnect = await fetch(`${baseUrl}/instance/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: config.token.trim() },
            body: '{}',
          });
          if (cancelled) return;
          const data = await resConnect.json().catch(() => ({}));
          const channel = parseChannelData(data);
          if (channel?.number || channel?.profileName) setChannelData(channel);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [config?.subdomain, config?.token]);

  const fetchConnect = async (isInitial = true) => {
    if (!config?.subdomain?.trim() || !config?.token?.trim()) return null;
    const baseUrl = `https://${config.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
    const url = `${baseUrl}/instance/connect`;
    if (isInitial) {
      setConnecting(true);
      setConnectResponse(null);
      setQrImageSrc(null);
      setChannelData(null);
    }
    try {
      if (isInitial) updateInstanceStatus('connecting');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: config.token.trim(),
        },
        body: '{}',
      });
      const data = await res.json().catch(async () => ({ _raw: await res.text() }));
      const payload = { status: res.status, ok: res.ok, url: `${baseUrl}/instance/connect`, ...data };
      setConnectResponse(payload);
      const channel = parseChannelData(payload);
      if (channel) {
        setChannelData(channel);
        setQrImageSrc(null);
      } else {
        parseAndSetQr(data, setQrImageSrc);
      }
      if (res.ok) updateInstanceStatus('connected');
      else updateInstanceStatus('disconnected');
      return { data, res };
    } catch (err) {
      if (isInitial) {
        const message = err.message || 'Erro de rede ou CORS. Em produção pode ser necessário usar um proxy.';
        toast({ variant: 'destructive', title: 'Erro ao conectar', description: message });
        setConnectResponse({
          error: message,
          url: `${baseUrl}/instance/connect`,
          hint: 'Verifique subdomínio, token e se a API permite requisições do navegador (CORS).',
        });
        updateInstanceStatus('disconnected');
      }
      return null;
    } finally {
      if (isInitial) setConnecting(false);
    }
  };

  const getWebhookUrl = () => {
    if (!effectiveClienteId || !config?.webhook_secret) return '';
    const q = new URLSearchParams({
      cliente_id: effectiveClienteId,
      secret: config.webhook_secret,
    });
    return `${supabaseUrl}/functions/v1/uazapi-inbox-webhook?${q.toString()}`;
  };

  const setWebhookInUazapi = async () => {
    if (!config?.subdomain?.trim() || !config?.token?.trim() || !config?.webhook_secret || !effectiveClienteId) return;
    const baseUrl = `https://${config.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
    const webhookUrl = getWebhookUrl();
    setWebhookConfiguring(true);
    const endpoints = [
      { method: 'POST', path: '/webhook', body: { url: webhookUrl, events: ['messages'], excludeMessages: ['wasSentByApi'] } },
      { method: 'POST', path: '/webhook', body: { webhookUrl, events: ['messages'] } },
      { method: 'PUT', path: '/webhook', body: { url: webhookUrl, enabled: true } },
      { method: 'POST', path: '/instance/webhook', body: { url: webhookUrl } },
    ];
    let lastError = null;
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json', token: config.token.trim() },
          body: JSON.stringify(ep.body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast({ title: 'Webhook configurado na uazapi', description: 'A instância deve passar a enviar eventos. Envie uma mensagem de teste.' });
          setWebhookConfiguring(false);
          return;
        }
        lastError = data?.message || data?.error || `HTTP ${res.status}`;
      } catch (e) {
        lastError = e.message;
      }
    }
    toast({
      variant: 'destructive',
      title: 'Não foi possível configurar pela API',
      description: 'Copie a URL acima e configure manualmente no painel uazapi (Webhooks e SSE). Último erro: ' + (lastError || 'desconhecido'),
    });
    setWebhookConfiguring(false);
  };

  const handleConnectWhatsApp = async () => {
    if (!config?.subdomain?.trim() || !config?.token?.trim()) {
      toast({ variant: 'destructive', title: 'Configure a API', description: 'Subdomínio e token são obrigatórios. Configure na aba API.' });
      return;
    }
    if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = null;
    }
    const result = await fetchConnect(true);
    if (!result) return;
    const { data } = result;
    const instanceStatus = data?.instance?.status ?? data?.status?.connected;
    const isConnecting = instanceStatus === 'connecting' || (data?.connected === false && data?.instance?.qrcode);
    if (isConnecting && (data?.instance?.qrcode ?? data?.qrcode)) {
      qrRefreshIntervalRef.current = setInterval(async () => {
        const next = await fetchConnect(false);
        if (!next) return;
        const nextData = next.data;
        const nextConnected = nextData?.connected === true || nextData?.status?.loggedIn === true;
        if (nextConnected) {
          if (qrRefreshIntervalRef.current) {
            clearInterval(qrRefreshIntervalRef.current);
            qrRefreshIntervalRef.current = null;
          }
          const channel = parseChannelData(nextData);
          if (channel) {
            setChannelData(channel);
            setQrImageSrc(null);
            setConnectResponse((prev) => (prev ? { ...prev, ...nextData } : prev));
          }
          return;
        }
        if (!nextData?.instance?.qrcode && !nextData?.qrcode) return;
        parseAndSetQr(nextData, setQrImageSrc);
      }, QR_REFRESH_SECONDS * 1000);
    }
  };

  if (!effectiveClienteId && !isAdminWithoutCliente) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Você não tem um cliente associado.</p>
      </div>
    );
  }

  if (isAdminWithoutCliente && clientesForAdmin.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Nenhum cliente com login encontrado.</p>
      </div>
    );
  }

  return (
    <>
      {!embeddedInCrm && <Helmet title="Canais - WhatsApp" />}
      <div className={`space-y-6 ${!embeddedInCrm ? 'p-4 md:p-6 max-w-2xl mx-auto' : ''}`}>
        {!embeddedInCrm && (
          <div>
            <h1 className="text-xl font-semibold">Canais</h1>
            <p className="text-sm text-muted-foreground">
              Conecte o WhatsApp usando a API configurada na aba API. O QR code será exibido após solicitar a conexão.
            </p>
          </div>
        )}

        {channelData && (channelData.number || channelData.profileName || channelData.instanceName) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-600" />
                Canal conectado
              </CardTitle>
              <CardDescription>Dados do WhatsApp vinculado a esta instância</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={channelData.profilePicUrl || undefined} alt={channelData.profileName || ''} />
                <AvatarFallback>
                  {channelData.profileName ? channelData.profileName.charAt(0).toUpperCase() : channelData.number ? channelData.number.slice(-2) : '?'}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                {channelData.number && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{formatPhoneDisplay(channelData.number)}</span>
                  </div>
                )}
                {(channelData.profileName || channelData.instanceName) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{[channelData.profileName, channelData.instanceName].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isAdminWithoutCliente && (
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              WhatsApp (uazapi)
            </CardTitle>
            <CardDescription>
              Gera o QR code para vincular a instância WhatsApp. Requer API configurada na aba API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-muted/50 border-muted-foreground/20">
              <AlertDescription className="text-xs">
                Se no celular aparecer &quot;impossível conectar novos números no momento&quot;, é uma limitação temporária do WhatsApp (não do sistema). Tente de novo em algumas horas; no WhatsApp vá em Aparelhos conectados e desvincile um dispositivo se já tiver vários.
              </AlertDescription>
            </Alert>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : !config?.subdomain || !config?.token ? (
              <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>Configure a API na aba API (subdomínio e token) para este cliente.</p>
                {onGoToApi ? (
                  <Button variant="link" className="px-0 mt-2" onClick={onGoToApi}>
                    Ir para aba API
                  </Button>
                ) : (
                  <Button variant="link" className="px-0 mt-2" asChild>
                    <Link to={`${prefix}/crm`}>Ir para CRM (aba API)</Link>
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Button onClick={handleConnectWhatsApp} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Conectando…
                    </>
                  ) : (
                    'Conectar WhatsApp'
                  )}
                </Button>

                {connectResponse && (
                  <div className="space-y-4 pt-4 border-t">
                    <p className="text-sm font-medium text-muted-foreground">Resultado da conexão</p>
                    {qrImageSrc ? (
                      <div className="flex flex-col items-center gap-2">
                        <QrCode className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Escaneie o QR code no WhatsApp</p>
                        <p className="text-xs text-muted-foreground">O QR expira em ~1 minuto. Ele é renovado automaticamente a cada {QR_REFRESH_SECONDS}s até você escanear.</p>
                        <img src={qrImageSrc} alt="QR Code WhatsApp" className="max-w-[240px] h-auto border rounded" />
                      </div>
                    ) : connectResponse.error ? (
                      <p className="text-sm text-destructive">
                        {connectResponse.error}
                        {connectResponse.hint && (
                          <span className="block mt-1 text-muted-foreground font-normal">{connectResponse.hint}</span>
                        )}
                      </p>
                    ) : null}
                    <details className="w-full">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                        Ver log da resposta (status, URL, corpo)
                      </summary>
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48 mt-2">
                        {JSON.stringify(connectResponse, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {config?.subdomain && config?.token && effectiveClienteId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Webhook (Caixa de entrada)
              </CardTitle>
              <CardDescription>
                Configure na uazapi a URL abaixo para receber mensagens na Caixa de entrada. Em docs uazapi: POST /webhook com url, events: [&quot;messages&quot;], excludeMessages: [&quot;wasSentByApi&quot;].
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="use-sse" className="text-sm font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    Usar também SSE (Server-Sent Events)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Conecta ao fluxo da uazapi no navegador e grava mensagens na Caixa de entrada. Útil se o webhook não estiver recebendo.
                  </p>
                  {config.use_sse && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          sseConnectionState === 'connected'
                            ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                            : sseConnectionState === 'connecting'
                              ? 'bg-muted text-muted-foreground'
                              : sseConnectionState === 'error'
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {sseConnectionState === 'connected'
                          ? 'SSE: Conectado'
                          : sseConnectionState === 'connecting'
                            ? 'SSE: Conectando…'
                            : sseConnectionState === 'error'
                              ? 'SSE: Desconectado (verifique docs.uazapi.com)'
                              : 'SSE: Desligado'}
                      </span>
                      {sseEventCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {sseEventCount} evento{sseEventCount !== 1 ? 's' : ''} recebido{sseEventCount !== 1 ? 's' : ''} nesta sessão
                        </span>
                      )}
                      {sseConnectionState === 'connected' && sseEventCount === 0 && (
                        <span className="text-xs text-muted-foreground">
                          Nenhum evento ainda. Abra o console (F12) e envie uma mensagem para o número conectado para ver se a uazapi envia eventos.
                        </span>
                      )}
                    </div>
                  )}
                  {config.use_sse && sseEventLog.length > 0 && (
                    <div className="mt-2 rounded-md border bg-muted/30 max-h-32 overflow-y-auto p-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground sticky top-0 bg-muted/80 py-0.5">Eventos SSE nesta sessão</p>
                      {sseEventLog.map((ev) => (
                        <div key={ev.id} className="text-xs rounded px-2 py-1 bg-background border">
                          <span className="text-muted-foreground shrink-0">{ev.time}</span>
                          {' · '}
                          {ev.phone && <span className="font-mono">{ev.phone}</span>}
                          {ev.from_jid && !ev.phone && <span className="font-mono truncate max-w-[100px] inline-block" title={ev.from_jid}>{ev.from_jid}</span>}
                          {ev.bodyPreview && (
                            <>
                              {' · '}
                              <span className="text-muted-foreground truncate max-w-[180px] inline-block" title={ev.bodyPreview}>{ev.bodyPreview}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Switch
                  id="use-sse"
                  checked={!!config.use_sse}
                  onCheckedChange={(checked) => setUseSse(checked)}
                />
              </div>
              {!config.webhook_secret ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={webhookGenerating}
                  onClick={async () => {
                    setWebhookGenerating(true);
                    await generateWebhookSecret();
                    setWebhookGenerating(false);
                    toast({ title: 'URL gerada', description: 'Copie a URL abaixo e configure na uazapi.' });
                  }}
                >
                  {webhookGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Gerar URL do webhook
                </Button>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <Input
                      readOnly
                      value={getWebhookUrl()}
                      className="font-mono text-xs flex-1 min-w-0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      title="Copiar"
                      onClick={() => {
                        navigator.clipboard.writeText(getWebhookUrl());
                        toast({ title: 'URL copiada' });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={webhookTesting}
                      onClick={async () => {
                        const url = getWebhookUrl();
                        setWebhookTesting(true);
                        try {
                          const res = await fetch(url, { method: 'GET' });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok) {
                            toast({ title: 'URL acessível', description: 'O webhook respondeu. Configure esta URL na uazapi e ative o evento "messages".' });
                          } else if (res.status === 401) {
                            toast({
                              variant: 'destructive',
                              title: '401 - Acesso negado',
                              description: 'A Edge Function está exigindo login. No Supabase: Edge Functions → uazapi-inbox-webhook → Configurações → desative "Enforce JWT" (permitir chamadas anônimas).',
                            });
                          } else {
                            toast({ variant: 'destructive', title: 'Erro', description: data?.error || `Status ${res.status}` });
                          }
                        } catch (e) {
                          toast({ variant: 'destructive', title: 'Falha ao testar', description: e?.message || 'Verifique sua conexão e se a Edge Function está publicada.' });
                        }
                        setWebhookTesting(false);
                      }}
                    >
                      {webhookTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Testar URL
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={webhookConfiguring}
                      onClick={setWebhookInUazapi}
                      title="Registra a URL do webhook na instância uazapi via API (evento messages)"
                    >
                      {webhookConfiguring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Configurar webhook na uazapi
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cole esta URL no painel uazapi ao configurar o webhook. Evento: <code className="bg-muted px-1 rounded">messages</code>. Opcional: excludeMessages = wasSentByApi.
                  </p>
                  <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Canal conectado mas não recebe eventos?</p>
                    <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside space-y-0.5">
                      <li><strong>Clique em &quot;Configurar webhook na uazapi&quot;</strong> para registrar a URL na instância via API (evento messages).</li>
                      <li>Se não funcionar, copie a URL e configure manualmente em docs.uazapi.com → Webhooks e SSE.</li>
                      <li>Use &quot;Testar URL&quot; para confirmar que a Edge Function está no ar.</li>
                      <li>Veja os logs em Supabase → Edge Functions → uazapi-inbox-webhook para saber se algum POST está chegando.</li>
                    </ul>
                  </div>
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Activity className="h-3.5 w-3.5" />
                        Log em tempo real
                      </p>
                      {webhookLogs.length === 0 ? (
                        <span className="text-xs flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Aguardando primeiro evento…
                        </span>
                      ) : webhookLogs[0]?.status === 'error' ? (
                        <span className="text-xs flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          Webhook ativo · Último evento com erro
                          {webhookLogs[0]?.created_at && (
                            <span className="text-muted-foreground font-normal">
                              ({formatLastEventAgo(webhookLogs[0].created_at)})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Webhook recebendo eventos
                          {webhookLogs[0]?.created_at && (
                            <span className="text-muted-foreground font-normal">
                              · Último: {formatLastEventAgo(webhookLogs[0].created_at)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="rounded-md border bg-muted/30 max-h-48 overflow-y-auto p-2 space-y-1.5">
                      {webhookLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Configure a URL na uazapi e envie uma mensagem no WhatsApp para testar a conexão.</p>
                      ) : (
                        webhookLogs.map((log) => (
                          <div key={log.id} className="text-xs rounded px-2 py-1.5 bg-background border">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground shrink-0">
                                {log.created_at ? new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                              </span>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${log.status === 'ok' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-destructive/20 text-destructive'}`}>
                                {log.status}
                              </span>
                              {log.from_jid && <span className="font-mono truncate max-w-[120px]" title={log.from_jid}>{log.from_jid}</span>}
                              {log.type && <span className="text-muted-foreground">{log.type}</span>}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[10px] shrink-0"
                                onClick={() => setWebhookLogViewing(log)}
                              >
                                Ver corpo
                              </Button>
                            </div>
                            {(log.body_preview || log.error_message) && (
                              <p className="mt-1 text-muted-foreground truncate max-w-full" title={log.body_preview || log.error_message}>
                                {log.error_message || log.body_preview}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={!!webhookLogViewing} onOpenChange={(open) => !open && setWebhookLogViewing(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Corpo recebido pelo webhook</DialogTitle>
              {webhookLogViewing && (
                <p className="text-xs text-muted-foreground">
                  {webhookLogViewing.created_at && new Date(webhookLogViewing.created_at).toLocaleString('pt-BR')}
                  {webhookLogViewing.from_jid && ` · ${webhookLogViewing.from_jid}`}
                </p>
              )}
            </DialogHeader>
            <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-3 min-h-[200px]">
              {webhookLogViewing?.raw_payload != null ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                  {typeof webhookLogViewing.raw_payload === 'object'
                    ? JSON.stringify(webhookLogViewing.raw_payload, null, 2)
                    : String(webhookLogViewing.raw_payload)}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Nenhum corpo completo salvo para este evento.</p>
                  {webhookLogViewing?.body_keys && webhookLogViewing.body_keys.length > 0 && (
                    <p className="mt-2">
                      Chaves recebidas na requisição: <code className="bg-muted px-1 rounded">{Array.isArray(webhookLogViewing.body_keys) ? webhookLogViewing.body_keys.join(', ') : String(webhookLogViewing.body_keys)}</code>
                    </p>
                  )}
                  <p className="text-xs mt-2 border-t pt-2">
                    Para passar a ver o JSON completo: (1) rode a migration que adiciona a coluna <code>raw_payload</code>; (2) publique de novo a Edge Function <strong>uazapi-inbox-webhook</strong> no Supabase; (3) envie uma nova mensagem no WhatsApp e abra &quot;Ver corpo&quot; no evento novo.
                  </p>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ClienteCanaisPage;
