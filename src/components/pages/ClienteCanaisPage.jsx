import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCircle, Loader2, QrCode, Phone, User, Link2, Copy, Activity, CheckCircle2, Clock, Radio, UserPlus, Send, XCircle, Headphones, ChevronRight, Settings2, Plug, Pencil, ArrowLeft } from 'lucide-react';
import MetaConversionsChannelSettings from '@/components/crm/MetaConversionsChannelSettings';
import ClienteMetaCtwaSettings from '@/components/crm/ClienteMetaCtwaSettings';
import ClienteGoogleDriveSettings from '@/components/crm/ClienteGoogleDriveSettings';
import ClienteIngressWebhookSettings from '@/components/crm/ClienteIngressWebhookSettings';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import { extractPhoneAndNameFromRawPayload, getFromJidFromRawPayload, buildContactTrackingFromRawPayload, getProfilePicFromRawPayload } from '@/lib/contactFromWebhookPayload';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { configureUazapiWebhook } from '@/lib/uazapiWebhookConfig';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';

const QR_REFRESH_SECONDS = 45;

const uazapiFetch = (url, options = {}) =>
  fetch(url, { cache: 'no-store', ...options, headers: { ...(options.headers || {}) } });

function formatLastEventAgo(dateStr) {
  if (!dateStr) return '';
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
  return `há ${Math.floor(sec / 3600)} h`;
}

function normalizeBrazilWhatsAppDigits(digits) {
  if (!digits) return null;
  const d = String(digits).replace(/\D/g, '');
  if (!d.startsWith('55')) return d.length >= 10 && d.length <= 15 ? d : null;

  if (d.length === 12 && /^55\d{2}\d{8}$/.test(d)) return d;
  if (d.length === 13 && /^55\d{2}9\d{8}$/.test(d)) return d;

  // uazapi/WhatsApp às vezes concatena sufixo extra (ex.: 55419525255962 → 554195252559)
  if (d.length > 13) {
    const try13 = d.slice(0, 13);
    if (/^55\d{2}9\d{8}$/.test(try13)) return try13;
    const try12 = d.slice(0, 12);
    if (/^55\d{2}\d{8}$/.test(try12)) return try12;
  }

  return d.length >= 10 && d.length <= 15 ? d : null;
}

function extractPhoneFromJidValue(jid) {
  if (jid == null) return null;
  if (typeof jid === 'string') {
    const s = jid.trim();
    if (!s || s === '[object Object]') return null;
    const userPart = s.split('@')[0].split(':')[0];
    const digits = userPart.replace(/\D/g, '');
    return normalizeBrazilWhatsAppDigits(digits) || (digits.length >= 10 ? digits : null);
  }
  if (typeof jid === 'object') {
    const user = jid.user ?? jid.phone ?? jid.number;
    if (user != null) {
      const digits = String(user).replace(/\D/g, '');
      return normalizeBrazilWhatsAppDigits(digits) || (digits.length >= 10 ? digits : null);
    }
  }
  return null;
}

function configFingerprint(cfg) {
  if (!cfg?.id) return '';
  return `${cfg.id}|${(cfg.subdomain || '').trim()}|${(cfg.token || '').trim()}|${cfg.updated_at || ''}`;
}

function withChannelMeta(cfg, channel) {
  if (!channel) return null;
  return { ...channel, fetchedAt: Date.now(), fingerprint: configFingerprint(cfg) };
}

function parseChannelData(data) {
  if (!data) return null;
  const connected =
    data.connected === true ||
    data.status?.loggedIn === true ||
    data.status?.connected === true ||
    data.instance?.status === 'connected';
  if (!connected) return null;

  const jidRaw = data.status?.jid ?? data.instance?.jid ?? data.jid;
  let number =
    extractPhoneFromJidValue(jidRaw) ||
    normalizeBrazilWhatsAppDigits(String(data.instance?.phone || '').replace(/\D/g, ''));

  const profileName = data.instance?.profileName ?? data.profileName ?? data.profile?.name ?? '';
  const profilePicUrl = data.instance?.profilePicUrl ?? data.profilePicUrl ?? data.profile?.pic ?? '';
  const instanceName = data.instance?.name ?? data.instanceName ?? '';
  const instanceId = data.instance?.id ?? null;

  return {
    number,
    profileName: profileName || null,
    profilePicUrl: profilePicUrl || null,
    instanceName: instanceName || null,
    instanceId: instanceId || null,
  };
}

function formatPhoneDisplay(num) {
  if (!num) return '';
  const s = String(num).replace(/\D/g, '');
  if (s.length === 13 && s.startsWith('55') && /^55\d{2}9\d{8}$/.test(s)) {
    return `+55 (${s.slice(2, 4)}) ${s.slice(4, 5)} ${s.slice(5, 9)}-${s.slice(9)}`;
  }
  if (s.length === 12 && s.startsWith('55') && /^55\d{2}\d{8}$/.test(s)) {
    return `+55 (${s.slice(2, 4)}) ${s.slice(4, 8)}-${s.slice(8)}`;
  }
  if (s.length >= 10) return `+${s}`;
  return num;
}

const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente';
  return '/client-area';
};

