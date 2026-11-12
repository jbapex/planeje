import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, MessageCircle, MousePointerClick, Radio, Send } from 'lucide-react';
import { fetchClienteMetaCtwaSettings } from '@/lib/metaCtwaClientToken';
import { supabase } from '@/lib/customSupabaseClient';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';

function Tile({ ok, title, detail, icon: Icon }) {
  return (
    <div className="rt-tile">
      <div className="flex items-start gap-2 pt-1">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950 dark:text-white flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            {title}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-slate-500 dark:text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Mapa TRACK: Meta Ads, fonte WhatsApp, destino CAPI e última etapa do pipeline.
 */
export default function RastreamentoConexoesMap({ clienteId }) {
  const [state, setState] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId) {
      setState(null);
      return;
    }
    const [meta, channelsRes, eventsRes] = await Promise.all([
      fetchClienteMetaCtwaSettings(clienteId).catch(() => ({ hasToken: false, connection: null })),
      supabase
        .from('cliente_whatsapp_config')
        .select('id, name, instance_status, webhook_secret, archived_at')
        .eq('cliente_id', clienteId),
      supabase
        .from('meta_conversion_event_log')
        .select('id, success, event_name, created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    const channels = (channelsRes.data || []).filter((channel) => !channel.archived_at);
    const withSecret = channels.filter((c) => c.webhook_secret);
    const connected = channels.filter((c) => c.instance_status === 'connected');
    const last = eventsRes.data?.[0] || null;
    const conn = meta?.connection || {};
    const destReady = Boolean(conn.pixelId && conn.pageId);
    setState({
      hasToken: Boolean(meta?.hasToken),
      tokenLast4: conn.tokenLast4 || '',
      businessName: conn.businessName || conn.businessId || '',
      accountCount: Array.isArray(conn.adAccountIds) ? conn.adAccountIds.length : 0,
      pixelId: conn.pixelId || '',
      pageId: conn.pageId || '',
      channelCount: channels.length,
      withSecret: withSecret.length,
      connected: connected.length,
      destReady,
      last,
    });
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!clienteId) return null;
  if (!state) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastLabel = state.last
    ? `${state.last.success ? 'Enviado' : 'Tentativa'} · ${state.last.event_name}`
    : 'Nenhum evento ainda';

  return (
    <div className="rt-board space-y-3">
      <RastreamentoSectionTitle
        title="Cobertura da conexão"
        help="Clique no anúncio → mensagem na instância Uazapi → lead pago → evento CAPI. Pixel e Página ficam na Meta; gatilhos extras em Configurações. WABA não entra nesta tela."
        helpLabel="Como a cobertura é lida?"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          ok={state.hasToken}
          title="Meta Ads"
          detail={
            state.hasToken
              ? [
                  state.tokenLast4 ? `Token final ${state.tokenLast4}` : 'Token protegido',
                  state.businessName,
                  state.accountCount ? `${state.accountCount} contas` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Cole o token do System User e o ID da BM'
          }
          icon={Radio}
        />
        <Tile
          ok={state.channelCount > 0}
          title="Fonte WhatsApp"
          detail={
            state.channelCount
              ? `${state.channelCount} instância(s) Uazapi · ${state.connected} conectada(s) · ${state.withSecret} com receiver`
              : 'Nenhuma instância Uazapi neste cliente'
          }
          icon={MessageCircle}
        />
        <Tile
          ok={state.destReady}
          title="Destino CAPI"
          detail={
            state.destReady
              ? 'Pixel e Página gravados na conexão Meta'
              : 'Ative Pixel e Página na Meta'
          }
          icon={Send}
        />
        <Tile
          ok={Boolean(state.last?.success)}
          title="Última etapa"
          detail={lastLabel}
          icon={MousePointerClick}
        />
      </div>
    </div>
  );
}
