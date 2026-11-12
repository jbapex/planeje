import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  buildIngressWebhookUrl,
  ensureClienteIngressWebhookSecret,
  regenerateClienteIngressWebhookSecret,
} from '@/lib/ingressWebhookClient';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';

function payloadLabel(row) {
  const type = String(row?.type || '');
  if (type === 'probe') return 'Teste da URL';
  const event = type.includes(':') ? type.split(':').slice(1).join(':') : type;
  return event || 'Payload';
}

function payloadEvent(row) {
  const type = String(row?.type || '');
  if (type === 'probe') return 'probe';
  return type.includes(':') ? type.split(':').slice(1).join(':') : type;
}

function payloadRole(row) {
  const event = payloadEvent(row);
  if (event === 'USER_MESSAGE_RECEIVED' || event === 'AGENT_USER_MESSAGE') return 'Fala';
  if (event === 'GROUP_MESSAGE_RECEIVED') return 'Grupo';
  if (
    event === 'AGENT_MESSAGE_SENDED'
    || event === 'AGENT_MESSAGE_FOLLOW_UP'
    || event === 'AGENT_MESSAGE_BLOCKED'
    || event === 'AGENT_MESSAGE_NOTED'
  ) return 'Agente';
  if (event === 'STEP_ENTERED' || event === 'NPS_INTERACTION') return 'Registro';
  if (event === 'probe') return 'Teste';
  return '';
}

function channelLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'whatsapp') return 'WhatsApp oficial';
  if (key === 'zapperapi') return 'Zapper';
  return String(value || '').trim();
}

function payloadWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RastreamentoChatvoltWebhook({ clienteId }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsError, setLogsError] = useState('');
  const [openId, setOpenId] = useState('');
  const [rotating, setRotating] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!clienteId) return;
    const { data, error } = await supabase
      .from('cliente_whatsapp_webhook_log')
      .select('id, created_at, status, source, type, body_preview, from_jid, error_message, raw_payload')
      .eq('cliente_id', clienteId)
      .in('source', ['ingress', 'chatvolt'])
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) {
      setLogsError(error.message || 'Não foi possível ler os payloads');
      return;
    }
    setLogsError('');
    setLogs(data || []);
  }, [clienteId]);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextSecret = await ensureClienteIngressWebhookSecret(clienteId);
      setSecret(nextSecret);
      await loadLogs();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não carregou o webhook', description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [clienteId, loadLogs, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!clienteId) return undefined;
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [clienteId, loadLogs]);

  const url = buildIngressWebhookUrl({ clienteId, secret });

  const copyUrl = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: 'URL copiada', description: 'Cole no Chatvolt, sem trocar a URL do Tintim.' });
  };

  const rotate = async () => {
    if (!clienteId) return;
    if (!window.confirm('A URL atual deixa de valer. O Chatvolt precisa receber a nova.')) return;
    setRotating(true);
    try {
      const nextSecret = await regenerateClienteIngressWebhookSecret(clienteId);
      setSecret(nextSecret);
      toast({ title: 'Nova URL gerada', description: 'Envie a URL nova para o Chatvolt.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não gerou outra URL', description: error?.message });
    } finally {
      setRotating(false);
    }
  };

  if (!clienteId) return null;

  return (
    <div className="wa-instances" id="integration-chatvolt">
      <div className="meta-manual-head">
        <div>
          <p className="meta-manual-kicker">Fontes WhatsApp</p>
          <RastreamentoSectionTitle
            as="h3"
            title="Webhook Chatvolt"
            help="A fala do cliente entra em Leads, no mesmo caminho da Uazapi. A resposta do agente não abre lead. O anúncio da Meta só entra quando o payload traz o clique em ctwaAttributions."
            helpLabel="Sobre o webhook do Chatvolt"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <p className="meta-manual-note chatvolt-ingress-note">
            Copie a URL e peça para colocarem no segundo campo de webhook do agente. Não substitua a do Tintim.
          </p>
          <div className="wa-receiver">
            <p>URL para o Chatvolt</p>
            <Input readOnly value={url} className="font-mono text-xs" />
            <div className="chatvolt-ingress-actions">
              <Button type="button" variant="outline" onClick={() => void copyUrl()} disabled={!url}>
                <Copy className="h-4 w-4 mr-1" />
                Copiar URL
              </Button>
              <Button type="button" variant="outline" onClick={() => void rotate()} disabled={rotating}>
                {rotating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Gerar outra URL
              </Button>
            </div>
          </div>

          <div className="chatvolt-payloads">
            <div className="chatvolt-payloads__head">
              <strong>Payloads recebidos</strong>
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadLogs()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Atualizar
              </Button>
            </div>
            <p className="meta-manual-note">
              O JSON não traz o número da linha. O nome do canal é WhatsApp oficial ou Zapper.
            </p>
            {logsError ? <p className="meta-manual-note">{logsError}</p> : null}
            {logs.length === 0 ? (
              <p className="meta-manual-note">
                Nenhum payload ainda. Quando o Chatvolt salvar a URL, o teste e as mensagens aparecem aqui.
              </p>
            ) : (
              <ul className="chatvolt-payload-list">
                {logs.map((row) => {
                  const open = openId === row.id;
                  const phone = String(row.from_jid || '').replace(/@.*/, '');
                  const canal = channelLabel(row.raw_payload?.channel);
                  return (
                    <li key={row.id} className="chatvolt-payload">
                      <button type="button" className="chatvolt-payload__toggle" onClick={() => setOpenId(open ? '' : row.id)}>
                        <span>{payloadWhen(row.created_at)}</span>
                        <strong>{canal || payloadLabel(row)}</strong>
                        {payloadRole(row) ? <em className="chatvolt-payload__role">{payloadRole(row)}</em> : null}
                        <em>{phone || 'sem número'}</em>
                      </button>
                      {open ? (
                        <pre className="chatvolt-payload__json">
                          {JSON.stringify(row.raw_payload ?? { aviso: row.error_message || 'sem corpo' }, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
