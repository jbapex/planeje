import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Radio, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import RastreamentoOverviewDashboard from '@/components/crm/RastreamentoOverviewDashboard';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';

function HealthCard({ label, value, hint, actionLabel, onAction }) {
  return (
    <div className="rastreamento-resultados__card rt-health-card">
      <p className="rastreamento-resultados__label">{label}</p>
      <p className="rastreamento-resultados__value">{value}</p>
      {hint ? <p className="rastreamento-resultados__hint">{hint}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="link" className="h-auto px-0 mt-1 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Visão geral do rastreamento: cockpit Meta × WhatsApp + saúde CTWA/CAPI.
 */
export default function RastreamentoVisaoGeral({ clienteId, onOpenTab, since, until, onPeriodChange }) {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId) {
      setHealth(null);
      return;
    }
    setLoading(true);
    try {
      const [channelsRes, eventsRes] = await Promise.all([
        supabase
          .from('cliente_whatsapp_config')
          .select('id, name, meta_conversions_enabled, meta_waba_id, meta_dataset_id, meta_page_id')
          .eq('cliente_id', clienteId),
        supabase
          .from('meta_conversion_event_log')
          .select('id, success, event_name, created_at, error_message')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const channels = channelsRes.data || [];
      const events = eventsRes.data || [];
      const enabled = channels.filter((c) => c.meta_conversions_enabled);
      const ready = enabled.filter((c) => (c.meta_page_id || c.meta_waba_id) && c.meta_dataset_id);
      const sent = events.filter((e) => e.success).length;
      const failed = events.filter((e) => !e.success).length;

      setHealth({
        channelCount: channels.length,
        enabledCount: enabled.length,
        readyCount: ready.length,
        eventCount: events.length,
        sent,
        failed,
        lastAt: events[0]?.created_at || null,
        lastError: events.find((e) => !e.success)?.error_message || null,
        channelError: channelsRes.error?.message || null,
        eventError: eventsRes.error?.message || null,
      });
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastLabel = useMemo(() => {
    if (!health?.lastAt) return 'Nenhum envio ainda';
    try {
      return new Date(health.lastAt).toLocaleString('pt-BR');
    } catch {
      return health.lastAt;
    }
  }, [health?.lastAt]);

  if (!clienteId) {
    return (
      <Card className="rt-empty">
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          Selecione um cliente no topo para ver a visão geral do rastreamento.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <RastreamentoOverviewDashboard
        clienteId={clienteId}
        onOpenLeads={() => onOpenTab?.('leads')}
        since={since}
        until={until}
        onPeriodChange={onPeriodChange}
      />

      <section className="rastreamento-resultados rastreamento-resultados--embedded" aria-label="Saúde do rastreamento">
        <div className="rastreamento-resultados__head">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="h-4 w-4 text-violet-500 shrink-0" />
            <RastreamentoSectionTitle
              title="Envio à Meta"
              help={rastreamentoTabHelp('visao')}
              helpLabel="Sobre o envio CAPI"
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl shrink-0 bg-white border-slate-200" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Atualizar</span>
          </Button>
        </div>

        {health?.channelError || health?.eventError ? (
          <p className="text-xs text-destructive px-1 mb-2">{health.channelError || health.eventError}</p>
        ) : null}

        {loading && !health ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rastreamento-resultados__grid rastreamento-resultados__grid--health">
            <HealthCard
              label="Canais WhatsApp"
              value={String(health?.channelCount ?? 0)}
              hint={health?.readyCount ? `${health.readyCount} com Página/dataset` : null}
              actionLabel="Abrir integrações"
              onAction={() => onOpenTab?.('integracoes')}
            />
            <HealthCard
              label="Envio ligado"
              value={String(health?.enabledCount ?? 0)}
            />
            <HealthCard
              label="Eventos (200 últimos)"
              value={String(health?.eventCount ?? 0)}
              hint={`${health?.sent ?? 0} enviados · ${health?.failed ?? 0} falhos · não é o período das abas`}
              actionLabel="Ver eventos"
              onAction={() => onOpenTab?.('eventos')}
            />
            <HealthCard
              label="Última tentativa"
              value={lastLabel}
              hint={health?.lastError ? String(health.lastError).slice(0, 80) : null}
            />
          </div>
        )}
      </section>
    </div>
  );
}
