import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import MetaConversionsChannelSettings from '@/components/crm/MetaConversionsChannelSettings';

function webhookUrlFor(clienteId, secret) {
  if (!clienteId || !secret) return '';
  const q = new URLSearchParams({ cliente_id: clienteId, secret });
  return `${supabaseUrl}/functions/v1/uazapi-inbox-webhook?${q.toString()}`;
}

/**
 * Lista canais WhatsApp já cadastrados e a configuração Meta (WABA/page/dataset).
 */
export default function ClienteMetaCtwaChannelsPanel({ clienteId }) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clienteId) {
      setConfigs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('cliente_whatsapp_config')
      .select('id, name, meta_waba_id, meta_page_id, meta_dataset_id, meta_conversions_enabled, webhook_secret, instance_status')
      .eq('cliente_id', clienteId)
      .order('name');
    setLoading(false);
    if (!error) setConfigs(data || []);
    else setConfigs([]);
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!clienteId) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed rounded-lg border border-dashed p-3">
        Nenhum canal WhatsApp cadastrado para este cliente. O rastreamento usa o canal uazapi que a
        agência já ligou — não é preciso criar outro aqui. Se ainda não existir, configure em CRM →
        Canais neste mesmo login.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Por canal: escolha a conta WhatsApp (WABA), busque o dataset e ative «Enviar à Meta».
      </p>
      {configs.map((cfg) => {
        const webhookUrl = webhookUrlFor(clienteId, cfg.webhook_secret);
        return (
        <div key={cfg.id} className="rounded-lg border bg-background/80 p-1">
          <div className="flex items-center justify-between gap-2 px-3 pt-2">
            <p className="text-[11px] font-medium text-foreground truncate">
              {cfg.name || 'Canal'}
              {cfg.instance_status ? (
                <span className="ml-2 font-normal text-muted-foreground">· {cfg.instance_status}</span>
              ) : null}
            </p>
            {webhookUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  toast({ title: 'URL do webhook copiada' });
                }}
              >
                <Copy className="h-3 w-3 mr-1" />
                Webhook
              </Button>
            ) : (
              <span className="text-[10px] text-amber-700 dark:text-amber-400">Webhook ainda sem secret</span>
            )}
          </div>
          <MetaConversionsChannelSettings config={cfg} clienteId={clienteId} onSaved={load} />
        </div>
        );
      })}
    </div>
  );
}