const ClienteCanaisPage = ({ onGoToApi, embeddedInCrm, embeddedInConversas, embeddedInMiniCrm, lockedClienteId, canConfigureCsGroups = false }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { search } = useLocation();
  const prefix = getRoutePrefix(profile);
  const {
    effectiveClienteId,
    config,
    configs,
    loading,
    isAdminWithoutCliente,
    conversasAccessMissing,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
    updateInstanceStatus,
    generateWebhookSecret,
    setUseSse,
    addConfig,
    deleteConfig,
    fetchConfig,
    saveConfig,
  } = useClienteWhatsAppConfig({ forConversas: !!embeddedInConversas, lockedClienteId: lockedClienteId || null });

  const duplicateTokenConfigIds = useMemo(() => {
    const byToken = new Map();
    (configs || []).forEach((c) => {
      const t = c.token?.trim();
      if (!t) return;
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(c.id);
    });
    const dup = new Set();
    byToken.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => dup.add(id)); });
    return dup;
  }, [configs]);

  const [channelDataByConfigId, setChannelDataByConfigId] = useState({});
  const [connectResponseByConfigId, setConnectResponseByConfigId] = useState({});
  const [qrImageSrcByConfigId, setQrImageSrcByConfigId] = useState({});
  const [connectingConfigId, setConnectingConfigId] = useState(null);
  const [pullingConfigId, setPullingConfigId] = useState(null);
  const [disconnectingConfigId, setDisconnectingConfigId] = useState(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookConfiguringConfigId, setWebhookConfiguringConfigId] = useState(null);
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
  const [editChannelOpen, setEditChannelOpen] = useState(false);
  const [editChannelCfg, setEditChannelCfg] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [editChannelSubdomain, setEditChannelSubdomain] = useState('');
  const [editChannelToken, setEditChannelToken] = useState('');
  const [editChannelSaving, setEditChannelSaving] = useState(false);
  const [crmApiceForwardUrl, setCrmApiceForwardUrl] = useState('');
  const [crmApiceForwardEnabled, setCrmApiceForwardEnabled] = useState(false);
  const [crmApiceForwardLoading, setCrmApiceForwardLoading] = useState(false);
  const [crmApiceForwardSaving, setCrmApiceForwardSaving] = useState(false);
  const [crmApiceStatusSecret, setCrmApiceStatusSecret] = useState('');
  const [crmApiceStatusSecretSaving, setCrmApiceStatusSecretSaving] = useState(false);
  const [sendToCrmResultByLogId, setSendToCrmResultByLogId] = useState({});
  const [sendToCrmLoadingLogId, setSendToCrmLoadingLogId] = useState(null);
  const [canaisTab, setCanaisTab] = useState(() =>
    embeddedInConversas && new URLSearchParams(search).get('aba') === 'webhook' ? 'webhook' : 'conectar');
  const configuringWebhookRef = useRef(false);
  const qrRefreshIntervalRef = useRef(null);
  const qrRefreshConfigIdRef = useRef(null);
  const statusFetchGenRef = useRef({});
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
    if (!effectiveClienteId || embeddedInMiniCrm) return;
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
  }, [effectiveClienteId, fetchWebhookLogs, embeddedInMiniCrm]);

  useEffect(() => {
    if (!effectiveClienteId || embeddedInMiniCrm) {
      setCrmApiceForwardUrl('');
      setCrmApiceForwardEnabled(false);
      return;
    }
    setCrmApiceForwardLoading(true);
    supabase
      .from('cliente_crm_apice_forward')
      .select('webhook_url, enabled, status_incoming_secret')
      .eq('cliente_id', effectiveClienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCrmApiceForwardUrl(data.webhook_url || '');
          setCrmApiceForwardEnabled(data.enabled !== false);
          setCrmApiceStatusSecret(data.status_incoming_secret || '');
        } else {
          setCrmApiceForwardUrl('');
          setCrmApiceForwardEnabled(false);
          setCrmApiceStatusSecret('');
        }
      })
      .finally(() => setCrmApiceForwardLoading(false));
  }, [effectiveClienteId, embeddedInMiniCrm]);

  const crmApiceStatusWebhookUrl = `${supabaseUrl}/functions/v1/crm-apice-contact-status-webhook`;

  const generateCrmApiceStatusSecret = useCallback(async () => {
    if (!effectiveClienteId) return;
    const url = (crmApiceForwardUrl || '').trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      toast({
        variant: 'destructive',
        title: 'Configure o encaminhamento primeiro',
        description: 'Preencha e salve a URL do Webhook Genérico do CRM-Apice acima; depois gere o secret de status.',
      });
      return;
    }
    const { data: fwdRow } = await supabase.from('cliente_crm_apice_forward').select('id').eq('cliente_id', effectiveClienteId).maybeSingle();
    if (!fwdRow?.id) {
      toast({
        variant: 'destructive',
        title: 'Salve a URL primeiro',
        description: 'Clique em Salvar no bloco "Encaminhar eventos para CRM-Apice" para criar a configuração antes de gerar o secret.',
      });
      return;
    }
    setCrmApiceStatusSecretSaving(true);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase
      .from('cliente_crm_apice_forward')
      .update({ status_incoming_secret: secret, updated_at: new Date().toISOString() })
      .eq('cliente_id', effectiveClienteId);
    setCrmApiceStatusSecretSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar secret', description: error.message });
      return;
    }
    setCrmApiceStatusSecret(secret);
    toast({ title: 'Secret gerado', description: 'Use no CRM-Apice (automação ou script) com o header Authorization Bearer.' });
  }, [effectiveClienteId, crmApiceForwardUrl, toast]);

  const saveCrmApiceForward = useCallback(async () => {
    if (!effectiveClienteId) return;
    const url = (crmApiceForwardUrl || '').trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      toast({ title: 'URL inválida', description: 'Informe a URL completa do Webhook Genérico do CRM-Apice.', variant: 'destructive' });
      return;
    }
    setCrmApiceForwardSaving(true);
    const { error } = await supabase.from('cliente_crm_apice_forward').upsert(
      { cliente_id: effectiveClienteId, webhook_url: url, enabled: crmApiceForwardEnabled, updated_at: new Date().toISOString() },
      { onConflict: 'cliente_id' }
    );
    setCrmApiceForwardSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo', description: 'Encaminhamento para CRM-Apice atualizado.' });
    }
  }, [effectiveClienteId, crmApiceForwardUrl, crmApiceForwardEnabled, toast]);

  const sendEventToCrmApice = useCallback(async (log, source = 'uazapi') => {
    const url = (crmApiceForwardUrl || '').trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      toast({ title: 'Configure a URL', description: 'Preencha e salve a URL do Webhook Genérico em "Encaminhar eventos para CRM-Apice".', variant: 'destructive' });
      return;
    }
    const { phone: extractedPhone, sender_name: extractedName } = extractPhoneAndNameFromRawPayload(log?.raw_payload, log?.from_jid) || {};
    const phone = extractedPhone || (log?.from_jid ? String(log.from_jid).replace(/@.*$/, '').trim() : null) || null;
    const tracking = buildContactTrackingFromRawPayload(log?.raw_payload) || {};
    const profilePic = getProfilePicFromRawPayload(log?.raw_payload) || null;
    const payload = {
      event_type: 'planeje_whatsapp',
      payload: {
        source,
        from_jid: log?.from_jid || null,
        phone,
        sender_name: extractedName || null,
        body_preview: log?.body_preview || null,
        type: log?.type || null,
        created_at: log?.created_at || new Date().toISOString(),
        webhook_log_id: log?.id || null,
        profile_pic_url: profilePic,
        imagePreview: profilePic,
        origin_source: tracking.origin_source || 'nao_identificado',
        tracking_data: tracking.tracking_data || null,
        raw_payload: log?.raw_payload || null,
      },
    };
    setSendToCrmLoadingLogId(log?.id);
    setSendToCrmResultByLogId((prev) => ({ ...prev, [log?.id]: undefined }));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const text = await res.text().catch(() => '');
      const result = res.ok
        ? { status: 'ok', statusCode: res.status }
        : { status: 'error', statusCode: res.status, message: text.slice(0, 150) };
      setSendToCrmResultByLogId((prev) => ({ ...prev, [log?.id]: result }));
      if (res.ok) {
        toast({ title: 'Enviado ao CRM-Apice', description: `Evento enviado com sucesso (${res.status}). Confira em Integrações → Webhook Genérico.` });
      } else {
        toast({ title: 'Erro ao enviar', description: `CRM-Apice respondeu ${res.status}: ${text.slice(0, 80)}`, variant: 'destructive' });
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setSendToCrmResultByLogId((prev) => ({ ...prev, [log?.id]: { status: 'error', message: msg } }));
      toast({ title: 'Falha ao enviar', description: `Problema no Planeje (rede/timeout): ${msg}`, variant: 'destructive' });
    } finally {
      setSendToCrmLoadingLogId(null);
    }
  }, [crmApiceForwardUrl, toast]);

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

  const configCredentialsKey = useMemo(
    () => (configs || []).map((c) => configFingerprint(c)).join(';;'),
    [configs]
  );

  const getBaseUrlForConfig = useCallback((cfg) => {
    if (!cfg?.subdomain?.trim()) return '';
    return `https://${cfg.subdomain.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '')}.uazapi.com`;
  }, []);

  const refreshChannelStatus = useCallback(async (cfg, { silent = false } = {}) => {
    const cid = cfg?.id;
    if (!cid) return null;
    const fp = configFingerprint(cfg);
    const nextGen = (statusFetchGenRef.current[cid] || 0) + 1;
    statusFetchGenRef.current[cid] = nextGen;

    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) {
      setChannelDataByConfigId((prev) => {
        if (!prev[cid]) return prev;
        const next = { ...prev };
        delete next[cid];
        return next;
      });
      return null;
    }

    const baseUrl = getBaseUrlForConfig(cfg);
    try {
      const res = await uazapiFetch(`${baseUrl}/instance/status?_=${Date.now()}`, {
        method: 'GET',
        headers: { token: cfg.token.trim() },
      });
      if (statusFetchGenRef.current[cid] !== nextGen) return null;

      const data = await res.json().catch(() => ({}));
      const channel = parseChannelData(data);

      setChannelDataByConfigId((prev) => {
        const next = { ...prev };
        if (channel?.number || channel?.profileName || channel?.instanceName) {
          next[cid] = { ...channel, fetchedAt: Date.now(), fingerprint: fp };
        } else {
          delete next[cid];
        }
        return next;
      });

      if (!silent) return { channel, data, res };
      return channel;
    } catch {
      if (statusFetchGenRef.current[cid] !== nextGen) return null;
      return null;
    }
  }, [getBaseUrlForConfig]);

  useEffect(() => {
    if (!configs?.length) {
      setChannelDataByConfigId({});
      return;
    }
    const validIds = new Set(configs.map((c) => c.id));
    setChannelDataByConfigId((prev) => {
      const next = {};
      for (const [id, data] of Object.entries(prev)) {
        if (!validIds.has(id)) continue;
        const cfg = configs.find((c) => c.id === id);
        if (cfg && data?.fingerprint === configFingerprint(cfg)) next[id] = data;
      }
      return next;
    });
    configs.forEach((cfg) => {
      refreshChannelStatus(cfg, { silent: true });
    });
  }, [configCredentialsKey, configs, refreshChannelStatus]);

  const openEditChannel = (cfg) => {
    setEditChannelCfg(cfg);
    setEditChannelName(cfg.name?.trim() || '');
    setEditChannelSubdomain(cfg.subdomain?.trim() || '');
    setEditChannelToken(cfg.token?.trim() || '');
    setEditChannelOpen(true);
  };

  const getWebhookUrlForConfig = useCallback((cfg) => {
    if (!effectiveClienteId || !cfg?.webhook_secret) return '';
    const q = new URLSearchParams({
      cliente_id: effectiveClienteId,
      secret: cfg.webhook_secret,
    });
    return `${supabaseUrl}/functions/v1/uazapi-inbox-webhook?${q.toString()}`;
  }, [effectiveClienteId]);

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
      const res = await uazapiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: cfg.token.trim() },
        body: '{}',
      });
      const data = await res.json().catch(async () => ({ _raw: await res.text() }));
      const payload = { status: res.status, ok: res.ok, url: `${baseUrl}/instance/connect`, ...data };
      setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: payload }));
      const channel = parseChannelData(payload);
      if (channel) {
        setChannelDataByConfigId((prev) => ({ ...prev, [cid]: withChannelMeta(cfg, channel) }));
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
    const cid = cfg.id;
    setPullingConfigId(cid);
    try {
      const result = await refreshChannelStatus(cfg, { silent: false });
      if (result?.channel?.number || result?.channel?.profileName) {
        setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
        setConnectResponseByConfigId((prev) => (
          prev[cid]
            ? { ...prev, [cid]: { ...prev[cid], ...result.data } }
            : { ...prev, [cid]: { status: result.res.status, ok: result.res.ok, ...result.data } }
        ));
        toast({
          title: 'Canal atualizado',
          description: result.channel.number
            ? formatPhoneDisplay(result.channel.number)
            : 'Dados da instância atualizados.',
        });
      } else {
        toast({
          title: 'Canal não conectado',
          description: 'Este token não tem WhatsApp conectado na uazapi. Gere QR ou confira o token.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao puxar canal', description: 'Não foi possível obter o status da instância.' });
    } finally {
      setPullingConfigId(null);
    }
  }, [refreshChannelStatus, toast]);

  const handleDisconnectWhatsApp = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) return;
    const canalLabel = cfg.name?.trim() || 'este canal';
    if (!window.confirm(
      `Desconectar o WhatsApp de "${canalLabel}"?\n\nA sessão na uazapi será encerrada. Depois escaneie o QR com o aparelho que você quer usar.`
    )) return;

    const cid = cfg.id;
    const baseUrl = getBaseUrlForConfig(cfg);
    setDisconnectingConfigId(cid);
    statusFetchGenRef.current[cid] = (statusFetchGenRef.current[cid] || 0) + 1;

    try {
      const res = await uazapiFetch(`${baseUrl}/instance/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: cfg.token.trim() },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      setChannelDataByConfigId((prev) => {
        const next = { ...prev };
        delete next[cid];
        return next;
      });
      setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
      setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: null }));
      await updateInstanceStatus('disconnected', cid);

      toast({
        title: 'WhatsApp desconectado',
        description: 'Clique em "Gerar QR Code" e escaneie com o número desejado.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desconectar',
        description: err.message || 'Não foi possível desconectar na uazapi.',
      });
    } finally {
      setDisconnectingConfigId(null);
    }
  }, [getBaseUrlForConfig, toast, updateInstanceStatus]);

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
            setChannelDataByConfigId((prev) => ({ ...prev, [currentCfg.id]: withChannelMeta(currentCfg, channel) }));
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

  const handleConnectWhatsAppWithStatusFirst = useCallback(async (cfg) => {
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) {
      toast({ variant: 'destructive', title: 'Configure a API', description: 'Subdomínio e token são obrigatórios.' });
      return;
    }
    const cid = cfg.id;
    setConnectingConfigId(cid);
    setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: null }));
    setQrImageSrcByConfigId((prev) => ({ ...prev, [cid]: null }));
    try {
      const channel = await refreshChannelStatus(cfg, { silent: true });
      if (channel?.number || channel?.profileName) {
        const baseUrl = getBaseUrlForConfig(cfg);
        setConnectResponseByConfigId((prev) => ({ ...prev, [cid]: { ok: true, url: `${baseUrl}/instance/status` } }));
        updateInstanceStatus('connected', cid);
        toast({ title: 'Canal já conectado', description: channel.number ? formatPhoneDisplay(channel.number) : 'Instância vinculada.' });
        setConnectingConfigId(null);
        return;
      }
    } catch {
      // fall through to connect
    }
    await handleConnectWhatsApp(cfg);
    setConnectingConfigId(null);
  }, [toast, updateInstanceStatus, getBaseUrlForConfig, refreshChannelStatus, handleConnectWhatsApp]);

  const handleSetupWebhook = useCallback(async (cfg, groups = false) => {
    if (configuringWebhookRef.current || (groups && !canConfigureCsGroups)) return;
    if (!cfg?.subdomain?.trim() || !cfg?.token?.trim()) {
      toast({ variant: 'destructive', title: 'Canal incompleto', description: 'Configure subdomínio e token antes.' });
      return;
    }
    if (!effectiveClienteId || cfg.cliente_id !== effectiveClienteId || cfg.archived_at || duplicateTokenConfigIds.has(cfg.id)) {
      toast({ variant: 'destructive', title: 'Canal indisponível', description: 'Confira a operação e se o token pertence a um único canal.' });
      return;
    }
    if (groups && (cfg.provider !== 'uazapi' || !cfg.webhook_secret)) return;
    configuringWebhookRef.current = true;
    setWebhookConfiguringConfigId(cfg.id);
    try {
      let workingCfg = cfg;
      if (!workingCfg.webhook_secret) {
        const secret = await generateWebhookSecret(cfg.id);
        if (!secret) return;
        workingCfg = { ...workingCfg, webhook_secret: secret };
      }
      await configureUazapiWebhook(uazapiFetch, { baseUrl: getBaseUrlForConfig(workingCfg), token: workingCfg.token.trim(),
        webhookUrl: getWebhookUrlForConfig(workingCfg), groups });
      toast(groups
        ? { title: 'Eventos de grupo ativos', description: 'O CS pode registrar novas saídas nos grupos vinculados a este canal.' }
        : { title: 'Recebimento ligado', description: 'O webhook foi confirmado na Uazapi. Mensagens novas devem aparecer em Conversas.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível configurar na Uazapi', description: error.message });
    } finally {
      configuringWebhookRef.current = false;
      setWebhookConfiguringConfigId(null);
    }
  }, [canConfigureCsGroups, duplicateTokenConfigIds, effectiveClienteId, generateWebhookSecret, getBaseUrlForConfig, getWebhookUrlForConfig, toast]);

  if (conversasAccessMissing) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <p className="text-sm text-muted-foreground">
          Seu usuário ainda não tem acesso ao atendimento. Peça ao superadmin para vincular você nas filas e canais da operação.
        </p>
      </div>
    );
  }

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

  const conversasInboxPath = buildConversasUrl({ statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO });

  return (
    <>
      {!embeddedInCrm && !embeddedInConversas && !embeddedInMiniCrm && <Helmet title="Canais - WhatsApp" />}
      <div className={`space-y-5 w-full ${embeddedInMiniCrm ? '' : embeddedInCrm || embeddedInConversas ? 'px-4 md:px-6 pt-4 pb-6 max-w-6xl mx-auto' : 'p-4 md:p-6 max-w-6xl mx-auto'}`}>
        {embeddedInConversas && (
          <Button variant="ghost" size="sm" className="mb-1 -ml-2 h-8" asChild>
            <Link to={conversasInboxPath}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar para Conversas
            </Link>
          </Button>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl jb-gradient-bg text-white shadow-sm">
                <MessageCircle className="h-4 w-4" />
              </span>
              {embeddedInConversas ? 'Conectar números WhatsApp' : 'Canais WhatsApp'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              {embeddedInMiniCrm
                ? 'Conecte o WhatsApp da loja com o QR Code. As conversas passam a entrar no Mini CRM.'
                : embeddedInConversas
                ? 'Adicione canais uazapi e escaneie o QR Code com o celular de cada número. As mensagens passam a aparecer em Conversas.'
                : (
                  <>
                    Conecte suas instâncias uazapi. Depois configure o webhook para as mensagens chegarem no{' '}
                    <strong>Atendimento</strong>.
                  </>
                )}
            </p>
          </div>
          {embeddedInCrm && !embeddedInMiniCrm && (
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link to="/crm/atendimento">
                <Headphones className="h-4 w-4 mr-2" />
                Ir para Atendimento
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          )}
          {embeddedInConversas && (
            <Button variant="outline" size="sm" className="shrink-0 sm:hidden" asChild>
              <Link to={conversasInboxPath}>Ir para Conversas</Link>
            </Button>
          )}
        </div>

        {!embeddedInMiniCrm && (
          <ol className="grid list-none gap-3 sm:grid-cols-3">
            <li className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl jb-gradient-bg text-white shadow-sm">
                <QrCode className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">1. Conectar</span>
                <span className="block text-xs text-muted-foreground leading-snug">Escaneie o QR Code no celular.</span>
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl jb-gradient-bg text-white shadow-sm">
                <Link2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">2. Receber</span>
                <span className="block text-xs text-muted-foreground leading-snug">Ligue o recebimento no número conectado.</span>
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl jb-gradient-bg text-white shadow-sm">
                <Headphones className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">3. Atender</span>
                <span className="block text-xs text-muted-foreground leading-snug">
                  Responda em <Link to={embeddedInConversas ? conversasInboxPath : '/crm/atendimento'} className="text-primary underline-offset-2 hover:underline">Conversas</Link>.
                </span>
              </span>
            </li>
          </ol>
        )}

        {isAdminWithoutCliente && !embeddedInMiniCrm && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{embeddedInConversas ? 'Operação' : 'Cliente'}</CardTitle>
              <CardDescription>
                {embeddedInConversas ? 'Operação com atendimento WhatsApp configurado' : 'Selecione o cliente CRM'}
              </CardDescription>
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

        <Tabs value={embeddedInMiniCrm ? 'conectar' : canaisTab} onValueChange={embeddedInMiniCrm ? undefined : setCanaisTab} className="w-full">
          {!embeddedInMiniCrm && (
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="conectar" className="text-xs sm:text-sm py-2.5 gap-1.5">
                <Plug className="h-4 w-4 shrink-0" />
                Conectar
              </TabsTrigger>
              <TabsTrigger value="webhook" className="text-xs sm:text-sm py-2.5 gap-1.5">
                <Link2 className="h-4 w-4 shrink-0" />
                Receber msgs
              </TabsTrigger>
              <TabsTrigger value="integracoes" className="text-xs sm:text-sm py-2.5 gap-1.5">
                <Settings2 className="h-4 w-4 shrink-0" />
                Integrações
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="conectar" className={`${embeddedInMiniCrm ? 'mt-0' : 'mt-4'} space-y-4`}>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando canais…
              </div>
            ) : configs.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {embeddedInMiniCrm
                      ? 'Nenhum WhatsApp ainda. Informe a URL da instância para conectar.'
                      : 'Nenhum canal ainda. Adicione subdomínio e token da uazapi.'}
                  </p>
                  <Button onClick={() => setAddChannelOpen(true)}>
                    {embeddedInMiniCrm ? 'Conectar WhatsApp' : 'Adicionar canal'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))]">
                  {(embeddedInMiniCrm ? configs.slice(0, 1) : configs).map((cfg, idx) => {
                    const rawChannel = channelDataByConfigId[cfg.id];
                    const fp = configFingerprint(cfg);
                    const channelDataC = rawChannel?.fingerprint === fp ? rawChannel : null;
                    const connectResponseC = connectResponseByConfigId[cfg.id];
                    const qrImageSrcC = qrImageSrcByConfigId[cfg.id];
                    const connecting = connectingConfigId === cfg.id;
                    const pulling = pullingConfigId === cfg.id;
                    const disconnecting = disconnectingConfigId === cfg.id;
                    const configuringWebhook = webhookConfiguringConfigId === cfg.id;
                    const canalLabel = cfg.name?.trim() || `Canal ${idx + 1}`;
                    const isDuplicateToken = !embeddedInMiniCrm && duplicateTokenConfigIds.has(cfg.id);
                    const isConnected = channelDataC && (channelDataC.number || channelDataC.profileName || channelDataC.instanceName);
                    const webhookOk = !!cfg.webhook_secret;
                    const instanceStatus = String(cfg.instance_status || '').toLowerCase();
                    const isInstanceDown = !isConnected && instanceStatus === 'disconnected';
                    const needsInstance = !cfg.subdomain?.trim() || !cfg.token?.trim();
                    return (
                      <Card key={cfg.id} className="flex flex-col overflow-hidden">
                        <div className={`h-1.5 ${isConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-base truncate">{canalLabel}</CardTitle>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {isConnected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
                                  </span>
                                ) : isInstanceDown ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    <Clock className="h-3.5 w-3.5" /> Desconectado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    <Clock className="h-3.5 w-3.5" /> Aguardando QR
                                  </span>
                                )}
                                {isConnected && webhookOk ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                    <Link2 className="h-3 w-3" /> Recebendo msgs
                                  </span>
                                ) : isConnected ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Falta ligar o recebimento</span>
                                ) : null}
                              </div>
                            </div>
                            {!embeddedInMiniCrm && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Alterar token" onClick={() => openEditChannel(cfg)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Remover canal"
                                  onClick={async () => {
                                    if (!window.confirm(`Remover o canal "${canalLabel}"?`)) return;
                                    await deleteConfig(cfg.id);
                                    setChannelDataByConfigId((prev) => {
                                      const next = { ...prev };
                                      delete next[cfg.id];
                                      return next;
                                    });
                                    delete statusFetchGenRef.current[cfg.id];
                                  }}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {isDuplicateToken && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                              Mesmo token de outro canal — ambos mostram o mesmo WhatsApp.
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                          {embeddedInMiniCrm && needsInstance && (
                            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                              <p className="text-xs text-muted-foreground">Informe a instância para ligar o WhatsApp.</p>
                              <div className="space-y-2">
                                <Label htmlFor={`mini-sub-${cfg.id}`}>URL / subdomínio</Label>
                                <Input
                                  id={`mini-sub-${cfg.id}`}
                                  placeholder="ex.: sua-loja (de https://sua-loja.uazapi.com)"
                                  defaultValue={cfg.subdomain?.trim() || ''}
                                  onBlur={async (e) => {
                                    const sub = e.target.value.trim();
                                    if (!sub || sub === (cfg.subdomain || '').trim()) return;
                                    if (!cfg.token?.trim()) return;
                                    await saveConfig(sub, cfg.token.trim(), { configId: cfg.id, name: cfg.name });
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`mini-name-${cfg.id}`}>Nome da instância</Label>
                                <Input
                                  id={`mini-name-${cfg.id}`}
                                  placeholder="Ex.: JR CAR"
                                  defaultValue={cfg.name?.trim() || ''}
                                  onBlur={async (e) => {
                                    const name = e.target.value.trim();
                                    if (name === (cfg.name || '').trim()) return;
                                    if (!cfg.subdomain?.trim() || !cfg.token?.trim()) return;
                                    await saveConfig(cfg.subdomain.trim(), cfg.token.trim(), { configId: cfg.id, name });
                                  }}
                                />
                              </div>
                              {!cfg.token?.trim() && (
                                <div className="space-y-2">
                                  <Label htmlFor={`mini-tok-${cfg.id}`}>Chave da instância</Label>
                                  <Input
                                    id={`mini-tok-${cfg.id}`}
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Colada pelo gestor, se necessário"
                                    onBlur={async (e) => {
                                      const tok = e.target.value.trim();
                                      if (!tok || !cfg.subdomain?.trim()) return;
                                      await saveConfig(cfg.subdomain.trim(), tok, { configId: cfg.id, name: cfg.name });
                                      e.target.value = '';
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {!isConnected && !needsInstance && (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-6 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
                              {qrImageSrcC ? (
                                <img src={qrImageSrcC} alt="QR Code WhatsApp" className="w-[200px] rounded-xl border bg-white p-2 shadow-sm" />
                              ) : (
                                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm dark:bg-amber-950">
                                  <QrCode className="h-8 w-8" />
                                </span>
                              )}
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Escaneie o QR no celular</p>
                                <p className="text-xs text-muted-foreground leading-snug">
                                  WhatsApp, Aparelhos conectados, e aponte a câmera.
                                </p>
                                {webhookOk ? (
                                  <p className="text-xs text-muted-foreground leading-snug">
                                    O recebimento já está configurado.
                                  </p>
                                ) : null}
                              </div>
                              {connectResponseC?.error && !qrImageSrcC ? (
                                <p className="text-xs text-destructive">{connectResponseC.error}</p>
                              ) : null}
                              <div className="flex flex-wrap justify-center gap-2">
                                <Button size="sm" onClick={() => handleConnectWhatsAppWithStatusFirst(cfg)} disabled={connecting}>
                                  {connecting ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Conectando…</> : 'Gerar QR Code'}
                                </Button>
                                <Button variant="outline" size="sm" className="bg-white" onClick={() => fetchStatusOnly(cfg)} disabled={pulling || connecting}>
                                  {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Atualizar'}
                                </Button>
                              </div>
                            </div>
                          )}
                          {isConnected && (
                            <div className="flex flex-1 flex-col gap-3">
                              <div className="flex flex-1 items-center gap-3 rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-3 dark:from-emerald-950/30 dark:to-transparent">
                                <Avatar className="h-14 w-14 shrink-0 ring-2 ring-white shadow-sm">
                                  <AvatarImage src={channelDataC.profilePicUrl || undefined} alt="" />
                                  <AvatarFallback className="text-base">{(channelDataC.profileName || canalLabel).charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  {channelDataC.profileName && (
                                    <p className="text-sm font-semibold truncate">{channelDataC.profileName}</p>
                                  )}
                                  {channelDataC.number && (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                      <Phone className="h-3 w-3 shrink-0" />
                                      {formatPhoneDisplay(channelDataC.number)}
                                    </p>
                                  )}
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 bg-white/80" title="Atualizar" onClick={() => fetchStatusOnly(cfg)} disabled={pulling || disconnecting}>
                                  {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                              {!webhookOk ? (
                                <Button
                                  size="sm"
                                  className="w-full"
                                  disabled={configuringWebhook || disconnecting}
                                  onClick={() => handleSetupWebhook(cfg)}
                                >
                                  {configuringWebhook ? (
                                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Configurando…</>
                                  ) : (
                                    <><Link2 className="h-3 w-3 mr-1" /> Ativar recebimento de mensagens</>
                                  )}
                                </Button>
                              ) : null}
                              {!embeddedInMiniCrm && (
                                <div className="mt-auto flex flex-wrap items-center gap-x-1 gap-y-1 border-t pt-2">
                                  {webhookOk ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs text-muted-foreground"
                                      disabled={configuringWebhook}
                                      onClick={() => handleSetupWebhook(cfg)}
                                    >
                                      {configuringWebhook ? 'Reconfigurando…' : 'Reconfigurar recebimento'}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-muted-foreground"
                                    disabled={disconnecting || connecting}
                                    onClick={() => handleDisconnectWhatsApp(cfg)}
                                  >
                                    {disconnecting ? 'Desconectando…' : 'Trocar número'}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {!embeddedInMiniCrm && (
                  <Button variant="outline" onClick={() => setAddChannelOpen(true)}>
                    + Adicionar outro canal
                  </Button>
                )}
              </>
            )}
          </TabsContent>

          {!embeddedInMiniCrm && (
          <>
          <TabsContent value="webhook" className="mt-4 space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                Avançado: URL do webhook e SSE. Na aba <strong>Conectar</strong>, use <strong>Ativar recebimento</strong> no card — é mais rápido.
                Mensagens aparecem em <Link to="/crm/atendimento" className="text-primary font-medium underline-offset-2 hover:underline">Atendimento</Link>.
              </AlertDescription>
            </Alert>
            {configs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Adicione um canal na aba Conectar primeiro.</p>
            ) : (
              configs.filter((c) => c.subdomain && c.token).map((cfg, idx) => {
                const canalLabel = cfg.name?.trim() || `Canal ${idx + 1}`;
                const configuringWebhook = webhookConfiguringConfigId === cfg.id;
                return (
                  <Card key={cfg.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{canalLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Radio className="h-3.5 w-3.5" />
                          SSE (opcional — prefira webhook)
                        </Label>
                        <Switch checked={!!cfg.use_sse} onCheckedChange={(checked) => setUseSse(checked, cfg.id)} />
                      </div>
                      {cfg.webhook_secret ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input readOnly value={getWebhookUrlForConfig(cfg)} className="font-mono text-xs flex-1" />
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="icon" title="Copiar" onClick={() => { navigator.clipboard.writeText(getWebhookUrlForConfig(cfg)); toast({ title: 'URL copiada' }); }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="default" size="sm" disabled={Boolean(webhookConfiguringConfigId)} onClick={() => handleSetupWebhook(cfg)}>
                              {configuringWebhook ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                              Configurar na uazapi
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => generateWebhookSecret(cfg.id)}>
                          Gerar URL do webhook
                        </Button>
                      )}
                      {canConfigureCsGroups && cfg.provider === 'uazapi' && cfg.webhook_secret && !cfg.archived_at && !duplicateTokenConfigIds.has(cfg.id) && (
                        <div className="space-y-1">
                          <Button type="button" variant="outline" size="sm" disabled={Boolean(webhookConfiguringConfigId)} onClick={() => handleSetupWebhook(cfg, true)}>
                            Ativar saídas no CS IA
                          </Button>
                          <p className="text-xs text-muted-foreground">Inclui eventos de grupo neste webhook. O CS registra a data da saída nos grupos vinculados.</p>
                        </div>
                      )}
                      {uazapiWebhookLogs.length > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Último evento: {formatLastEventAgo(uazapiWebhookLogs[0].created_at)} — webhook funcionando
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
            {configs.length > 0 && uazapiWebhookLogs.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Log detalhado de eventos na aba <button type="button" className="text-primary underline" onClick={() => setCanaisTab('integracoes')}>Integrações</button>.
              </p>
            )}
          </TabsContent>

          <TabsContent value="integracoes" className="mt-4 space-y-6">
            <p className="text-sm text-muted-foreground">
              Meta, Google Drive, CRMs externos e diagnóstico. Só configure se você usa essas integrações.
            </p>
            {effectiveClienteId && <ClienteMetaCtwaSettings clienteId={effectiveClienteId} />}
            {effectiveClienteId && <ClienteGoogleDriveSettings clienteId={effectiveClienteId} />}
            {effectiveClienteId && <ClienteIngressWebhookSettings clienteId={effectiveClienteId} configs={configs} />}

            {configs.length > 0 && effectiveClienteId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Conversões Meta por canal</CardTitle>
                  <CardDescription>CAPI / dataset por instância WhatsApp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {configs.map((cfg) => (
                    <MetaConversionsChannelSettings key={cfg.id} config={cfg} clienteId={effectiveClienteId} onSaved={fetchConfig} />
                  ))}
                </CardContent>
              </Card>
            )}

            {configs.length > 0 && effectiveClienteId && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Encaminhar para CRM-Apice
                    </CardTitle>
                    <CardDescription>Opcional — espelha eventos no CRM-Apice</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {crmApiceForwardLoading ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Carregando…</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs">URL do Webhook Genérico (CRM-Apice)</Label>
                          <Input
                            type="url"
                            placeholder="https://.../generic-webhook?..."
                            value={crmApiceForwardUrl}
                            onChange={(e) => setCrmApiceForwardUrl(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Switch id="crm-apice-forward-enabled" checked={crmApiceForwardEnabled} onCheckedChange={setCrmApiceForwardEnabled} />
                            <Label htmlFor="crm-apice-forward-enabled" className="text-xs">Ativar encaminhamento</Label>
                          </div>
                          <Button size="sm" disabled={crmApiceForwardSaving} onClick={saveCrmApiceForward}>
                            {crmApiceForwardSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Salvar
                          </Button>
                        </div>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Status do lead em Contatos (retorno CRM-Apice → Planeje)</summary>
                          <div className="mt-3 space-y-2 pl-1 border-l-2 border-muted ml-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <code className="text-[10px] break-all bg-muted px-2 py-1 rounded flex-1 min-w-0">{crmApiceStatusWebhookUrl}</code>
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { void navigator.clipboard.writeText(crmApiceStatusWebhookUrl); toast({ title: 'URL copiada' }); }}>
                                <Copy className="h-3 w-3 mr-1" /> Copiar
                              </Button>
                            </div>
                            <Button type="button" size="sm" className="h-7 text-xs" disabled={crmApiceStatusSecretSaving} onClick={() => void generateCrmApiceStatusSecret()}>
                              Gerar secret de retorno
                            </Button>
                          </div>
                        </details>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Log de eventos (diagnóstico)
                      </CardTitle>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uazapiLogsRefreshing} onClick={async () => { setUazapiLogsRefreshing(true); await fetchWebhookLogs(); setUazapiLogsRefreshing(false); }}>
                        {uazapiLogsRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Atualizar'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {uazapiWebhookLogs.length > 0 ? (
                      <div className="rounded-md border bg-muted/30 p-2 space-y-1 max-h-56 overflow-y-auto">
                        {uazapiWebhookLogs.slice(0, 30).map((log) => {
                          const sending = sendToCrmLoadingLogId === log.id;
                          return (
                            <div key={log.id} className="text-xs rounded px-2 py-1.5 bg-background border flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground shrink-0">
                                {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${log.status === 'ok' ? 'bg-green-500/20 text-green-700' : 'bg-destructive/20 text-destructive'}`}>{log.status}</span>
                              {log.from_jid && <span className="font-mono truncate max-w-[120px]" title={log.from_jid}>{log.from_jid}</span>}
                              <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setWebhookLogViewing(log)}>Ver</Button>
                              <Button variant="outline" size="sm" className="h-6 px-1 text-[10px]" onClick={() => sendEventToCrmApice(log, 'uazapi')} disabled={sending}>
                                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'CRM'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum evento ainda. Configure o webhook e envie uma mensagem de teste.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
          </>
          )}
        </Tabs>

        <Dialog open={addChannelOpen} onOpenChange={(open) => { setAddChannelOpen(open); if (!open) { setAddChannelName(''); setAddChannelSubdomain(''); setAddChannelToken(''); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{embeddedInMiniCrm ? 'Conectar WhatsApp' : 'Adicionar canal'}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {embeddedInMiniCrm
                  ? 'Informe a URL da instância e o nome. A chave fica oculta.'
                  : 'Nova API uazapi (subdomínio e token). Cada canal pode ter sua própria instância WhatsApp.'}
              </p>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="add-channel-name">{embeddedInMiniCrm ? 'Nome da instância' : 'Nome do canal (opcional)'}</Label>
                <Input
                  id="add-channel-name"
                  placeholder={embeddedInMiniCrm ? 'Ex.: JR CAR' : 'Ex: Vendas, Suporte'}
                  value={addChannelName}
                  onChange={(e) => setAddChannelName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-channel-subdomain">{embeddedInMiniCrm ? 'URL / subdomínio' : 'Subdomínio uazapi'}</Label>
                <Input
                  id="add-channel-subdomain"
                  placeholder={embeddedInMiniCrm ? 'ex.: sua-loja (de https://sua-loja.uazapi.com)' : 'seu-subdominio (de https://seu-subdominio.uazapi.com)'}
                  value={addChannelSubdomain}
                  onChange={(e) => setAddChannelSubdomain(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-channel-token">{embeddedInMiniCrm ? 'Chave da instância' : 'Token'}</Label>
                <Input
                  id="add-channel-token"
                  type="password"
                  autoComplete="new-password"
                  placeholder={embeddedInMiniCrm ? 'Colada pelo gestor, se necessário' : 'Token da instância'}
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
                  {embeddedInMiniCrm ? 'Salvar e continuar' : 'Adicionar canal'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editChannelOpen} onOpenChange={(open) => { setEditChannelOpen(open); if (!open) setEditChannelCfg(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Alterar credenciais do canal</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Cada token na uazapi aponta para uma instância (e um número). Ao trocar o token, o número exibido muda conforme a uazapi.
              </p>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="edit-channel-name">Nome do canal (opcional)</Label>
                <Input
                  id="edit-channel-name"
                  value={editChannelName}
                  onChange={(e) => setEditChannelName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-channel-subdomain">Subdomínio uazapi</Label>
                <Input
                  id="edit-channel-subdomain"
                  placeholder="novo22"
                  value={editChannelSubdomain}
                  onChange={(e) => setEditChannelSubdomain(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-channel-token">Token da instância</Label>
                <Input
                  id="edit-channel-token"
                  type="password"
                  placeholder="Token da uazapi"
                  value={editChannelToken}
                  onChange={(e) => setEditChannelToken(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditChannelOpen(false)}>Cancelar</Button>
                <Button
                  disabled={editChannelSaving || !editChannelCfg || !editChannelSubdomain?.trim() || !editChannelToken?.trim()}
                  onClick={async () => {
                    if (!editChannelCfg) return;
                    setEditChannelSaving(true);
                    const cid = editChannelCfg.id;
                    statusFetchGenRef.current[cid] = (statusFetchGenRef.current[cid] || 0) + 1;
                    setChannelDataByConfigId((prev) => {
                      const next = { ...prev };
                      delete next[cid];
                      return next;
                    });
                    const { success } = await saveConfig(
                      editChannelSubdomain.trim(),
                      editChannelToken.trim(),
                      { configId: cid, name: editChannelName.trim() || undefined }
                    );
                    setEditChannelSaving(false);
                    if (success) {
                      setEditChannelOpen(false);
                      setEditChannelCfg(null);
                      toast({ title: 'Credenciais salvas', description: 'Consultando status na uazapi…' });
                    }
                  }}
                >
                  {editChannelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar e atualizar
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
