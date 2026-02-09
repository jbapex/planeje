import React, { useState, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const DATE_DISPLAY_FORMAT = 'dd/MM/yyyy';
const DATE_API_FORMAT = 'yyyy-MM-dd';

function formatToDisplay(isoDate) {
  if (!isoDate) return '';
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? isoDate : format(date, DATE_DISPLAY_FORMAT, { locale: ptBR });
  } catch {
    return isoDate;
  }
}

function parseFromDisplay(str) {
  if (!str || !str.trim()) return null;
  const normalized = str.trim().replace(/\s/g, '');
  for (const fmt of ['dd/MM/yyyy', 'd/M/yyyy', 'dd/MM/yy', 'd/M/yy']) {
    try {
      const d = parse(normalized, fmt, new Date(), { locale: ptBR });
      if (!isNaN(d.getTime())) return format(d, DATE_API_FORMAT);
    } catch {
      continue;
    }
  }
  return null;
}

const OUTRO_VALUE = '__outro__';
const ITEM_TIPO_PRODUTO = 'produto';
const ITEM_TIPO_SERVICO = 'serviço';

const emptyItem = () => ({
  item_tipo: ITEM_TIPO_PRODUTO,
  product_id: null,
  service_id: null,
  descricao: '',
  quantidade: 1,
  valor_unitario: 0,
  valor_total: 0,
});

function itemFromVendaItem(it) {
  const tipo = it.item_tipo === ITEM_TIPO_SERVICO ? ITEM_TIPO_SERVICO : ITEM_TIPO_PRODUTO;
  const desc = it.descricao || (tipo === ITEM_TIPO_SERVICO ? (it.service?.name || it.service?.code) : (it.product?.name || it.product?.code)) || '';
  return {
    item_tipo: tipo,
    product_id: it.product_id || null,
    service_id: it.service_id || null,
    descricao: desc,
    quantidade: Number(it.quantidade) || 1,
    valor_unitario: Number(it.valor_unitario) || 0,
    valor_total: Number(it.valor_total) || 0,
  };
}

