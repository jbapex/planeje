import React, { useState, useEffect } from 'react';
import { BarChart2, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { fetchMetaDatasetForWaba, listMetaWhatsappBusinessAccounts } from '@/lib/metaConversions';
import { fetchClienteMetaCtwaSettings } from '@/lib/metaCtwaClientToken';

/**
 * Configuração Meta Conversions API por canal (cliente_whatsapp_config).
 */
export default function MetaConversionsChannelSettings({ config, clienteId, onSaved }) {
  const { toast } = useToast();
  const [wabaId, setWabaId] = useState(config?.meta_waba_id || '');
  const [pageId, setPageId] = useState(config?.meta_page_id || '');
  const [datasetId, setDatasetId] = useState(config?.meta_dataset_id || '');
  const [enabled, setEnabled] = useState(!!config?.meta_conversions_enabled);
  const [saving, setSaving] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [wabaListLoading, setWabaListLoading] = useState(false);
  const [wabaList, setWabaList] = useState([]);
  const [clientBusinessId, setClientBusinessId] = useState('');
  const [clientHasToken, setClientHasToken] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    fetchClienteMetaCtwaSettings(clienteId).then((s) => {
      setClientBusinessId(s.businessId);
      setClientHasToken(s.hasToken);
    });
  }, [clienteId]);

  useEffect(() => {
    setWabaId(config?.meta_waba_id || '');
    setPageId(config?.meta_page_id || '');
    setDatasetId(config?.meta_dataset_id || '');
    setEnabled(!!config?.meta_conversions_enabled);
  }, [config?.id, config?.meta_waba_id, config?.meta_page_id, config?.meta_dataset_id, config?.meta_conversions_enabled]);

  const save = async () => {
    if (!config?.id || !clienteId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({
          meta_waba_id: wabaId.trim() || null,
          meta_page_id: pageId.trim() || null,
          meta_dataset_id: datasetId.trim() || null,
          meta_conversions_enabled: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id)
        .eq('cliente_id', clienteId);
      if (error) throw error;
      toast({ title: 'Conversões Meta salvas', description: config.name || 'Canal' });
      onSaved?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleListWabas = async () => {
    if (!clienteId) return;
    if (!clientHasToken) {
      toast({
        variant: 'destructive',
        title: 'Token do cliente não configurado',
        description: 'Salve o token Meta do cliente na seção acima (BM do cliente, não MADS).',
      });
      return;
    }
    setWabaListLoading(true);
    try {
      const res = await listMetaWhatsappBusinessAccounts(clienteId, clientBusinessId);
      if (res.error) {
        toast({ variant: 'destructive', title: 'Listar contas WhatsApp', description: res.error });
        setWabaList([]);
        return;
      }
      setWabaList(res.accounts || []);
      if (!res.accounts?.length) {
        toast({
          variant: 'destructive',
          title: 'Nenhuma conta na API',
          description:
            'No BM do cliente: atribua a Conta do WhatsApp ao System User e confira o ID do portfólio.',
        });
      }
    } finally {
      setWabaListLoading(false);
    }
  };

  const handleFetchDataset = async () => {
    const w = wabaId.trim();
    const p = pageId.trim().replace(/\D/g, '');
    if (!w && !p) {
      toast({ variant: 'destructive', title: 'Informe WABA ID ou Page ID' });
      return;
    }
    setDatasetLoading(true);
    try {
      const res = await fetchMetaDatasetForWaba(clienteId, { wabaId: w, pageId: p });
      if (res.error) {
        toast({ variant: 'destructive', title: 'Erro ao buscar dataset', description: res.error });
        return;
      }
      if (res.datasetId) {
        setDatasetId(String(res.datasetId));
        toast({
          title: 'Dataset obtido',
          description: res.wabaName || res.pageId || res.datasetId,
        });
      }
    } finally {
      setDatasetLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-3 mt-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <BarChart2 className="h-3.5 w-3.5 text-primary" />
          Conversões Meta (este canal)
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor={`meta-en-${config.id}`} className="text-[11px] text-muted-foreground">
            Enviar à Meta
          </Label>
          <Switch id={`meta-en-${config.id}`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Usa o <strong>token Meta do cliente</strong> (não MADS). Contatos deste canal ao marcar qualificado/comprou.
        {!clientHasToken && (
          <span className="block text-amber-700 dark:text-amber-400 mt-1">
            Configure o token na seção «Token Meta do cliente» acima.
          </span>
        )}
      </p>
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Page ID (Página Facebook do anúncio CTWA)</Label>
        <Input
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          className="h-8 font-mono text-xs"
          placeholder="Opcional — use em vez da WABA se a Meta rejeitar o par WABA+ctwa_clid"
        />
        <p className="text-[10px] text-muted-foreground leading-snug">
          ID da Página em Configurações da Página (não confundir com <code>sourceID</code> do webhook — costuma ser ID do
          anúncio). Se preenchido, o envio usa <code>page_id</code> + <code>ctwa_clid</code>.
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">WABA ID (alternativa)</Label>
        <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="h-8 font-mono text-xs" placeholder="ID da conta WhatsApp Business" />
        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={wabaListLoading} onClick={() => void handleListWabas()}>
          {wabaListLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Listar contas (API)
        </Button>
        {wabaList.length > 0 && (
          <Select value={wabaId || ''} onValueChange={setWabaId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Escolher conta" />
            </SelectTrigger>
            <SelectContent>
              {wabaList.map((w) => {
                const phones = (w.phone_numbers || [])
                  .map((p) => p.display_phone_number)
                  .filter(Boolean)
                  .join(', ');
                return (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.id}){phones ? ` — ${phones}` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Dataset ID</Label>
        <div className="flex gap-2">
          <Input
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            className="h-8 font-mono text-xs flex-1"
            placeholder="Manual ou Buscar"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            disabled={datasetLoading || (!wabaId.trim() && !pageId.trim())}
            onClick={() => void handleFetchDataset()}
          >
            {datasetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buscar'}
          </Button>
        </div>
      </div>
      <Alert className="py-2">
        <AlertDescription className="text-[10px]">
          Número = anúncio CTWA. Token do <strong>BM do cliente</strong> com permissões WhatsApp (não vincular WhatsApp na MADS).
        </AlertDescription>
      </Alert>
      <Button type="button" size="sm" className="h-8 w-full" disabled={saving} onClick={() => void save()}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Salvar Meta deste canal
      </Button>
    </div>
  );
}
