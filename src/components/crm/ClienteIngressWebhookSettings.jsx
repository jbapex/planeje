import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import {
  buildIngressWebhookUrl,
  ensureClienteIngressWebhookSecret,
  INGRESS_CANONICAL_EXAMPLE,
  regenerateClienteIngressWebhookSecret,
} from '@/lib/ingressWebhookClient';

/**
 * Webhook de entrada para CRMs externos (sem uazapi).
 */
export default function ClienteIngressWebhookSettings({ clienteId, configs = [] }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await ensureClienteIngressWebhookSecret(clienteId);
      setSecret(s);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar webhook', description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const clientUrl = buildIngressWebhookUrl({ clienteId, secret });

  const handleRegenerate = async () => {
    if (!clienteId) return;
    setRegenerating(true);
    try {
      const s = await regenerateClienteIngressWebhookSecret(clienteId);
      setSecret(s);
      toast({ title: 'Secret regenerado', description: 'Atualize a URL no CRM externo.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e?.message });
    } finally {
      setRegenerating(false);
    }
  };

  const copy = (text, label) => {
    void navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado` });
  };

  if (!clienteId) return null;

  return (
    <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/30 dark:bg-violet-950/20 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Link2 className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold">Webhook de entrada (outros CRMs / sem uazapi)</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Receba contatos e <code className="text-[10px]">ctwa_clid</code> de Zapier, middleware, Meta Cloud ou
            qualquer sistema que faça POST. Aceita JSON canônico, formato uazapi ou Meta Cloud API.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-xs">URL do cliente (um secret para todos os canais)</Label>
            <div className="flex gap-2">
              <Input readOnly value={clientUrl} className="font-mono text-[10px] h-9" />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => copy(clientUrl, 'URL')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={regenerating} onClick={() => void handleRegenerate()}>
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Opcional na query: <code>channel_id=UUID</code> do canal. Ou envie <code>channel_key</code> /{' '}
              <code>instanceName</code> no JSON (ex.: Sandy).
            </p>
          </div>

          {configs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">URL por canal (secret do canal)</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {configs.filter((c) => c.webhook_secret).map((c) => {
                  const url = buildIngressWebhookUrl({
                    clienteId,
                    secret: c.webhook_secret,
                    channelId: c.id,
                  });
                  return (
                    <div key={c.id} className="flex gap-2 items-center">
                      <span className="text-[10px] text-muted-foreground w-20 shrink-0 truncate">{c.name || 'Canal'}</span>
                      <Input readOnly value={url} className="font-mono text-[9px] h-7 flex-1" />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(url, c.name || 'Canal')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Alert className="py-2 bg-background/60">
            <AlertDescription className="text-[10px] leading-relaxed space-y-2">
              <p className="font-medium">Exemplo JSON canônico (POST):</p>
              <pre className="text-[9px] overflow-x-auto bg-muted/50 p-2 rounded max-h-36">
                {JSON.stringify(INGRESS_CANONICAL_EXAMPLE, null, 2)}
              </pre>
              <p>
                Também aceita o payload uazapi completo (com <code>message.content.contextInfo.externalAdReply</code>).
                <code>sourceID</code> no webhook é ID do anúncio — não confundir com Page ID da Meta.
              </p>
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}