export default function RegisterSaleModal({ isOpen, onClose, lead, venda, onSuccess }) {
  const isEdit = !!venda;
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const todayIso = () => format(new Date(), DATE_API_FORMAT);
  const [dataVenda, setDataVenda] = useState(() => todayIso());
  const [dataVendaDisplay, setDataVendaDisplay] = useState(() => formatToDisplay(todayIso()));
  const [observacoes, setObservacoes] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  useEffect(() => {
    if (!isOpen || !lead?.cliente_id) return;
    if (isEdit && venda) {
      const iso = (typeof venda.data_venda === 'string' && venda.data_venda.match(/^\d{4}-\d{2}-\d{2}/))
        ? venda.data_venda.slice(0, 10)
        : todayIso();
      setDataVenda(iso);
      setDataVendaDisplay(formatToDisplay(iso));
      setObservacoes(venda.observacoes || '');
      const itensFromVenda = Array.isArray(venda.crm_venda_itens) && venda.crm_venda_itens.length > 0
        ? venda.crm_venda_itens.map(itemFromVendaItem)
        : [emptyItem()];
      setItems(itensFromVenda);
    } else {
      const iso = todayIso();
      setDataVenda(iso);
      setDataVendaDisplay(formatToDisplay(iso));
      setObservacoes('');
      setItems([emptyItem()]);
    }
    setLoadingCatalogs(true);
    Promise.all([
      supabase.from('crm_produtos').select('id, name, code').eq('cliente_id', lead.cliente_id),
      supabase.from('crm_servicos').select('id, name, code').eq('cliente_id', lead.cliente_id),
    ]).then(([rProd, rServ]) => {
      setProducts(rProd.data || []);
      setServices(rServ.data || []);
    }).finally(() => setLoadingCatalogs(false));
  }, [isOpen, lead?.cliente_id, isEdit, venda?.id]);

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i !== index ? it : { ...it, [field]: value }));
      const item = next[index];
      if (field === 'quantidade' || field === 'valor_unitario') {
        const qtd = Number(item.quantidade) || 0;
        const unit = Number(item.valor_unitario) || 0;
        next[index] = { ...item, valor_total: Math.round(qtd * unit * 100) / 100 };
      }
      if (field === 'item_tipo') {
        next[index] = {
          ...item,
          item_tipo: value,
          product_id: value === ITEM_TIPO_SERVICO ? null : item.product_id,
          service_id: value === ITEM_TIPO_PRODUTO ? null : item.service_id,
          descricao: value === ITEM_TIPO_SERVICO ? (item.service_id ? '' : item.descricao) : (item.product_id ? '' : item.descricao),
        };
      }
      if (field === 'product_id') {
        if (value === OUTRO_VALUE) {
          next[index] = { ...item, product_id: null, descricao: item.descricao || '' };
        } else {
          const prod = products.find((p) => p.id === value);
          next[index] = { ...item, product_id: value || null, descricao: prod?.name || '' };
        }
      }
      if (field === 'service_id') {
        if (value === OUTRO_VALUE) {
          next[index] = { ...item, service_id: null, descricao: item.descricao || '' };
        } else {
          const serv = services.find((s) => s.id === value);
          next[index] = { ...item, service_id: value || null, descricao: serv?.name || serv?.code || '' };
        }
      }
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const valorTotalVenda = items.reduce((acc, it) => acc + (Number(it.valor_total) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!lead?.id || !lead?.cliente_id) return;
    const validItems = items.filter(
      (it) => (it.product_id || it.service_id || (it.descricao && it.descricao.trim())) && (Number(it.quantidade) || 0) > 0
    );
    if (validItems.length === 0) {
      toast({ variant: 'destructive', title: 'Adicione pelo menos um item (produto ou serviço) com quantidade e valor.' });
      return;
    }
    setSaving(true);
    const valorTotal = Math.round(valorTotalVenda * 100) / 100;
    const payload = {
      data_venda: dataVenda,
      valor_total: valorTotal,
      observacoes: observacoes.trim() || null,
    };
    try {
      if (isEdit && venda?.id) {
        const { error: errUpdate } = await supabase
          .from('crm_vendas')
          .update(payload)
          .eq('id', venda.id);
        if (errUpdate) throw errUpdate;
        const { error: errDel } = await supabase.from('crm_venda_itens').delete().eq('venda_id', venda.id);
        if (errDel) throw errDel;
        const itensToInsert = validItems.map((it) => ({
          venda_id: venda.id,
          item_tipo: it.item_tipo || ITEM_TIPO_PRODUTO,
          product_id: it.item_tipo === ITEM_TIPO_SERVICO ? null : (it.product_id || null),
          service_id: it.item_tipo === ITEM_TIPO_PRODUTO ? null : (it.service_id || null),
          descricao: (it.descricao || '').trim() || null,
          quantidade: Number(it.quantidade) || 1,
          valor_unitario: Number(it.valor_unitario) || 0,
          valor_total: Number(it.valor_total) || 0,
        }));
        const { error: errItens } = await supabase.from('crm_venda_itens').insert(itensToInsert);
        if (errItens) throw errItens;
        toast({ title: 'Venda atualizada', description: 'As alterações foram salvas.' });
      } else {
        const { data: newVenda, error: errVenda } = await supabase
          .from('crm_vendas')
          .insert({
            lead_id: lead.id,
            cliente_id: lead.cliente_id,
            ...payload,
          })
          .select('id')
          .single();
        if (errVenda) throw errVenda;
        const itensToInsert = validItems.map((it) => ({
          venda_id: newVenda.id,
          item_tipo: it.item_tipo || ITEM_TIPO_PRODUTO,
          product_id: it.item_tipo === ITEM_TIPO_SERVICO ? null : (it.product_id || null),
          service_id: it.item_tipo === ITEM_TIPO_PRODUTO ? null : (it.service_id || null),
          descricao: (it.descricao || '').trim() || null,
          quantidade: Number(it.quantidade) || 1,
          valor_unitario: Number(it.valor_unitario) || 0,
          valor_total: Number(it.valor_total) || 0,
        }));
        const { error: errItens } = await supabase.from('crm_venda_itens').insert(itensToInsert);
        if (errItens) throw errItens;
        toast({ title: 'Venda registrada', description: 'A venda foi vinculada ao lead.' });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({ variant: 'destructive', title: isEdit ? 'Erro ao atualizar venda' : 'Erro ao registrar venda', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-4xl min-w-[min(100vw-2rem,640px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar venda' : 'Registrar venda'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Altere a data, itens e observações da venda.'
              : `Registre a venda para o lead ${lead.nome}. Adicione itens como produto (mercadoria) ou serviço (ex.: mecânica, odontologia).`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_venda">Data da venda</Label>
              <Input
                id="data_venda"
                type="text"
                placeholder="dd/mm/aaaa"
                value={dataVendaDisplay}
                onChange={(e) => {
                  const v = e.target.value;
                  setDataVendaDisplay(v);
                  const parsed = parseFromDisplay(v);
                  if (parsed) setDataVenda(parsed);
                }}
                onBlur={() => {
                  const parsed = parseFromDisplay(dataVendaDisplay);
                  if (!parsed && dataVendaDisplay) setDataVendaDisplay(formatToDisplay(dataVenda));
                  if (!dataVendaDisplay.trim()) setDataVendaDisplay(formatToDisplay(dataVenda));
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Itens</Label>
            <p className="text-xs text-muted-foreground">Produto (mercadoria) ou Serviço (ex.: mecânica, odontologia). Itens em lista, um abaixo do outro.</p>
            <div className="rounded-md border overflow-hidden min-w-0">
              {/* Cabeçalho: larguras mínimas para Tipo e Qtd ficarem legíveis */}
              <div className="grid grid-cols-[minmax(88px,88px)_1fr_minmax(64px,72px)_minmax(88px,100px)_minmax(80px,90px)_40px] gap-2 items-center px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <div>Tipo</div>
                <div>Produto / Serviço</div>
                <div>Qtd</div>
                <div>Valor unit.</div>
                <div>Total</div>
                <div />
              </div>
              {/* Linhas empilhadas */}
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(88px,88px)_1fr_minmax(64px,72px)_minmax(88px,100px)_minmax(80px,90px)_40px] gap-2 items-center px-2 py-1.5 border-b border-border/60 last:border-b-0 hover:bg-muted/20 transition-colors min-w-0">
                  <div className="min-w-0">
                    <Select
                      value={item.item_tipo}
                      onValueChange={(v) => updateItem(index, 'item_tipo', v)}
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 border border-input bg-background shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ITEM_TIPO_PRODUTO}>Produto</SelectItem>
                        <SelectItem value={ITEM_TIPO_SERVICO}>Serviço</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 flex flex-col gap-0.5">
                    {item.item_tipo === ITEM_TIPO_SERVICO ? (
                      item.service_id ? (
                        <div className="flex items-center gap-1.5 h-8">
                          <span className="text-sm truncate flex-1">{services.find((s) => s.id === item.service_id)?.name || item.descricao}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => updateItem(index, 'service_id', null)}>
                            Alterar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Input
                            placeholder="Ex: Troca de óleo"
                            className="h-8 flex-1 text-sm"
                            value={item.descricao}
                            onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                          />
                          {(services || []).length > 0 && (
                            <Select
                              value=""
                              onValueChange={(v) => {
                                if (v) {
                                  const s = services.find((x) => x.id === v);
                                  if (s) updateItem(index, 'service_id', v), updateItem(index, 'descricao', s.name || s.code || '');
                                }
                              }}
                              disabled={loadingCatalogs}
                            >
                              <SelectTrigger className="h-8 w-[100px] shrink-0">
                                <SelectValue placeholder="Catálogo" />
                              </SelectTrigger>
                              <SelectContent>
                                {(services || []).map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name || s.code || s.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )
                    ) : (
                      item.product_id ? (
                        <div className="flex items-center gap-1.5 h-8">
                          <span className="text-sm truncate flex-1">{products.find((p) => p.id === item.product_id)?.name || item.descricao}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => updateItem(index, 'product_id', null)}>
                            Alterar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Input
                            placeholder="Ex: Areia m³"
                            className="h-8 flex-1 text-sm"
                            value={item.descricao}
                            onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                          />
                          {(products || []).length > 0 && (
                            <Select
                              value=""
                              onValueChange={(v) => {
                                if (v) {
                                  const p = products.find((x) => x.id === v);
                                  if (p) updateItem(index, 'product_id', v), updateItem(index, 'descricao', p.name || p.code || '');
                                }
                              }}
                              disabled={loadingCatalogs}
                            >
                              <SelectTrigger className="h-8 w-[100px] shrink-0">
                                <SelectValue placeholder="Catálogo" />
                              </SelectTrigger>
                              <SelectContent>
                                {(products || []).map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name || p.code || p.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )
                    )}
                  </div>
                  <div className="min-w-0">
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-full"
                      value={item.quantidade}
                      onChange={(e) => updateItem(index, 'quantidade', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="h-8 w-full"
                      value={item.valor_unitario || ''}
                      onChange={(e) => updateItem(index, 'valor_unitario', e.target.value)}
                    />
                  </div>
                  <div className="flex items-center text-sm font-medium min-w-0 truncate">
                    {Number(item.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar item
            </Button>
          </div>
          <div className="flex justify-end text-sm font-medium">
            Total da venda: {valorTotalVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              rows={2}
              placeholder="Opcional"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? 'Salvar alterações' : 'Registrar venda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
