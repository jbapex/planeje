import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, MessageCircle, Pencil, RefreshCw, Save, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import {
  classifyUazapiStatusPayload,
  matchWebhookToInstance,
  parseUazapiSubdomain,
  rastreamentoWebhookUrl,
  uazapiBaseUrl,
  whatsappInstanceStatusLabel,
} from '@/lib/rastreamentoWhatsappInstancia';
import WhatsappConnectionLinkButton from '@/components/crm/WhatsappConnectionLinkButton';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';

function newSecret() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
}

/**
 * Fontes WhatsApp no padrão TRACK: instância Uazapi, teste e receiver.
 * Sem WABA/dataset — destino CAPI fica na Meta.
 */
export default function RastreamentoWhatsappInstancias({ clienteId, onChanged }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pending, setPending] = useState('');
  const [receiverUrl, setReceiverUrl] = useState('');
  const [live, setLive] = useState({});
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({ name: '', baseUrl: '', token: '' });
  const [edit, setEdit] = useState({ name: '', baseUrl: '', token: '' });

  const load = useCallback(async () => {
    if (!clienteId) {
      setInstances([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [cfgRes, logRes] = await Promise.all([
      supabase
        .from('cliente_whatsapp_config')
        .select('id, name, subdomain, token, instance_status, webhook_secret, provider, updated_at')
        .eq('cliente_id', clienteId)
        .is('archived_at', null)
        .order('name'),
      supabase
        .from('cliente_whatsapp_webhook_log')
        .select('created_at, instance_name, status')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    setInstances(cfgRes.data || []);
    setLogs(logRes.data || []);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyChanged = () => {
    onChanged?.();
    void load();
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const subdomain = parseUazapiSubdomain(form.baseUrl);
    const token = form.token.trim();
    const name = form.name.trim();
    if (!name || !subdomain || !token) {
      toast({ variant: 'destructive', title: 'Informe nome, URL da API e token da instância' });
      return;
    }
    setPending('create');
    try {
      const secret = newSecret();
      const { error } = await supabase.from('cliente_whatsapp_config').insert({
        cliente_id: clienteId,
        provider: 'uazapi',
        name,
        subdomain,
        token,
        webhook_secret: secret,
        instance_status: 'disconnected',
      });
      if (error) throw error;
      setForm({ name: '', baseUrl: '', token: '' });
      setReceiverUrl(rastreamentoWebhookUrl(supabaseUrl, clienteId, secret));
      toast({ title: 'Instância salva', description: 'Cole a URL do receiver na Uazapi. O token não aparece de novo.' });
      notifyChanged();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não salvou a instância', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleTest = async (instance) => {
    if (!instance?.subdomain || !instance?.token) {
      toast({ variant: 'destructive', title: 'Falta URL ou token desta instância' });
      return;
    }
    setPending(`test-${instance.id}`);
    try {
      const url = `${uazapiBaseUrl(instance.subdomain)}/instance/status?_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store', headers: { token: instance.token.trim() } });
      const data = await res.json().catch(() => ({}));
      const parsed = classifyUazapiStatusPayload(data);
      await supabase
        .from('cliente_whatsapp_config')
        .update({ instance_status: parsed.status, updated_at: new Date().toISOString() })
        .eq('id', instance.id)
        .eq('cliente_id', clienteId);
      setLive((current) => ({ ...current, [instance.id]: parsed }));
      toast({
        title: parsed.connected ? 'Instância conectada' : 'Instância não conectada',
        description: parsed.phone || parsed.profileName || parsed.instanceName || 'Resposta da Uazapi gravada no backend.',
        variant: parsed.connected ? 'default' : 'destructive',
      });
      notifyChanged();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Teste falhou', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleRotate = async (instance) => {
    setPending(`rotate-${instance.id}`);
    try {
      const secret = newSecret();
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({ webhook_secret: secret, updated_at: new Date().toISOString() })
        .eq('id', instance.id)
        .eq('cliente_id', clienteId);
      if (error) throw error;
      setReceiverUrl(rastreamentoWebhookUrl(supabaseUrl, clienteId, secret));
      toast({ title: 'Receiver gerado', description: 'Cole a URL completa no webhook da Uazapi.' });
      notifyChanged();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não gerou o receiver', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleCopyWebhook = async (instance) => {
    const url = rastreamentoWebhookUrl(supabaseUrl, clienteId, instance.webhook_secret);
    if (!url) {
      toast({ variant: 'destructive', title: 'Gere o receiver primeiro' });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast({ title: 'URL do webhook copiada' });
  };

  const handleSaveEdit = async (instance) => {
    const subdomain = parseUazapiSubdomain(edit.baseUrl) || instance.subdomain;
    const name = edit.name.trim() || instance.name;
    const token = edit.token.trim();
    setPending(`edit-${instance.id}`);
    try {
      const patch = {
        name,
        subdomain,
        updated_at: new Date().toISOString(),
      };
      if (token) patch.token = token;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update(patch)
        .eq('id', instance.id)
        .eq('cliente_id', clienteId);
      if (error) throw error;
      setEditingId('');
      setEdit({ name: '', baseUrl: '', token: '' });
      toast({ title: 'Instância atualizada' });
      notifyChanged();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não atualizou', description: error.message });
    } finally {
      setPending('');
    }
  };

  if (!clienteId) return null;
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="wa-instances">
      <div className="meta-manual-head">
        <div>
          <p className="meta-manual-kicker">Fontes WhatsApp</p>
          <RastreamentoSectionTitle
            as="h3"
            title="Instâncias Uazapi"
            help="A instância que recebe o clique do anúncio. Sem WABA, Pixel ou Página aqui — isso fica na Meta. Cole a URL do receiver no webhook da Uazapi."
            helpLabel="Sobre as instâncias WhatsApp"
          />
        </div>
      </div>

      <form className="wa-instance-create" onSubmit={handleCreate}>
        <label className="meta-manual-field">
          <span>Nome</span>
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Ex.: Ana Agenda"
          />
        </label>
        <label className="meta-manual-field">
          <span>URL da API</span>
          <Input
            value={form.baseUrl}
            onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
            placeholder="https://sua-instancia.uazapi.com"
          />
        </label>
        <label className="meta-manual-field">
          <span>Token</span>
          <Input
            type="password"
            autoComplete="off"
            value={form.token}
            onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))}
            placeholder="Token da instância"
          />
        </label>
        <Button type="submit" disabled={pending === 'create'}>
          {pending === 'create' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar conexão
        </Button>
      </form>

      {receiverUrl ? (
        <div className="wa-receiver">
          <p>Cole esta URL completa no webhook da Uazapi</p>
          <Input readOnly value={receiverUrl} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(receiverUrl);
              toast({ title: 'URL copiada' });
            }}
          >
            <Copy className="h-4 w-4 mr-1" />
            Copiar URL completa
          </Button>
        </div>
      ) : null}

      <div className="wa-instance-list">
        {instances.length === 0 ? (
          <p className="meta-manual-note">Nenhuma instância neste cliente. Salve a Uazapi que já recebe o anúncio.</p>
        ) : (
          instances.map((instance) => {
            const probe = live[instance.id];
            const last = matchWebhookToInstance(logs, instance);
            const status = probe?.status || instance.instance_status;
            return (
              <article key={instance.id} className="wa-instance-card">
                <div className="wa-instance-card__head">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <div>
                    <strong>{instance.name || 'Instância'}</strong>
                    <small>
                      Uazapi (BYO)
                      {instance.subdomain ? ` · ${instance.subdomain}.uazapi.com` : ''}
                    </small>
                  </div>
                  <span className={`meta-manual-status is-${status === 'connected' ? 'active' : status === 'connecting' ? 'draft' : 'error'}`}>
                    {whatsappInstanceStatusLabel(status)}
                  </span>
                </div>
                <p className="meta-manual-note">
                  {probe?.phone || probe?.profileName
                    ? `Número/perfil: ${probe.profileName || ''} ${probe.phone || ''}`.trim()
                    : last?.created_at
                      ? `Último POST no Planeje: ${new Date(last.created_at).toLocaleString('pt-BR')}`
                      : instance.webhook_secret
                        ? 'Receiver pronto. Ainda sem POST neste webhook.'
                        : 'Gere o receiver e cole a URL na Uazapi.'}
                </p>
                <div className="wa-instance-actions">
                  <WhatsappConnectionLinkButton key={`${clienteId}-${instance.id}`} clienteId={clienteId} instance={instance} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(pending)}
                    onClick={() => void handleTest(instance)}
                  >
                    {pending === `test-${instance.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Activity className="h-3.5 w-3.5 mr-1" />
                    )}
                    Testar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyWebhook(instance)}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Webhook
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(pending)}
                    onClick={() => void handleRotate(instance)}
                  >
                    {pending === `rotate-${instance.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Gerar receiver
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (editingId === instance.id) {
                        setEditingId('');
                        return;
                      }
                      setEditingId(instance.id);
                      setEdit({
                        name: instance.name || '',
                        baseUrl: instance.subdomain ? uazapiBaseUrl(instance.subdomain) : '',
                        token: '',
                      });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                </div>
                {editingId === instance.id ? (
                  <div className="wa-instance-edit">
                    <Input
                      value={edit.name}
                      onChange={(event) => setEdit((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nome"
                    />
                    <Input
                      value={edit.baseUrl}
                      onChange={(event) => setEdit((current) => ({ ...current, baseUrl: event.target.value }))}
                      placeholder="URL da API"
                    />
                    <Input
                      type="password"
                      autoComplete="off"
                      value={edit.token}
                      onChange={(event) => setEdit((current) => ({ ...current, token: event.target.value }))}
                      placeholder="Novo token (vazio = manter)"
                    />
                    <Button type="button" size="sm" disabled={Boolean(pending)} onClick={() => void handleSaveEdit(instance)}>
                      Salvar
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
