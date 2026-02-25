import React, { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Zap, Trash2, Copy, RefreshCw } from 'lucide-react';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';

/**
 * Modal para importar leads da Gestão de leads dos anúncios (Facebook Lead Ads).
 * Chama meta-ads-api get-leads-by-form e depois create-lead-from-contact para cada lead com telefone.
 */
const ImportFacebookLeadsModal = ({ isOpen, onClose, effectiveClienteId, onImported }) => {
  const { toast } = useToast();
  const { pipelines } = useCrmPipeline();
  const [formId, setFormId] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoConfigs, setAutoConfigs] = useState([]);
  const [metaPageId, setMetaPageId] = useState('');
  const [autoPipelineId, setAutoPipelineId] = useState('');
  const [autoStageId, setAutoStageId] = useState('');
  const [autoStages, setAutoStages] = useState([]);
  const [savingAuto, setSavingAuto] = useState(false);
  // Sincronização a cada 1 minuto (polling por Form ID)
  const [pollingConfigs, setPollingConfigs] = useState([]);
  const [pollFormId, setPollFormId] = useState('');
  const [pollPipelineId, setPollPipelineId] = useState('');
  const [pollStageId, setPollStageId] = useState('');
  const [pollStages, setPollStages] = useState([]);
  const [savingPolling, setSavingPolling] = useState(false);

  const fetchStages = useCallback((pId) => {
    if (!pId) {
      setStages([]);
      setStageId('');
      return;
    }
    supabase
      .from('crm_stages')
      .select('id, nome, ordem')
      .eq('pipeline_id', pId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setStages(data || []);
        setStageId((prev) => ((data || []).some((s) => s.id === prev) ? prev : (data?.[0]?.id || '')));
      });
  }, []);

  React.useEffect(() => {
    if (!pipelineId) {
      setStages([]);
      setStageId('');
      return;
    }
    fetchStages(pipelineId);
  }, [pipelineId, fetchStages]);

  React.useEffect(() => {
    if (isOpen && pipelines?.length > 0 && !pipelineId) {
      setPipelineId(pipelines[0].id);
    }
  }, [isOpen, pipelines, pipelineId]);

  useEffect(() => {
    if (!isOpen || !effectiveClienteId) return;
    supabase
      .from('cliente_meta_leadgen_webhook')
      .select('id, meta_page_id, pipeline_id, stage_id, is_active')
      .eq('cliente_id', effectiveClienteId)
      .then(({ data }) => setAutoConfigs(data || []));
  }, [isOpen, effectiveClienteId]);

  useEffect(() => {
    if (!isOpen || !effectiveClienteId) return;
    supabase
      .from('cliente_meta_leadgen_polling')
      .select('id, form_id, pipeline_id, stage_id, is_active, last_synced_at')
      .eq('cliente_id', effectiveClienteId)
      .then(({ data }) => setPollingConfigs(data || []));
  }, [isOpen, effectiveClienteId]);

  useEffect(() => {
    if (!pollPipelineId) {
      setPollStages([]);
      setPollStageId('');
      return;
    }
    supabase
      .from('crm_stages')
      .select('id, nome, ordem')
      .eq('pipeline_id', pollPipelineId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setPollStages(data || []);
        setPollStageId((prev) => ((data || []).some((s) => s.id === prev) ? prev : (data?.[0]?.id || '')));
      });
  }, [pollPipelineId]);

  useEffect(() => {
    if (isOpen && pipelines?.length > 0 && !pollPipelineId) setPollPipelineId(pipelines[0].id);
  }, [isOpen, pipelines, pollPipelineId]);

  useEffect(() => {
    if (!autoPipelineId) {
      setAutoStages([]);
      setAutoStageId('');
      return;
    }
    supabase
      .from('crm_stages')
      .select('id, nome, ordem')
      .eq('pipeline_id', autoPipelineId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setAutoStages(data || []);
        setAutoStageId((prev) => ((data || []).some((s) => s.id === prev) ? prev : (data?.[0]?.id || '')));
      });
  }, [autoPipelineId]);

  useEffect(() => {
    if (isOpen && pipelines?.length > 0 && !autoPipelineId) setAutoPipelineId(pipelines[0].id);
  }, [isOpen, pipelines, autoPipelineId]);

  const handleSaveAutoImport = useCallback(async () => {
    const pageId = (metaPageId || '').trim().replace(/\D/g, '');
    if (!pageId || !effectiveClienteId || !autoPipelineId || !autoStageId) {
      toast({ variant: 'destructive', title: 'Preencha Página do Meta, Funil e Etapa.' });
      return;
    }
    setSavingAuto(true);
    try {
      const { error } = await supabase.from('cliente_meta_leadgen_webhook').upsert(
        { cliente_id: effectiveClienteId, meta_page_id: pageId, pipeline_id: autoPipelineId, stage_id: autoStageId, is_active: true },
        { onConflict: 'cliente_id,meta_page_id', updateColumns: ['pipeline_id', 'stage_id', 'is_active', 'updated_at'] }
      );
      if (error) throw error;
      toast({ title: 'Importação automática ativada', description: 'Novos leads dessa página serão importados quando chegarem no Meta.' });
      setMetaPageId('');
      const { data } = await supabase.from('cliente_meta_leadgen_webhook').select('id, meta_page_id, pipeline_id, stage_id, is_active').eq('cliente_id', effectiveClienteId);
      setAutoConfigs(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e?.message || 'Não foi possível salvar.' });
    } finally {
      setSavingAuto(false);
    }
  }, [effectiveClienteId, metaPageId, autoPipelineId, autoStageId, toast]);

  const handleRemoveAutoConfig = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('cliente_meta_leadgen_webhook').delete().eq('id', id);
      if (error) throw error;
      setAutoConfigs((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Removido', description: 'Importação automática desativada para esta página.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e?.message || 'Não foi possível remover.' });
    }
  }, [toast]);

  const handleSavePolling = useCallback(async () => {
    const formIdTrim = (pollFormId || '').trim();
    if (!formIdTrim || !effectiveClienteId || !pollPipelineId || !pollStageId) {
      toast({ variant: 'destructive', title: 'Preencha Form ID, Funil e Etapa.' });
      return;
    }
    setSavingPolling(true);
    try {
      const { error } = await supabase.from('cliente_meta_leadgen_polling').upsert(
        { cliente_id: effectiveClienteId, form_id: formIdTrim, pipeline_id: pollPipelineId, stage_id: pollStageId, is_active: true, last_synced_at: new Date().toISOString() },
        { onConflict: 'cliente_id,form_id', updateColumns: ['pipeline_id', 'stage_id', 'is_active', 'last_synced_at', 'updated_at'] }
      );
      if (error) throw error;
      toast({ title: 'Sincronização ativada', description: 'Novos leads deste formulário serão importados automaticamente a cada 1 minuto.' });
      setPollFormId('');
      const { data } = await supabase.from('cliente_meta_leadgen_polling').select('id, form_id, pipeline_id, stage_id, is_active, last_synced_at').eq('cliente_id', effectiveClienteId);
      setPollingConfigs(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e?.message || 'Não foi possível salvar.' });
    } finally {
      setSavingPolling(false);
    }
  }, [effectiveClienteId, pollFormId, pollPipelineId, pollStageId, toast]);

  const handleRemovePollingConfig = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('cliente_meta_leadgen_polling').delete().eq('id', id);
      if (error) throw error;
      setPollingConfigs((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Removido', description: 'Sincronização desativada para este formulário.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e?.message || 'Não foi possível remover.' });
    }
  }, [toast]);

  const webhookUrl = `${supabaseUrl}/functions/v1/meta-leadgen-webhook`;
  const syncUrl = `${supabaseUrl}/functions/v1/meta-leadgen-sync`;
  const verifyToken = 'planeje-leadgen-verify';

  const handleImport = async () => {
    const formIdTrim = (formId || '').trim();
    if (!formIdTrim) {
      toast({ variant: 'destructive', title: 'Form ID obrigatório', description: 'Informe o ID do formulário (copie da Gestão de leads no Facebook).' });
      return;
    }
    if (!effectiveClienteId) {
      toast({ variant: 'destructive', title: 'Cliente não identificado', description: 'Selecione um cliente ou faça login como cliente.' });
      return;
    }
    if (!pipelineId || !stageId) {
      toast({ variant: 'destructive', title: 'Funil e etapa obrigatórios', description: 'Selecione o funil e a etapa para onde os leads serão importados.' });
      return;
    }
    setLoading(true);
    try {
      const sinceTs = sinceDate ? Math.floor(new Date(sinceDate).getTime() / 1000) : undefined;
      const { data: metaData, error: metaError } = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-leads-by-form',
          form_id: formIdTrim,
          since: sinceTs,
          limit: 500,
        },
      });
      if (metaError) {
        toast({ variant: 'destructive', title: 'Erro ao buscar leads', description: metaError.message || 'Falha na chamada à API do Meta.' });
        setLoading(false);
        return;
      }
      if (metaData?.error) {
        const msg = metaData.error.message || metaData.error.error?.message || 'Verifique o token e permissões (leads_retrieval e Página atribuída).';
        toast({ variant: 'destructive', title: 'Erro na API do Meta', description: msg });
        setLoading(false);
        return;
      }
      const leads = metaData.leads || [];
      if (leads.length === 0) {
        toast({ title: 'Nenhum lead', description: 'Nenhum lead encontrado para este formulário no período informado.' });
        setLoading(false);
        return;
      }
      const uniqueAdIds = [...new Set(leads.map((l) => l.ad_id).filter(Boolean))];
      const adDetailsByAdId = {};
      for (const adId of uniqueAdIds) {
        try {
          const { data: adData } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-ad-by-id', adId },
          });
          if (adData?.ad) {
            adDetailsByAdId[adId] = {
              accountName: adData.accountName ?? null,
              ad: adData.ad,
              fetched_at: new Date().toISOString(),
            };
          }
        } catch (_) {
          // ignore
        }
      }
      const withPhone = leads.filter((l) => l.telefone && String(l.telefone).replace(/\D/g, '').length >= 10);
      let created = 0;
      let already = 0;
      for (const lead of withPhone) {
        const metaDetails = lead.ad_id ? adDetailsByAdId[lead.ad_id] : null;
        const tracking_data = {
          meta_lead_id: lead.id,
          form_id: lead.form_id,
          ad_id: lead.ad_id,
          field_data: lead.field_data || {},
          created_time: lead.created_time,
        };
        if (metaDetails) {
          tracking_data.meta_ad_details = metaDetails;
        }
        const { data } = await supabase.functions.invoke('create-lead-from-contact', {
          body: {
            cliente_id: effectiveClienteId,
            phone: lead.telefone,
            sender_name: lead.nome || null,
            pipeline_id: pipelineId,
            stage_id: stageId,
            origin_source: 'meta_ads',
            tracking_data,
          },
        });
        if (data?.created) created += 1;
        else if (data?.reason === 'already_exists') already += 1;
      }
      const skipped = withPhone.length - created - already;
      toast({
        title: 'Importação concluída',
        description: `${created} lead(s) importado(s).${already > 0 ? ` ${already} já existiam.` : ''}${withPhone.length < leads.length ? ` ${leads.length - withPhone.length} sem telefone válido, não importados.` : ''}`,
      });
      if (typeof onImported === 'function') onImported();
      onClose();
      setFormId('');
      setSinceDate('');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err?.message || 'Falha ao importar leads.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormId('');
      setSinceDate('');
      setPipelineId(pipelines?.[0]?.id || '');
      setStageId('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar leads do Facebook</DialogTitle>
          <DialogDescription>
            Busque leads da Gestão de leads dos anúncios (Lead Ads) pelo ID do formulário e importe para o funil. O token do Meta precisa ter a permissão &quot;leads_retrieval&quot; e a Página atribuída ao System User.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label htmlFor="form_id">ID do formulário (Form ID)</Label>
            <Input
              id="form_id"
              placeholder="Ex: 123456789012345"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Copie o ID na Gestão de leads dos anúncios no Facebook (configurações do formulário ou URL).</p>
          </div>
          <div>
            <Label htmlFor="since_date">A partir de (opcional)</Label>
            <Input
              id="since_date"
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Funil</Label>
            <Select value={pipelineId || ''} onValueChange={setPipelineId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {(pipelines || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={stageId || ''} onValueChange={setStageId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome || s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              <Label className="text-sm font-medium">Importação automática (webhook)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Quando um novo lead preenche o formulário no Facebook, ele pode ser importado automaticamente. Configure a página do Meta abaixo e use a URL no Meta Developer Console (Webhooks → Page → leadgen).
            </p>
            {effectiveClienteId && (
              <>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <Label className="text-xs">ID da Página do Facebook (page_id)</Label>
                    <Input
                      placeholder="Ex: 123456789012345"
                      value={metaPageId}
                      onChange={(e) => setMetaPageId(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Funil</Label>
                      <Select value={autoPipelineId || ''} onValueChange={setAutoPipelineId}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {(pipelines || []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome || p.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Etapa</Label>
                      <Select value={autoStageId || ''} onValueChange={setAutoStageId}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {autoStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.nome || s.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={handleSaveAutoImport} disabled={!metaPageId.trim() || !autoPipelineId || !autoStageId || savingAuto}>
                    {savingAuto ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Ativar importação automática
                  </Button>
                </div>
                {autoConfigs.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Páginas com importação automática ativa</Label>
                    <ul className="rounded-md border divide-y text-sm">
                      {autoConfigs.map((c) => (
                        <li key={c.id} className="flex items-center justify-between px-2 py-1.5">
                          <span className="font-mono text-xs">{c.meta_page_id}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveAutoConfig(c.id)} title="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rounded-md bg-muted/50 p-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">URL do webhook</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Copiado' }); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-mono break-all text-muted-foreground">{webhookUrl}</p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-muted-foreground">Token de verificação</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1" onClick={() => { navigator.clipboard.writeText(verifyToken); toast({ title: 'Copiado' }); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-mono text-muted-foreground">{verifyToken}</p>
                  <p className="text-muted-foreground pt-0.5">Configure o secret META_LEADGEN_WEBHOOK_VERIFY_TOKEN no Supabase (Edge Function Secrets) com este valor, ou o webhook usará o valor padrão acima.</p>
                </div>
              </>
            )}
          </div>

          <div className="border-t pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-600" />
              <Label className="text-sm font-medium">Sincronização automática (a cada 1 minuto)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Novos leads deste formulário serão importados automaticamente a cada 1 minuto. Não é necessário configurar webhook no Meta. Informe o ID do formulário, funil e etapa e ative a sincronização. Configure um cron externo para chamar a URL abaixo a cada 1 minuto (ou use pg_cron no Supabase).
            </p>
            {effectiveClienteId && (
              <>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <Label className="text-xs">ID do formulário (Form ID)</Label>
                    <Input
                      placeholder="Ex: 123456789012345"
                      value={pollFormId}
                      onChange={(e) => setPollFormId(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Funil</Label>
                      <Select value={pollPipelineId || ''} onValueChange={setPollPipelineId}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {(pipelines || []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome || p.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Etapa</Label>
                      <Select value={pollStageId || ''} onValueChange={setPollStageId}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          {pollStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.nome || s.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={handleSavePolling} disabled={!pollFormId.trim() || !pollPipelineId || !pollStageId || savingPolling}>
                    {savingPolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Ativar sincronização
                  </Button>
                </div>
                {pollingConfigs.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Formulários com sincronização ativa</Label>
                    <ul className="rounded-md border divide-y text-sm">
                      {pollingConfigs.map((c) => (
                        <li key={c.id} className="flex items-center justify-between px-2 py-1.5">
                          <span className="font-mono text-xs">{c.form_id}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemovePollingConfig(c.id)} title="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rounded-md bg-muted/50 p-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">URL da sincronização (cron a cada 1 min)</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1" onClick={() => { navigator.clipboard.writeText(syncUrl); toast({ title: 'Copiado' }); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-mono break-all text-muted-foreground">{syncUrl}</p>
                  <p className="text-muted-foreground pt-0.5">Configure um cron (ex.: cron-job.org, GitHub Actions ou VPS) para fazer GET ou POST nesta URL a cada 1 minuto, com header <code className="bg-muted px-1">Authorization: Bearer &lt;META_LEADGEN_SYNC_SECRET&gt;</code>. Defina o secret META_LEADGEN_SYNC_SECRET nas Edge Function Secrets do Supabase.</p>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!formId.trim() || !pipelineId || !stageId || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {loading ? 'Importando...' : 'Buscar e importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportFacebookLeadsModal;
