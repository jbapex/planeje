import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Radio, Activity, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RastreamentoHelp } from '@/components/crm/RastreamentoUi';

const EVENT_LIVE_MS = 15 * 60 * 1000;
const EVENT_RECENT_MS = 24 * 60 * 60 * 1000;

function formatAgo(dateStr) {
  if (!dateStr) return null;
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `há ${Math.floor(sec / 3600)} h`;
  return `há ${Math.floor(sec / 86400)} dia(s)`;
}

function eventReceptionLevel(lastAt) {
  if (!lastAt) return { key: 'never', label: 'Nenhum evento registrado', tone: 'muted' };
  const age = Date.now() - new Date(lastAt).getTime();
  if (age <= EVENT_LIVE_MS) return { key: 'live', label: 'Recebendo eventos', tone: 'success' };
  if (age <= EVENT_RECENT_MS) return { key: 'recent', label: 'Eventos recentes', tone: 'warning' };
  return { key: 'stale', label: 'Sem eventos recentes', tone: 'danger' };
}

function channelConnectionLabel(status) {
  if (status === 'connected') return { label: 'Conectado', tone: 'success' };
  if (status === 'connecting') return { label: 'Conectando', tone: 'warning' };
  if (status === 'disconnected') return { label: 'Desconectado', tone: 'danger' };
  return { label: 'Status desconhecido', tone: 'muted' };
}

function ToneBadge({ tone, children, className }) {
  const tones = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/35 dark:text-green-300 border-green-200/80 dark:border-green-800',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-300 border-amber-200/80 dark:border-amber-800',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/35 dark:text-red-300 border-red-200/80 dark:border-red-800',
    muted: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200/80 dark:border-slate-700',
  };
  return (
    <Badge variant="outline" className={cn('text-xs font-medium gap-1', tones[tone] || tones.muted, className)}>
      {children}
    </Badge>
  );
}

/**
 * Status do canal WhatsApp do cliente: configurado, conexão (instance_status) e último evento no webhook.
 */
