import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link2, Copy, Activity, CheckCircle2, Clock, Loader2, Bot, KeyRound, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import { extractPhoneAndNameFromRawPayload, getFromJidFromRawPayload, buildContactTrackingFromRawPayload, getProfilePicFromRawPayload } from '@/lib/contactFromWebhookPayload';

function formatLastEventAgo(dateStr) {
  if (!dateStr) return '';
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
  return `há ${Math.floor(sec / 3600)} h`;
}

const ApicebotIntegracaoPage = ({ embeddedInCrm }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const {
    effectiveClienteId,
    config,
    loading,
    saving,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
    generateWebhookSecret,
    updateApicebotApi,
  } = useClienteWhatsAppConfig();

  const [webhookGenerating, setWebhookGenerating] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [webhookLogViewing, setWebhookLogViewing] = useState(null);
  const [importContactLoading, setImportContactLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiSaving, setApiSaving] = useState(false);
  const [apiValidating, setApiValidating] = useState(false);

  useEffect(() => {
    if (!config) {
      setApiUrl('');
      setApiToken('');
    } else {
      setApiUrl(config.apicebot_api_url || '');
      setApiToken(config.apicebot_token || '');
    }
  }, [config]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('cliente_whatsapp_webhook_log')
        .select('id, created_at, status, source, from_jid, type, body_preview, error_message, raw_payload, body_keys')
        .eq('cliente_id', effectiveClienteId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setWebhookLogs(data);
    };
    fetchLogs();
    const channel = supabase
      .channel(`webhook-log-apicebot:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente_whatsapp_webhook_log', filter: `cliente_id=eq.${effectiveClienteId}` },
        (payload) => {
          const row = payload.new;
          setWebhookLogs((prev) => [{ ...row }, ...prev].slice(0, 50));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [effectiveClienteId]);

  const getApicebotWebhookUrl = () => {
    if (!effectiveClienteId || !config?.webhook_secret) return '';
    const q = new URLSearchParams({
      cliente_id: effectiveClienteId,
      secret: config.webhook_secret,
    });
    return `${supabaseUrl}/functions/v1/apicebot-inbox-webhook?${q.toString()}`;
  };

  const getApicebotWebhookUrlBase = () => `${supabaseUrl}/functions/v1/apicebot-inbox-webhook`;

  const apicebotLogs = webhookLogs.filter((log) => (log.source || '').toLowerCase() === 'apicebot');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {!embeddedInCrm && <Helmet title="Integração Apicebot - CRM" />}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Integração Apicebot
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Webhook exclusivo para receber eventos do Apicebot na Caixa de entrada e no WhatsApp.
            </p>
          </div>
          {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
            <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientesForAdmin.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome || c.razao_social || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!effectiveClienteId ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {isAdminWithoutCliente ? 'Selecione um cliente acima.' : 'Cliente não identificado.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Container 1: API Apicebot */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  API Apicebot
                </CardTitle>
                <CardDescription>
                  Configure a URL do endpoint e o Bearer token para enviar mensagens pelo Apicebot. Use as credenciais fornecidas pelo painel do Apicebot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">URL do endpoint</label>
                  <Input
                    placeholder="https://api.apicebot.com/..."
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Bearer token</label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Token de autorização"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    size="sm"
                    disabled={apiSaving || saving}
                    onClick={async () => {
                      setApiSaving(true);
                      await updateApicebotApi(apiUrl, apiToken);
                      setApiSaving(false);
                    }}
                  >
                    {apiSaving || saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Salvar API Apicebot
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={apiSaving || saving || apiValidating}
                    onClick={async () => {
                      const urlTrim = (apiUrl || '').trim();
                      const tokenTrim = (apiToken || '').trim();
                      if (!urlTrim || !tokenTrim) {
                        toast({ variant: 'destructive', title: 'Preencha URL e token', description: 'Informe a URL do endpoint e o Bearer token para validar.' });
                        return;
                      }
                      let baseUrl;
                      try {
                        const u = new URL(urlTrim);
                        const pathWithoutLast = u.pathname.replace(/\/[^/]*$/, '') || '/';
                        baseUrl = `${u.origin}${pathWithoutLast}${pathWithoutLast.endsWith('/') ? '' : '/'}`;
                      } catch {
                        toast({ variant: 'destructive', title: 'URL inválida', description: 'A URL do endpoint não é válida.' });
                        return;
                      }
                      setApiValidating(true);
                      try {
                        const res = await fetch(baseUrl, {
                          method: 'GET',
                          headers: { Authorization: `Bearer ${tokenTrim}` },
                        });
                        const text = await res.text();
                        const data = (() => { try { return JSON.parse(text); } catch { return null; } })();
                        if (res.ok) {
                          toast({
                            title: 'Conexão com a API Apicebot OK',
                            description: data?.message || data?.status || 'A API respondeu com sucesso e o token foi aceito.',
                          });
                        } else if (res.status === 401) {
                          toast({
                            variant: 'destructive',
                            title: 'Token inválido ou não autorizado',
                            description: 'A API retornou 401. Verifique o Bearer token no painel do Apicebot.',
                          });
                        } else {
                          toast({
                            variant: 'destructive',
                            title: 'Resposta inesperada da API',
                            description: data?.error || data?.message || `Status ${res.status}. Algumas APIs só respondem em rotas específicas; se o envio de mensagens funcionar, pode ignorar.`,
                          });
                        }
                      } catch (e) {
                        toast({
                          variant: 'destructive',
                          title: 'Falha ao conectar',
                          description: e?.message || 'Verifique a URL, a conexão com a internet e se a API está acessível.',
                        });
                      }
                      setApiValidating(false);
                    }}
                  >
                    {apiValidating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Validar conexão
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use &quot;Validar conexão&quot; para testar se a URL e o token estão corretos. A validação faz um GET na base da URL com o Bearer token; se a API retornar 200, a conexão está OK.
                </p>
              </CardContent>
            </Card>

            {/* Container 2: Webhook Apicebot */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Webhook Apicebot
                </CardTitle>
                <CardDescription>
                  Este webhook escuta POSTs na URL abaixo. Configure essa URL no Apicebot; cada evento enviado aparecerá na lista em tempo real e as mensagens com remetente irão para a Caixa de entrada e a aba WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              {!config?.webhook_secret ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Gere o secret para liberar a URL do webhook. Depois copie a URL e configure no Apicebot como &quot;URL de webhook&quot; ou &quot;Callback&quot;.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={webhookGenerating}
                    onClick={async () => {
                      setWebhookGenerating(true);
                      await generateWebhookSecret();
                      setWebhookGenerating(false);
                      toast({ title: 'URL gerada', description: 'A URL do webhook Apicebot aparece abaixo.' });
                    }}
                  >
                    {webhookGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Gerar URL do webhook Apicebot
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">URL para Apicebot</p>
                    <p className="text-xs text-muted-foreground">
                      Copie e configure no painel do Apicebot como &quot;URL de webhook&quot; ou &quot;Callback&quot;. As mensagens recebidas aparecerão na Caixa de entrada e na aba WhatsApp.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Input readOnly value={getApicebotWebhookUrl()} className="font-mono text-xs flex-1 min-w-0" />
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(getApicebotWebhookUrl());
                          toast({ title: 'URL Apicebot copiada' });
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar URL Apicebot
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={webhookTesting}
                        onClick={async () => {
                          const url = getApicebotWebhookUrl();
                          if (!url) return;
                          setWebhookTesting(true);
                          try {
                            const res = await fetch(url, { method: 'GET' });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok && data?.ok === true) {
                              toast({ title: 'Webhook ativo', description: 'A URL respondeu corretamente (ok: true).' });
                            } else if (res.status === 401) {
                              toast({ variant: 'destructive', title: '401 - Acesso negado', description: 'Verifique se a Edge Function permite chamadas sem JWT (verify_jwt = false).' });
                            } else {
                              toast({ variant: 'destructive', title: 'Erro ao testar', description: data?.error || `Status ${res.status}` });
                            }
                          } catch (e) {
                            toast({ variant: 'destructive', title: 'Falha ao testar', description: e?.message || 'Verifique a conexão e se a Edge Function está publicada.' });
                          }
                          setWebhookTesting(false);
                        }}
                      >
                        {webhookTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Testar URL
                      </Button>
                    </div>
                  </div>
                  <details className="text-[11px] text-muted-foreground border rounded-md p-2 bg-muted/30">
                    <summary className="cursor-pointer font-medium text-foreground">Se a URL com parâmetros não funcionar no seu sistema</summary>
                    <p className="mt-2 mb-2">
                      Alguns sistemas não aceitam <code className="bg-muted px-1 rounded">?cliente_id=...&amp;secret=...</code> na URL. Use a <strong>URL base</strong> abaixo e configure no Apicebot o header <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;sua chave do webhook&gt;</code> (a mesma chave que aparece no card &quot;Configuração WhatsApp&quot;).
                    </p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Input readOnly value={getApicebotWebhookUrlBase()} className="font-mono text-xs flex-1 min-w-0" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(getApicebotWebhookUrlBase());
                          toast({ title: 'URL base copiada', description: 'Configure no Apicebot o header Authorization: Bearer com a chave do webhook.' });
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copiar URL base
                      </Button>
                    </div>
                  </details>

                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">O que este webhook escuta</p>
                    <ul className="text-[11px] text-muted-foreground space-y-1.5 list-none">
                      <li><strong className="text-foreground">Método:</strong> <code className="bg-muted px-1 rounded">POST</code> (eventos); <code className="bg-muted px-1 rounded">GET</code> (teste).</li>
                      <li><strong className="text-foreground">Content-Type:</strong> <code className="bg-muted px-1 rounded">application/json</code></li>
                      <li><strong className="text-foreground">Autenticação:</strong> Query <code className="bg-muted px-1 rounded">cliente_id</code> + <code className="bg-muted px-1 rounded">secret</code>; ou só header <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;webhook_secret&gt;</code> (o cliente é identificado pelo secret)</li>
                      <li><strong className="text-foreground">Remetente:</strong> <code className="bg-muted px-1 rounded">from</code>, <code className="bg-muted px-1 rounded">phone</code>, <code className="bg-muted px-1 rounded">number</code>, <code className="bg-muted px-1 rounded">sender</code>, <code className="bg-muted px-1 rounded">senderId</code>, <code className="bg-muted px-1 rounded">remoteJid</code>, <code className="bg-muted px-1 rounded">chatId</code>, <code className="bg-muted px-1 rounded">author</code>, <code className="bg-muted px-1 rounded">participant</code>, <code className="bg-muted px-1 rounded">phoneNumber</code>, <code className="bg-muted px-1 rounded">senderPhone</code>; ou aninhado <code className="bg-muted px-1 rounded">contact.phone</code>, <code className="bg-muted px-1 rounded">message.from</code></li>
                      <li><strong className="text-foreground">Mensagem:</strong> <code className="bg-muted px-1 rounded">message</code>, <code className="bg-muted px-1 rounded">text</code>, <code className="bg-muted px-1 rounded">body</code>, <code className="bg-muted px-1 rounded">content</code>, <code className="bg-muted px-1 rounded">messageText</code>; ou <code className="bg-muted px-1 rounded">message.body</code> / <code className="bg-muted px-1 rounded">message.text</code></li>
                      <li><strong className="text-foreground">Tipo de evento:</strong> <code className="bg-muted px-1 rounded">event</code>, <code className="bg-muted px-1 rounded">type</code>, <code className="bg-muted px-1 rounded">eventType</code>, <code className="bg-muted px-1 rounded">event_type</code>, <code className="bg-muted px-1 rounded">action</code></li>
                      <li><strong className="text-foreground">Opcional:</strong> <code className="bg-muted px-1 rounded">name</code>, <code className="bg-muted px-1 rounded">id</code>, <code className="bg-muted px-1 rounded">messageId</code>, <code className="bg-muted px-1 rounded">timestamp</code>, <code className="bg-muted px-1 rounded">profilePicUrl</code>, <code className="bg-muted px-1 rounded">isGroup</code>, <code className="bg-muted px-1 rounded">groupName</code></li>
                      <li><strong className="text-foreground">Estruturas:</strong> objeto simples (<code className="bg-muted px-1 rounded">from</code>, <code className="bg-muted px-1 rounded">message</code>); aninhado (<code className="bg-muted px-1 rounded">data.*</code>, <code className="bg-muted px-1 rounded">message.body</code>); ou formato Meta/WhatsApp Cloud (<code className="bg-muted px-1 rounded">entry[0].changes[0].value.messages[0]</code> com <code className="bg-muted px-1 rounded">from</code> e <code className="bg-muted px-1 rounded">text.body</code>).</li>
                    </ul>
                  </div>

                  <details className="text-[11px] text-muted-foreground border rounded-md p-2 bg-amber-500/5 border-amber-500/20">
                    <summary className="cursor-pointer font-medium text-foreground">Por que não chegam eventos?</summary>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li><strong>URL no outro sistema:</strong> No painel do Apicebot (ou sistema que envia), configure como &quot;URL de webhook&quot; ou &quot;Callback&quot; a <em>mesma</em> URL que aparece acima — completa, com <code className="bg-muted px-1 rounded">cliente_id</code> e <code className="bg-muted px-1 rounded">secret</code> na query. Se colocar só o domínio ou outra URL, nada será enviado para aqui.</li>
                      <li><strong>O outro sistema precisa enviar POST:</strong> Quando ocorrer um evento (ex.: nova mensagem), esse sistema deve fazer uma requisição <strong>POST</strong> com corpo <strong>JSON</strong> para a URL. Se não houver configuração de webhook/callback no outro sistema, os dados não chegarão.</li>
                      <li><strong>Chave do webhook preenchida:</strong> No card &quot;Configuração WhatsApp&quot; acima, o campo &quot;Chave do webhook&quot; deve estar salvo. A URL que você copia já leva essa chave; se alterar a chave, copie de novo a URL e atualize no Apicebot.</li>
                      <li><strong>Testar URL:</strong> Use o botão &quot;Testar URL&quot; acima. Se aparecer &quot;Webhook ativo&quot;, o endpoint está no ar e a autenticação por URL está ok; o próximo passo é o outro sistema enviar POST para essa URL.</li>
                    </ul>
                  </details>

                  <p className="text-[11px] text-muted-foreground">
                    Se o Apicebot enviar formato incompatível, aparecerá na lista um evento com erro — use &quot;Ver corpo&quot; para inspecionar o payload.
                  </p>
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Activity className="h-3.5 w-3.5" />
                        O que este webhook está recebendo (tempo real)
                      </p>
                      {apicebotLogs.length === 0 ? (
                        <span className="text-xs flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Aguardando primeiro evento…
                        </span>
                      ) : apicebotLogs[0]?.status === 'error' ? (
                        <span className="text-xs flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          Último evento com erro
                          {apicebotLogs[0]?.created_at && (
                            <span className="text-muted-foreground font-normal"> ({formatLastEventAgo(apicebotLogs[0].created_at)})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs flex items-center gap-1.5 text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Recebendo eventos
                          {apicebotLogs[0]?.created_at && (
                            <span className="text-muted-foreground font-normal"> · Último: {formatLastEventAgo(apicebotLogs[0].created_at)}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="rounded-md border bg-muted/30 max-h-64 overflow-y-auto p-2 space-y-1.5">
                      {apicebotLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">
                          Configure a URL no Apicebot e envie uma mensagem; os eventos aparecem aqui em tempo real.
                        </p>
                      ) : (
                        apicebotLogs.map((log) => (
                          <div key={log.id} className="text-xs rounded px-2 py-1.5 bg-background border">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground shrink-0">
                                {log.created_at ? new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                              </span>
                              <span
                                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  log.status === 'ok' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-destructive/20 text-destructive'
                                }`}
                              >
                                {log.status}
                              </span>
                              {log.from_jid && (
                                <span className="font-mono truncate max-w-[120px]" title={log.from_jid}>
                                  {log.from_jid}
                                </span>
                              )}
                              {log.type && <span className="text-muted-foreground">{log.type}</span>}
                              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] shrink-0" onClick={() => setWebhookLogViewing(log)}>
                                Ver corpo
                              </Button>
                            </div>
                            {(log.body_preview || log.error_message) && (
                              <p className="mt-1 text-muted-foreground truncate max-w-full" title={log.body_preview || log.error_message}>
                                {log.error_message || log.body_preview}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!webhookLogViewing} onOpenChange={(open) => !open && setWebhookLogViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Corpo recebido pelo webhook
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
                    Chaves recebidas:{' '}
                    <code className="bg-muted px-1 rounded">
                      {Array.isArray(webhookLogViewing.body_keys) ? webhookLogViewing.body_keys.join(', ') : String(webhookLogViewing.body_keys)}
                    </code>
                  </p>
                )}
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
    </>
  );
};

export default ApicebotIntegracaoPage;
