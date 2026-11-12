import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import { resolveEffectiveLink } from '@/lib/funilNodeGraph';
import {
  buildWaMeUrl,
  channelConnectionTone,
  getUtmFromEffectiveLink,
} from '@/lib/funilWhatsApp';

function parseUazapiStatusPhone(data) {
  if (!data || typeof data !== 'object') return null;
  const connected =
    data.connected === true ||
    data.status?.loggedIn === true ||
    data.instance?.status === 'connected';
  if (!connected) return null;
  const jid = data.jid ?? data.instance?.jid ?? data.status?.jid;
  if (!jid) return null;
  const digits = String(jid).replace(/@.*$/, '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

function getUazapiBaseUrl(subdomain) {
  if (!subdomain?.trim()) return null;
  const host = subdomain
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/\.uazapi\.com$/i, '');
  return host ? `https://${host}.uazapi.com` : null;
}

async function fetchChannelPhoneFromUazapi(config) {
  const baseUrl = getUazapiBaseUrl(config?.subdomain);
  const token = config?.token?.trim();
  if (!baseUrl || !token) return null;
  try {
    const res = await fetch(`${baseUrl}/instance/status`, {
      headers: { token, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return parseUazapiStatusPhone(data);
  } catch {
    return null;
  }
}

function StatusPill({ status }) {
  const tone = channelConnectionTone(status);
  const labels = {
    connected: 'Conectado',
    connecting: 'Conectando',
    disconnected: 'Desconectado',
  };
  const label = labels[status] || status || 'Desconhecido';
  const Icon = status === 'connected' ? Wifi : WifiOff;
  return (
    <span className={`funil-wa-status funil-wa-status--${tone}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export default function FunilWhatsAppSection({
  node,
  nodes = [],
  edges = [],
  clienteId,
  whatsappChannel,
  onWhatsAppChannelChange,
  onUrlChange,
}) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [fetchingPhone, setFetchingPhone] = useState(false);

  const effective = useMemo(
    () => resolveEffectiveLink(node, nodes, edges),
    [node, nodes, edges]
  );

  const utm = useMemo(() => getUtmFromEffectiveLink(effective), [effective]);

  const loadChannels = useCallback(async () => {
    if (!clienteId) {
      setChannels([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('cliente_whatsapp_config')
        .select('id, name, subdomain, token, instance_status, provider, created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setChannels(data || []);
    } catch (e) {
      setLoadError(e?.message || 'Erro ao carregar canais');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const applyChannel = useCallback(
    async (config, { silent } = {}) => {
      if (!config) {
        onWhatsAppChannelChange?.(null);
        return;
      }
      setFetchingPhone(true);
      let phone = whatsappChannel?.configId === config.id ? whatsappChannel.phone : null;
      if (!phone && config.subdomain && config.token) {
        phone = await fetchChannelPhoneFromUazapi(config);
      }
      const waUrl = phone ? buildWaMeUrl(phone, utm) : '';
      const next = {
        configId: config.id,
        channelName: config.name?.trim() || 'Canal WhatsApp',
        instanceStatus: config.instance_status || null,
        subdomain: config.subdomain || null,
        provider: config.provider || 'uazapi',
        phone: phone || null,
        waUrl,
        linkedAt: new Date().toISOString(),
      };
      onWhatsAppChannelChange?.(next);
      if (waUrl) onUrlChange?.(waUrl);
      setFetchingPhone(false);
      if (!silent && !phone) {
        // canal sem número — usuário pode colar manualmente na URL
      }
    },
    [onWhatsAppChannelChange, onUrlChange, utm, whatsappChannel?.configId, whatsappChannel?.phone]
  );

  // Auto-seleciona o primeiro canal se o nó ainda não tem vínculo
  useEffect(() => {
    if (!clienteId || loading || channels.length === 0) return;
    if (whatsappChannel?.configId) return;
    void applyChannel(channels[0], { silent: true });
  }, [clienteId, loading, channels, whatsappChannel?.configId, applyChannel]);

  // Atualiza wa.me quando UTMs herdadas mudam e já há telefone
  useEffect(() => {
    if (!whatsappChannel?.phone) return;
    const waUrl = buildWaMeUrl(whatsappChannel.phone, utm);
    if (waUrl && waUrl !== whatsappChannel.waUrl) {
      onWhatsAppChannelChange?.({ ...whatsappChannel, waUrl });
      onUrlChange?.(waUrl);
    }
  }, [utm.utm_source, utm.utm_medium, utm.utm_campaign]);

  const handleSelect = (configId) => {
    const cfg = channels.find((c) => c.id === configId);
    if (cfg) void applyChannel(cfg);
  };

  const handleRefreshPhone = () => {
    const cfg = channels.find((c) => c.id === whatsappChannel?.configId);
    if (cfg) void applyChannel(cfg);
  };

  if (!clienteId) {
    return (
      <Alert className="funil-wa-alert">
        <AlertDescription className="text-xs">
          Selecione um cliente no hub para carregar os canais WhatsApp.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="funil-whatsapp-connect">
      <div className="funil-whatsapp-connect__head">
        <MessageCircle className="h-4 w-4 text-[#25D366]" />
        <span className="funil-whatsapp-connect__title">WhatsApp do cliente</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-auto shrink-0"
          onClick={loadChannels}
          disabled={loading}
          title="Recarregar canais"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {loadError && (
        <p className="text-xs text-destructive">{loadError}</p>
      )}

      {loading && channels.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando canais…
        </div>
      ) : channels.length === 0 ? (
        <div className="funil-whatsapp-connect__empty text-xs text-muted-foreground space-y-2">
          <p>Nenhum canal WhatsApp configurado para este cliente.</p>
          <Link
            to="/client-area/crm/canais"
            className="text-primary inline-flex items-center gap-1 hover:underline font-medium"
          >
            Configurar em CRM → Canais
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <>
          <div className="np-field">
            <Label className="np-label">Canal uazapi</Label>
            <Select
              value={whatsappChannel?.configId || ''}
              onValueChange={handleSelect}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o canal" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name?.trim() || 'Canal'} · {c.instance_status || '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {whatsappChannel?.configId && (
            <div className="funil-whatsapp-connect__detail space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={whatsappChannel.instanceStatus} />
                {fetchingPhone && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
              {whatsappChannel.phone ? (
                <p className="text-xs text-foreground font-medium tabular-nums">
                  Número: +{whatsappChannel.phone.replace(/\D/g, '')}
                </p>
              ) : (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Conecte o canal em Canais e clique em &quot;Buscar número&quot; ou informe a URL manualmente.
                </p>
              )}
              {(utm.utm_campaign || utm.utm_source) && (
                <p className="text-[10px] text-muted-foreground leading-snug">
                  UTMs herdadas: {utm.utm_source || '—'} / {utm.utm_medium || '—'} /{' '}
                  {utm.utm_campaign || '—'}
                </p>
              )}
              {whatsappChannel.waUrl && (
                <a
                  href={whatsappChannel.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary break-all hover:underline inline-flex items-start gap-1"
                >
                  {whatsappChannel.waUrl}
                  <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleRefreshPhone}
                  disabled={fetchingPhone}
                >
                  Buscar número na uazapi
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