export default function ClienteWhatsAppChannelStatus({ clienteId, empresaNome, compact = false, extra = null }) {
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [events24h, setEvents24h] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId) {
      setChannels([]);
      setLastEvent(null);
      setEvents24h(null);
      return;
    }
    setLoading(true);
    const since24h = new Date(Date.now() - EVENT_RECENT_MS).toISOString();
    try {
      const [cfgRes, logRes, countRes] = await Promise.all([
        supabase
          .from('cliente_whatsapp_config')
          .select('id, name, instance_status, subdomain, token, webhook_secret, updated_at')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: true }),
        supabase
          .from('cliente_whatsapp_webhook_log')
          .select('created_at, status, source')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('cliente_whatsapp_webhook_log')
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', clienteId)
          .gte('created_at', since24h),
      ]);
      setChannels(cfgRes.data || []);
      setLastEvent(logRes.data || null);
      setEvents24h(typeof countRes.count === 'number' ? countRes.count : null);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!clienteId) return;
    const channel = supabase
      .channel(`canal-status:${clienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_webhook_log', filter: `cliente_id=eq.${clienteId}` },
        (payload) => {
          const row = payload.new;
          setLastEvent({ created_at: row.created_at, status: row.status, source: row.source });
          setEvents24h((n) => (typeof n === 'number' ? n + 1 : n));
        }
      )
      .subscribe();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [clienteId, load]);

  if (!clienteId) return null;

  const configured = channels.filter((c) => c.subdomain?.trim() && c.token?.trim());
  const reception = eventReceptionLevel(lastEvent?.created_at);
  const compactReceptionLabel = {
    live: 'Ao vivo',
    recent: 'Recente',
    stale: 'Parado',
    never: 'Sem eventos',
  }[reception.key] || reception.label;
  const hasConfig = configured.length > 0;
  const connectedCount = configured.filter((c) => c.instance_status === 'connected').length;
  const anyConnected = connectedCount > 0;
  const webhookReady = configured.some((c) => c.webhook_secret?.trim());

  if (compact) {
    return (
      <div className="rt-wa-status">
        <div className="rt-wa-status__main">
          <Radio className="h-3.5 w-3.5 text-violet-500 shrink-0" />
          <span className="rt-wa-status__label">WhatsApp</span>
          {loading && !channels.length ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : hasConfig ? (
            configured.map((channel, idx) => {
              const conn = channelConnectionLabel(channel.instance_status);
              return (
                <ToneBadge key={channel.id} tone={conn.tone} className="h-6 px-2">
                  {conn.tone === 'success' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {channel.name?.trim() || `Canal ${idx + 1}`}
                  <span className="font-normal opacity-80">· {conn.label}</span>
                </ToneBadge>
              );
            })
          ) : (
            <ToneBadge tone="danger" className="h-6 px-2">
              <AlertTriangle className="h-3 w-3" />
              Sem canal
            </ToneBadge>
          )}
          {hasConfig && !webhookReady ? (
            <ToneBadge tone="warning" className="h-6 px-2">Webhook sem secret</ToneBadge>
          ) : null}
          <ToneBadge tone={reception.tone} className="h-6 px-2">
            <Activity className="h-3 w-3" />
            {compactReceptionLabel}
            {lastEvent?.created_at ? ` · ${formatAgo(lastEvent.created_at)}` : ''}
          </ToneBadge>
          {typeof events24h === 'number' ? (
            <span className="rt-wa-status__count">{events24h} / 24h</span>
          ) : null}
        </div>
        <div className="rt-wa-status__tools">
          {extra}
          <RastreamentoHelp label="Sobre o canal WhatsApp">
            Conexão da instância Uazapi e se o webhook está registrando mensagens
            {empresaNome ? ` de ${empresaNome}` : ''}.
          </RastreamentoHelp>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={load}
            disabled={loading}
            aria-label="Atualizar status do canal"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white dark:bg-card p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            Status do canal WhatsApp
            {empresaNome ? <span className="font-normal text-muted-foreground">— {empresaNome}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conexão da instância (uazapi/Apicebot) e se o webhook está registrando mensagens.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <ToneBadge tone={hasConfig ? 'success' : 'danger'}>
          {hasConfig ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {hasConfig ? `${configured.length} canal(is) configurado(s)` : 'Canal não configurado'}
        </ToneBadge>

        {hasConfig && (
          <ToneBadge tone={anyConnected ? 'success' : 'danger'}>
            {anyConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {anyConnected
              ? `${connectedCount} de ${configured.length} conectado(s)`
              : 'WhatsApp desconectado'}
          </ToneBadge>
        )}

        {hasConfig && (
          <ToneBadge tone={webhookReady ? 'success' : 'warning'}>
            {webhookReady ? 'Webhook configurado' : 'Webhook sem secret'}
          </ToneBadge>
        )}

        <ToneBadge tone={reception.tone}>
          <Activity className="h-3 w-3" />
          {reception.label}
          {lastEvent?.created_at ? ` · ${formatAgo(lastEvent.created_at)}` : ''}
        </ToneBadge>

        {typeof events24h === 'number' && (
          <ToneBadge tone="muted">
            {events24h} evento(s) nas últimas 24h
          </ToneBadge>
        )}
      </div>

      {hasConfig && configured.length <= 4 && (
        <ul className="space-y-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700/50">
          {configured.map((c, idx) => {
            const conn = channelConnectionLabel(c.instance_status);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.name?.trim() || `Canal ${idx + 1}`}</span>
                <ToneBadge tone={conn.tone}>{conn.label}</ToneBadge>
                {!c.webhook_secret?.trim() && <span className="text-amber-700 dark:text-amber-400">· gere o secret em Canais</span>}
              </li>
            );
          })}
        </ul>
      )}

      {!hasConfig && (
        <p className="text-xs text-muted-foreground">
          Configure subdomínio e token em{' '}
          <Link to="/client-area/crm/canais" className="text-primary hover:underline inline-flex items-center gap-0.5">
            Área do Cliente → CRM → Canais <ExternalLink className="h-3 w-3" />
          </Link>
          {' '}para este cliente.
        </p>
      )}

      {hasConfig && reception.key === 'never' && anyConnected && (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 rounded-lg px-3 py-2">
          Canal marcado como conectado, mas ainda não há eventos no log. Confira se a URL do webhook está na uazapi e envie uma mensagem de teste.
        </p>
      )}

      {hasConfig && reception.key === 'stale' && (
        <p className="text-xs text-muted-foreground">
          Último evento:{' '}
          {lastEvent?.created_at
            ? new Date(lastEvent.created_at).toLocaleString('pt-BR')
            : '—'}
          {lastEvent?.status ? ` (${lastEvent.status})` : ''}.
        </p>
      )}
    </div>
  );
}
