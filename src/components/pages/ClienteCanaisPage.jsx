import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Loader2, QrCode, Phone, User, Link2, Copy, Activity, CheckCircle2, Clock, Radio, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import { extractPhoneAndNameFromRawPayload, getFromJidFromRawPayload, buildContactTrackingFromRawPayload, getProfilePicFromRawPayload } from '@/lib/contactFromWebhookPayload';

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
    configs,
    loading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
    updateInstanceStatus,
    generateWebhookSecret,
    setUseSse,
    addConfig,
    deleteConfig,
  } = useClienteWhatsAppConfig();

  const [channelDataByConfigId, setChannelDataByConfigId] = useState({});
  const [connectResponseByConfigId, setConnectResponseByConfigId] = useState({});
  const [qrImageSrcByConfigId, setQrImageSrcByConfigId] = useState({});
  const [connectingConfigId, setConnectingConfigId] = useState(null);
  const [pullingConfigId, setPullingConfigId] = useState(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookConfiguring, setWebhookConfiguring] = useState(false);
  const [uazapiWebhookLogs, setUazapiWebhookLogs] = useState([]);
  const [apicebotWebhookLogs, setApicebotWebhookLogs] = useState([]);
  const [uazapiLogsLoadingMore, setUazapiLogsLoadingMore] = useState(false);
  const [uazapiLogsRefreshing, setUazapiLogsRefreshing] = useState(false);
  const [webhookLogViewing, setWebhookLogViewing] = useState(null);
  const [importContactLoading, setImportContactLoading] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseEventCount, setSseEventCount] = useState(0);
  const [sseConnectionState, setSseConnectionState] = useState('idle');
  const [sseEventLog, setSseEventLog] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [addChannelName, setAddChannelName] = useState('');
  const [addChannelSubdomain, setAddChannelSubdomain] = useState('');
  const [addChannelToken, setAddChannelToken] = useState('');
  const [addChannelSaving, setAddChannelSaving] = useState(false);
  const qrRefreshIntervalRef = useRef(null);
  const qrRefreshConfigIdRef = useRef(null);
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

  const fetchWebhookLogs = useCallback(async () => {
    if (!effectiveClienteId) return;
    const [
      { data: uazapiData },
      { data: apicebotData },
    ] = await Promise.all([
      supabase
        .from('cliente_whatsapp_webhook_log')
        .select('id, created_at, status, source, from_jid, type, body_preview, error_message, raw_payload, body_keys')
        .eq('cliente_id', effectiveClienteId)
        .or('source.neq.apicebot,source.is.null')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('cliente_whatsapp_webhook_log')
        .select('id, created_at, status, source, from_jid, type, body_preview, error_message, raw_payload, body_keys')
        .eq('cliente_id', effectiveClienteId)
        .eq('source', 'apicebot')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (uazapiData) setUazapiWebhookLogs(uazapiData);
    if (apicebotData) setApicebotWebhookLogs(apicebotData);
  }, [effectiveClienteId]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    fetchWebhookLogs();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchWebhookLogs();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const channel = supabase
      .channel(`webhook-log:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_webhook_log', filter: `cliente_id=eq.${effectiveClienteId}` },
        (payload) => {
          const row = { ...payload.new };
          const isApicebot = (row.source || '').toLowerCase() === 'apicebot';
          if (isApicebot) {
            setApicebotWebhookLogs((prev) => [row, ...prev].slice(0, 100));
          } else {
            setUazapiWebhookLogs((prev) => [row, ...prev].slice(0, 100));
          }
        }
      )
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [effectiveClienteId, fetchWebhookLogs]);

  const loadMoreUazapiLogs = useCallback(async () => {
    if (!effectiveClienteId || uazapiWebhookLogs.length === 0) return;
    const oldest = uazapiWebhookLogs[uazapiWebhookLogs.length - 1]?.created_at;
    if (!oldest) return;
    setUazapiLogsLoadingMore(true);
    const { data } = await supabase
      .from('cliente_whatsapp_webhook_log')
      .select('id, created_at, status, source, from_jid, type, body_preview, error_message, raw_payload, body_keys')
      .eq('cliente_id', effectiveClienteId)
      .or('source.neq.apicebot,source.is.null')
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(100);
    setUazapiLogsLoadingMore(false);
    if (data?.length) setUazapiWebhookLogs((prev) => [...prev, ...data]);
  }, [effectiveClienteId, uazapiWebhookLogs]);

  useEffect(() => {
    if (uazapiWebhookLogs.length === 0 && apicebotWebhookLogs.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [uazapiWebhookLogs.length, apicebotWebhookLogs.length]);

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
    const baseUrl = `https://${config.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
    const token = encodeURIComponent(config.token.trim());
    const ssePaths = ['/instance/sse', '/sse'];
    let pathIndex = 0;
    let cancelled = false;
    let currentCleanup = null;

    const connect = () => {
      if (cancelled) return;
      setSseConnectionState('connecting');
      if (pathIndex === 0) {
        setSseEventCount(0);
        setSseEventLog([]);
      }
      const path = ssePaths[pathIndex];
      const sseUrl = `${baseUrl}${path}?token=${token}`;
      console.log('[SSE uazapi] Conectando:', sseUrl, pathIndex === 0 ? '(primeiro path)' : '(fallback)');
      const es = new EventSource(sseUrl);
      sseRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setSseConnected(true);
        setSseConnectionState('connected');
        console.log('[SSE uazapi] Conexão aberta em', path, '- Envie uma mensagem no WhatsApp para testar.');
      };
      es.onerror = () => {
        if (cancelled) return;
        if (currentCleanup) {
          currentCleanup();
          currentCleanup = null;
        }
        es.close();
        sseRef.current = null;
        setSseConnected(false);
        if (pathIndex + 1 < ssePaths.length) {
          pathIndex += 1;
          console.warn('[SSE uazapi] Erro em', path, '- tentando', ssePaths[pathIndex]);
          connect();
        } else {
          setSseConnectionState('error');
          console.warn('[SSE uazapi] Ambos os paths falharam. Use o webhook para receber mensagens.');
        }
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
            savedToInbox: false,
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
              id: `msg-${Date.now()}-${row.message_id}`,
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              from_jid: row.from_jid,
              phone: row.phone,
              bodyPreview: (row.body || '').slice(0, 60) || `[${eventType}]`,
              eventType,
              savedToInbox: true,
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

      const eventTypes = ['message', 'messages', 'notification', 'event', 'message.upsert', 'upsert', 'update', 'chat', 'conversation'];
      eventTypes.forEach((type) => es.addEventListener(type, handleEvent));

      return () => {
        eventTypes.forEach((type) => es.removeEventListener(type, handleEvent));
        es.close();
        sseRef.current = null;
        sseFirstEventToastRef.current = false;
        setSseConnected(false);
        setSseConnectionState('idle');
      };
    };

    currentCleanup = connect();
    return () => {
      cancelled = true;
      if (typeof currentCleanup === 'function') currentCleanup();
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setSseConnected(false);
      setSseConnectionState('idle');
    };
  }, [config?.use_sse, config?.subdomain, config?.token, effectiveClienteId]);

  useEffect(() => {
    if (!configs?.length) return;
    let cancelled = false;
    configs.forEach((cfg) => {
      if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) return;
      const baseUrl = `https://${cfg.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
      (async () => {
        try {
          const res = await fetch(`${baseUrl}/instance/status`, {
            method: 'GET',
            headers: { token: cfg.token.trim() },
          });
          if (cancelled) return;
          const data = await res.json().catch(() => ({}));
          const channel = parseChannelData({ ...data, connected: data?.instance?.status === 'connected' || data?.loggedIn });
          if (channel?.number || channel?.profileName) {
            setChannelDataByConfigId((prev) => ({ ...prev, [cfg.id]: channel }));
          }
        } catch {
          // ignore
        }
      })();
    });
    return () => { cancelled = true; };
  }, [configs]);

  const getBaseUrlForConfig = (cfg) => {
    if (!cfg?.subdomain?.trim()) return '';
    return `https://${cfg.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
  };

  const getWebhookUrlForConfig = (cfg) => {
    if (!effectiveClienteId || !cfg?.webhook_secret) return '';
    const q = new URLSearchParams({
      cliente_id: effectiveClienteId,
      secret: cfg.webhook_secret,
    });
    return `${supabaseUrl}/functions/v1/uazapi-inbox-webhook?${q.toString()}`;
  };

  const fetchConnect = useCallback(async (cfg, isInitial = true) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) return null;
    const baseUrl = getBaseUrlForConfig(cfg);
    const url = `${baseUrl}/instance/connect`;
    const cid = cfg.id;
    if (isInitial) {
      setConnectingConfigId(cid);
      setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: null }));
      setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
      setChannelDataByConfigId((prev) => ({ ...prev, [cid]: null }));
    }
    try {
      if (isInitial) updateInstanceStatus('connecting', cid);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: cfg.token.trim() },
        body: '{}',
      });
      const data = await res.json().catch(async () => ({ _raw: await res.text() }));
      const payload = { status: res.status, ok: res.ok, url: `${baseUrl}/instance/connect`, ...data };
      setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: payload }));
      const channel = parseChannelData(payload);
      if (channel) {
        setChannelDataByConfigId((prev) => ({ ...prev, [cid]: channel }));
        setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
      } else {
        parseAndSetQr(data, (qr) => setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: qr })));
      }
      if (res.ok) updateInstanceStatus('connected', cid);
      else updateInstanceStatus('disconnected', cid);
      return { data, res };
    } catch (err) {
      if (isInitial) {
        const message = err.message || 'Erro de rede ou CORS. Em produção pode ser necessário usar um proxy.';
        toast({ variant: 'destructive', title: 'Erro ao conectar', description: message });
        setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: { error: message, url: `${baseUrl}/instance/connect`, hint: 'Verifique subdomínio, token e se a API permite requisições do navegador (CORS).' } }));
        updateInstanceStatus('disconnected', cid);
      }
      return null;
    } finally {
      if (isInitial) setConnectingConfigId(null);
    }
  }, [updateInstanceStatus, toast]);

  const fetchStatusOnly = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) return;
    const baseUrl = getBaseUrlForConfig(cfg);
    const cid = cfg.id;
    setPullingConfigId(cid);
    try {
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: 'GET',
        headers: { token: cfg.token.trim() },
      });
      const data = await res.json().catch(() => ({}));
      const channel = parseChannelData({ ...data, connected: data?.instance?.status === 'connected' || data?.loggedIn });
      if (channel?.number || channel?.profileName) {
        setChannelDataByConfigId((prev) => ({ ...prev, [cid]: channel }));
        setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
        setConnectResponseByConfigId((prev) => (prev[cid] ? { ...prev, [cid]: { ...prev[cid], ...data } } : { ...prev, [cid]: { status: res.status, ok: res.ok, ...data } }));
        toast({ title: 'Canal atualizado', description: 'Dados da instância foram atualizados.' });
      } else {
        setChannelDataByConfigId((prev) => ({ ...prev, [cid]: null }));
        toast({ title: 'Canal não conectado', description: 'Conecte o WhatsApp para ver os dados da instância.', variant: 'destructive' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao puxar canal', description: 'Não foi possível obter o status da instância.' });
    } finally {
      setPullingConfigId(null);
    }
  }, [toast]);

  const handleConnectWhatsAppWithStatusFirst = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) {
      toast({ variant: 'destructive', title: 'Configure a API', description: 'Subdomínio e token são obrigatórios.' });
      return;
    }
    const baseUrl = getBaseUrlForConfig(cfg);
    const cid = cfg.id;
    setConnectingConfigId(cid);
    setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: null }));
    setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
    try {
      const res = await fetch(`${baseUrl}/instance/status`, {
        method: 'GET',
        headers: { token: cfg.token.trim() },
      });
      const data = await res.json().catch(() => ({}));
      const channel = parseChannelData({ ...data, connected: data?.instance?.status === 'connected' || data?.loggedIn });
      if (channel?.number || channel?.profileName) {
        setChannelDataByConfigId((prev) => ({ ...prev, [cid]: channel }));
        setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: { status: res.status, ok: res.ok, ...data } }));
        updateInstanceStatus('connected', cid);
        toast({ title: 'Canal já conectado', description: 'A instância está vinculada. Dados exibidos acima.' });
        setConnectingConfigId(null);
        return;
      }
    } catch {
      // fall through to connect
    }
    await handleConnectWhatsApp(cfg);
    setConnectingConfigId(null);
  }, [toast, updateInstanceStatus]);

  const handleConnectWhatsApp = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) {
      toast({ variant: 'destructive', title: 'Configure a API', description: 'Subdomínio e token são obrigatórios.' });
      return;
    }
    if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = null;
    }
    qrRefreshConfigIdRef.current = cfg.id;
    const result = await fetchConnect(cfg, true);
    if (!result) return;
    const { data } = result;
    const instanceStatus = data?.instance?.status ?? data?.status?.connected;
    const isConnecting = instanceStatus === 'connecting' || (data?.connected === false && data?.instance?.qrcode);
    if (isConnecting && (data?.instance?.qrcode ?? data?.qrcode)) {
      qrRefreshIntervalRef.current = setInterval(async () => {
        const currentCfg = configs?.find((c) => c.id === qrRefreshConfigIdRef.current);
        if (!currentCfg) return;
        const next = await fetchConnect(currentCfg, false);
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
            setChannelDataByConfigId((prev) => ({ ...prev, [currentCfg.id]: channel }));
            setQrImageSrcByConfigId((prev) => ({ ...prev, [currentCfg.id]: null }));
            setConnectResponseByConfigId((prev) => (prev[currentCfg.id] ? { ...prev, [currentCfg.id]: { ...prev[currentCfg.id], ...nextData } } : prev));
          }
          return;
        }
        if (!nextData?.instance?.qrcode && !nextData?.qrcode) return;
        parseAndSetQr(nextData, (qr) => setQrImageSrcByConfigId((prev) => ({ ...prev, [currentCfg.id]: qr })));
      }, QR_REFRESH_SECONDS * 1000);
    }
  }, [configs, fetchConnect, toast]);

  const setWebhookInUazapi = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim() || !cfg?.webhook_secret || !effectiveClienteId) return;
    const baseUrl = getBaseUrlForConfig(cfg);
    const webhookUrl = getWebhookUrlForConfig(cfg);
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
          headers: { 'Content-Type': 'application/json', token: cfg.token.trim() },
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
  }, [effectiveClienteId, toast]);

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
              Conecte mais de uma API (uazapi) para rodar vários canais WhatsApp. Adicione um canal e configure subdomínio e token.
            </p>
          </div>
        )}
        {embeddedInCrm && (
          <p className="text-sm text-muted-foreground">Conecte mais de uma API para rodar vários canais. Adicione um canal abaixo.</p>
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

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Canais
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Conecte e gerencie suas APIs WhatsApp (uazapi). Cada canal pode ter sua própria instância.</p>
          </div>
          <div className="p-4 space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : configs.length === 0 ? (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">Nenhum canal ainda. Adicione uma API (uazapi) com subdomínio e token para conectar um canal WhatsApp.</p>
            <Button onClick={() => setAddChannelOpen(true)}>
              Adicionar canal
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {configs.map((cfg, idx) => {
              const channelDataC = channelDataByConfigId[cfg.id];
              const connectResponseC = connectResponseByConfigId[cfg.id];
              const qrImageSrcC = qrImageSrcByConfigId[cfg.id];
              const connecting = connectingConfigId === cfg.id;
              const pulling = pullingConfigId === cfg.id;
              const canalLabel = cfg.name?.trim() || `Canal ${idx + 1}`;
              const isConnected = channelDataC && (channelDataC.number || channelDataC.profileName || channelDataC.instanceName);
              return (
                <Card key={cfg.id} className="flex flex-col">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base truncate">
                        <MessageCircle className="h-5 w-5 shrink-0" />
                        <span className="truncate">{canalLabel}</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        API uazapi
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={async () => {
                        if (window.confirm(`Remover o canal "${canalLabel}"? Esta ação não pode ser desfeita.`)) await deleteConfig(cfg.id);
                      }}
                    >
                      Remover
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1 flex flex-col min-h-0">
                    {!isConnected && (
                      <>
                        <Alert className="bg-muted/50 border-muted-foreground/20 py-2">
                          <AlertDescription className="text-xs">
                            Se aparecer &quot;impossível conectar&quot; no celular, é limitação do WhatsApp. Tente em algumas horas ou desvincile um dispositivo.
                          </AlertDescription>
                        </Alert>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => handleConnectWhatsAppWithStatusFirst(cfg)} disabled={connecting}>
                            {connecting ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Conectando…</> : 'Conectar WhatsApp'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => fetchStatusOnly(cfg)} disabled={pulling || connecting}>
                            {pulling ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> …</> : 'Puxar canal'}
                          </Button>
                        </div>
                      </>
                    )}
                    {isConnected && (
                      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={channelDataC.profilePicUrl || undefined} alt={channelDataC.profileName || ''} />
                          <AvatarFallback className="text-xs">
                            {channelDataC.profileName ? channelDataC.profileName.charAt(0).toUpperCase() : channelDataC.number ? channelDataC.number.slice(-2) : '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {channelDataC.number && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">{formatPhoneDisplay(channelDataC.number)}</span>
                            </div>
                          )}
                          {(channelDataC.profileName || channelDataC.instanceName) && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                              <User className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{[channelDataC.profileName, channelDataC.instanceName].filter(Boolean).join(' · ')}</span>
                            </div>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="shrink-0 h-8" onClick={() => fetchStatusOnly(cfg)} disabled={pulling || connecting}>
                          {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Atualizar'}
                        </Button>
                      </div>
                    )}
                    {connectResponseC && !isConnected && (
                      <div className="space-y-2 pt-2 border-t">
                        {qrImageSrcC ? (
                          <div className="flex flex-col items-center gap-1">
                            <img src={qrImageSrcC} alt="QR Code" className="max-w-[160px] h-auto border rounded" />
                            <p className="text-xs text-muted-foreground">Escaneie no WhatsApp</p>
                          </div>
                        ) : connectResponseC.error ? (
                          <p className="text-xs text-destructive">{connectResponseC.error}</p>
                        ) : null}
                        <details className="w-full">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">Ver log</summary>
                          <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-24 mt-1">{JSON.stringify(connectResponseC, null, 2)}</pre>
                        </details>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            </div>
            <div className="pt-2">
              <Button variant="outline" onClick={() => setAddChannelOpen(true)}>
                Adicionar outro canal
              </Button>
            </div>

            {configs.length > 0 && effectiveClienteId && (
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden mt-6">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Webhook uazapi (Caixa de entrada)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Configure na uazapi a URL de cada canal para receber mensagens na Caixa de entrada. Evento: messages.</p>
                </div>
                <div className="p-4 space-y-4">
                  {configs.filter((c) => c.subdomain && c.token).map((cfg, idx) => {
                    const canalLabel = cfg.name?.trim() || `Canal ${idx + 1}`;
                    return (
                      <div key={cfg.id} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium text-sm">{canalLabel}</span>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                              <Radio className="h-3.5 w-3.5" />
                              Usar SSE
                            </Label>
                            <Switch
                              checked={!!cfg.use_sse}
                              onCheckedChange={(checked) => setUseSse(checked, cfg.id)}
                            />
                          </div>
                        </div>
                        {cfg.webhook_secret ? (
                          <div className="space-y-2">
                            <div className="flex gap-2 flex-wrap items-center">
                              <Input
                                readOnly
                                value={getWebhookUrlForConfig(cfg)}
                                className="font-mono text-xs flex-1 min-w-0 max-w-full"
                              />
                              <Button variant="outline" size="icon" title="Copiar URL" onClick={() => { navigator.clipboard.writeText(getWebhookUrlForConfig(cfg)); toast({ title: 'URL copiada' }); }}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" disabled={webhookTesting} onClick={async () => {
                                setWebhookTesting(true);
                                try {
                                  const res = await fetch(getWebhookUrlForConfig(cfg), { method: 'GET' });
                                  const data = await res.json().catch(() => ({}));
                                  if (res.ok) toast({ title: 'URL acessível' });
                                  else toast({ variant: 'destructive', title: 'Erro', description: data?.error || `Status ${res.status}` });
                                } catch (e) { toast({ variant: 'destructive', title: 'Falha', description: e?.message }); }
                                setWebhookTesting(false);
                              }}>
                                {webhookTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Testar
                              </Button>
                              <Button variant="default" size="sm" disabled={webhookConfiguring} onClick={() => setWebhookInUazapi(cfg)} title="Registrar URL na uazapi">
                                {webhookConfiguring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Configurar na uazapi
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => generateWebhookSecret(cfg.id)}>
                            Gerar secret e ver URL do webhook
                          </Button>
                        )}
                      </div>
                    );
                  })}

                  <div className="border-t pt-4 mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        Eventos recebidos no webhook (uazapi)
                      </p>
                      <div className="flex items-center gap-2">
                        {uazapiWebhookLogs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhum evento ainda</span>
                        ) : (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            Último: {formatLastEventAgo(uazapiWebhookLogs[0].created_at)}
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={uazapiLogsRefreshing}
                          onClick={async () => { setUazapiLogsRefreshing(true); await fetchWebhookLogs(); setUazapiLogsRefreshing(false); }}
                        >
                          {uazapiLogsRefreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Atualizar
                        </Button>
                        {uazapiWebhookLogs.length >= 100 && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uazapiLogsLoadingMore} onClick={loadMoreUazapiLogs}>
                            {uazapiLogsLoadingMore ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Carregar mais
                          </Button>
                        )}
                      </div>
                    </div>
                    {uazapiWebhookLogs.length > 0 ? (
                      <div className="rounded-md border bg-muted/30 p-2 space-y-1 max-h-64 overflow-y-auto">
                        <p className="text-[11px] font-medium text-muted-foreground sticky top-0 bg-muted/80 py-1">Histórico — últimos eventos (Webhook uazapi · Caixa de entrada)</p>
                        {uazapiWebhookLogs.slice(0, 50).map((log) => (
                          <div key={log.id} className="text-xs rounded px-2 py-1.5 bg-background border flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground shrink-0">
                              {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${log.status === 'ok' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-destructive/20 text-destructive'}`}>
                              {log.status}
                            </span>
                            {log.from_jid && <span className="font-mono truncate max-w-[140px]" title={log.from_jid}>{log.from_jid}</span>}
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] shrink-0" onClick={() => setWebhookLogViewing(log)}>
                              Ver corpo
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Configure a URL na uazapi e envie uma mensagem; os eventos recebidos aparecem aqui.</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Eventos salvos em <code className="bg-muted px-1 rounded">cliente_whatsapp_webhook_log</code>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
          </div>
        </div>

        <Dialog open={addChannelOpen} onOpenChange={(open) => { setAddChannelOpen(open); if (!open) { setAddChannelName(''); setAddChannelSubdomain(''); setAddChannelToken(''); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar canal</DialogTitle>
              <p className="text-sm text-muted-foreground">Nova API uazapi (subdomínio e token). Cada canal pode ter sua própria instância WhatsApp.</p>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="add-channel-name">Nome do canal (opcional)</Label>
                <Input
                  id="add-channel-name"
                  placeholder="Ex: Vendas, Suporte"
                  value={addChannelName}
                  onChange={(e) => setAddChannelName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-channel-subdomain">Subdomínio uazapi</Label>
                <Input
                  id="add-channel-subdomain"
                  placeholder="seu-subdominio (de https://seu-subdominio.uazapi.com)"
                  value={addChannelSubdomain}
                  onChange={(e) => setAddChannelSubdomain(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-channel-token">Token</Label>
                <Input
                  id="add-channel-token"
                  type="password"
                  placeholder="Token da instância"
                  value={addChannelToken}
                  onChange={(e) => setAddChannelToken(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddChannelOpen(false)}>Cancelar</Button>
                <Button
                  disabled={addChannelSaving || !addChannelSubdomain?.trim() || !addChannelToken?.trim()}
                  onClick={async () => {
                    setAddChannelSaving(true);
                    const { success } = await addConfig(addChannelSubdomain.trim(), addChannelToken.trim(), addChannelName.trim() || undefined);
                    setAddChannelSaving(false);
                    if (success) {
                      setAddChannelOpen(false);
                      setAddChannelName('');
                      setAddChannelSubdomain('');
                      setAddChannelToken('');
                    }
                  }}
                >
                  {addChannelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Adicionar canal
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!webhookLogViewing} onOpenChange={(open) => !open && setWebhookLogViewing(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Corpo inteiro recebido pelo webhook
                {webhookLogViewing?.source ? ` (${webhookLogViewing.source})` : ''}
              </DialogTitle>
              {webhookLogViewing && (
                <p className="text-xs text-muted-foreground">
                  {webhookLogViewing.created_at && new Date(webhookLogViewing.created_at).toLocaleString('pt-BR')}
                  {webhookLogViewing.from_jid && ` · ${webhookLogViewing.from_jid}`}
                </p>
              )}
            </DialogHeader>
            <div className="flex-1 min-h-[200px] max-h-[60vh] rounded-md border bg-muted/30 p-3 overflow-y-auto overflow-x-hidden">
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
                    Para ver o JSON completo: publique as Edge Functions <strong>uazapi-inbox-webhook</strong> e <strong>apicebot-inbox-webhook</strong> (com raw_payload e source) e envie uma nova mensagem; depois abra &quot;Ver corpo&quot; no evento novo.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t mt-3">
              <Button
                variant="default"
                size="sm"
                disabled={importContactLoading || !effectiveClienteId || !((webhookLogViewing?.from_jid && webhookLogViewing.from_jid !== 'unknown') || getFromJidFromRawPayload(webhookLogViewing?.raw_payload))}
                onClick={async () => {
                  const log = webhookLogViewing;
                  const effectiveFromJid = (log?.from_jid && log.from_jid !== 'unknown') ? log.from_jid : getFromJidFromRawPayload(log?.raw_payload);
                  if (!effectiveFromJid || !effectiveClienteId) {
                    toast({ variant: 'destructive', title: 'Não é possível importar', description: 'Este evento não tem remetente válido para importar.' });
                    return;
                  }
                  setImportContactLoading(true);
                  const tracking = buildContactTrackingFromRawPayload(log?.raw_payload);
                  const { phone, sender_name } = extractPhoneAndNameFromRawPayload(log.raw_payload, effectiveFromJid);
                  const now = new Date().toISOString();

                  const { data: existingContact } = await supabase
                    .from('cliente_whatsapp_contact')
                    .select('id, tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
                    .eq('cliente_id', effectiveClienteId)
                    .eq('from_jid', effectiveFromJid)
                    .maybeSingle();

                  const existingHasTracking = existingContact?.tracking_data && typeof existingContact.tracking_data === 'object' && Object.keys(existingContact.tracking_data).length > 0;
                  const finalTracking = existingHasTracking ? existingContact.tracking_data : (tracking.tracking_data || null);
                  const finalOrigin = existingHasTracking ? (existingContact.origin_source ?? tracking.origin_source) : tracking.origin_source;
                  const finalUtm = existingHasTracking
                    ? { utm_source: existingContact.utm_source ?? tracking.utm_source, utm_medium: existingContact.utm_medium ?? tracking.utm_medium, utm_campaign: existingContact.utm_campaign ?? tracking.utm_campaign, utm_content: existingContact.utm_content ?? tracking.utm_content, utm_term: existingContact.utm_term ?? tracking.utm_term }
                    : { utm_source: tracking.utm_source, utm_medium: tracking.utm_medium, utm_campaign: tracking.utm_campaign, utm_content: tracking.utm_content, utm_term: tracking.utm_term };
                  const mergedTracking = !existingHasTracking && existingContact?.tracking_data?.meta_ad_details
                    ? { ...(tracking.tracking_data || {}), meta_ad_details: existingContact.tracking_data.meta_ad_details, meta_ad_details_history: existingContact.tracking_data.meta_ad_details_history }
                    : finalTracking;

                  const profilePicUrl = getProfilePicFromRawPayload(log?.raw_payload) || null;
                  const row = {
                    cliente_id: effectiveClienteId,
                    from_jid: effectiveFromJid,
                    phone: phone || null,
                    sender_name: sender_name || null,
                    origin_source: finalOrigin,
                    utm_source: finalUtm.utm_source,
                    utm_medium: finalUtm.utm_medium,
                    utm_campaign: finalUtm.utm_campaign,
                    utm_content: finalUtm.utm_content,
                    utm_term: finalUtm.utm_term,
                    tracking_data: mergedTracking,
                    profile_pic_url: profilePicUrl,
                    last_message_at: log.created_at || now,
                    updated_at: now,
                  };
                  const { error } = await supabase
                    .from('cliente_whatsapp_contact')
                    .upsert(row, {
                      onConflict: 'cliente_id,from_jid',
                      updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'profile_pic_url', 'last_message_at', 'updated_at'],
                    });
                  setImportContactLoading(false);
                  if (error) {
                    toast({ variant: 'destructive', title: 'Erro ao importar contato', description: error.message });
                    return;
                  }
                  toast({
                    title: existingContact ? 'Contato atualizado' : 'Contato importado',
                    description: existingContact ? (existingHasTracking ? 'Contato atualizado (dados de rastreamento e Meta preservados).' : 'Os dados do contato foram atualizados com as informações do evento.') : 'O contato foi adicionado à lista de contatos.',
                  });
                  const { data: leadFromContact } = await supabase.functions.invoke('create-lead-from-contact', {
                    body: { from_jid: effectiveFromJid, phone: row.phone || null, sender_name: row.sender_name || null, profile_pic_url: profilePicUrl || null },
                  });
                  if (leadFromContact?.created) {
                    toast({ title: 'Adicionado ao funil', description: 'O contato foi exportado para o funil configurado nas automações.' });
                  }
                  if ((finalOrigin === 'meta_ads' || tracking.origin_source === 'meta_ads') && log.id) {
                    const phoneNorm = (effectiveFromJid.replace(/@.*$/, '').trim() || '').replace(/\D/g, '');
                    const { data: leads } = await supabase
                      .from('leads')
                      .select('id, whatsapp')
                      .eq('cliente_id', effectiveClienteId)
                      .limit(200);
                    const lead = (leads || []).find((l) => {
                      const w = (l.whatsapp || '').replace(/\D/g, '');
                      return w === phoneNorm || w.endsWith(phoneNorm) || phoneNorm.endsWith(w);
                    });
                    if (lead) {
                      await supabase.from('lead_webhook_event').insert({ lead_id: lead.id, webhook_log_id: log.id });
                    }
                  }
                }}
              >
                {importContactLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Importar como contato
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ClienteCanaisPage;
