import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  boolToComercialOption,
  comercialOptionToBool,
  needsPurchaseValuePrompt,
  parseComercialValor,
  resolveComercialState,
} from '@/lib/leadComercial';
import { persistComercialPatch } from '@/lib/persistComercialPatch';
import { sendMetaConversionForComercialChange } from '@/lib/metaConversions';
import { sendGoogleConversionForComercialChange } from '@/lib/googleConversions';

const OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
];

/**
 * Edição inline de qualificado / comprou / valor (lead ou contato WhatsApp).
 * @param {'qualificado'|'comprou'|'valor'} [field] — uma coluna por vez; omitir = os três juntos (legado).
 */
export default function LeadComercialInline({
  clienteId,
  lead,
  contact,
  field,
  compact = false,
  embedded = false,
  onSaved,
  disabled = false,
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const state = resolveComercialState({ lead, contact });
  const [qualOpt, setQualOpt] = useState(boolToComercialOption(state.qualificado));
  const [comprouOpt, setComprouOpt] = useState(boolToComercialOption(state.comprou));
  const [valorStr, setValorStr] = useState(state.valor != null && state.valor > 0 ? String(state.valor) : '');
  const [valuePromptOpen, setValuePromptOpen] = useState(false);
  const [promptValor, setPromptValor] = useState('');

  useEffect(() => {
    const s = resolveComercialState({ lead, contact });
    setQualOpt(boolToComercialOption(s.qualificado));
    setComprouOpt(boolToComercialOption(s.comprou));
    setValorStr(s.valor != null && s.valor > 0 ? String(s.valor) : '');
  }, [lead, contact]);

  const persist = async (patch) => {
    if (!clienteId || disabled) return;
    setSaving(true);
    try {
      await persistComercialPatch({ clienteId, lead, contact, patch });
      onSaved?.();
      void sendMetaConversionForComercialChange({
        clienteId,
        patch,
        lead,
        contact,
        showToast: toast,
      });
      void sendGoogleConversionForComercialChange({
        clienteId,
        patch,
        lead,
        contact,
        showToast: toast,
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  const knownValor = parseComercialValor(valorStr) || parseComercialValor(state.valor);

  const confirmPurchase = (valor) => {
    const amount = parseComercialValor(valor);
    setValuePromptOpen(false);
    setPromptValor('');
    setComprouOpt('sim');
    if (amount > 0) setValorStr(String(amount));
    void persist({ comprou: true, valor: amount });
  };

  const closePurchasePrompt = (open) => {
    if (open) {
      setValuePromptOpen(true);
      return;
    }
    setValuePromptOpen(false);
    setPromptValor('');
  };

  const onQualChange = (v) => {
    setQualOpt(v);
    void persist({ qualificado: comercialOptionToBool(v) });
  };

  const onValorBlur = () => {
    const valor = parseComercialValor(valorStr);
    if (field === 'valor') {
      void persist({ valor });
      return;
    }
    void persist({
      comprou: comercialOptionToBool(comprouOpt),
      valor,
      qualificado: comercialOptionToBool(qualOpt),
    });
  };

  const onComprouChange = (v) => {
    const comprou = comercialOptionToBool(v);
    if (comprou === true && needsPurchaseValuePrompt(knownValor)) {
      setPromptValor('');
      window.setTimeout(() => setValuePromptOpen(true), 50);
      return;
    }
    setComprouOpt(v);
    void persist({
      comprou,
      valor: comprou === true ? knownValor : parseComercialValor(valorStr),
    });
  };

  const promptAmount = parseComercialValor(promptValor);
  const purchasePrompt = embedded ? (
    valuePromptOpen ? (
      <div className="rt-lead-ficha__purchase">
        <p>Valor da compra. Esse envio vai à Meta.</p>
        <Input
          type="number"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={promptValor}
          autoFocus
          className="h-8 text-xs"
          onChange={(e) => setPromptValor(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && promptAmount > 0) {
              event.preventDefault();
              confirmPurchase(promptValor);
            }
          }}
        />
        <div className="rt-lead-ficha__purchase-actions">
          <Button type="button" size="sm" className="h-7 text-[11px]" onClick={() => confirmPurchase(promptValor)} disabled={saving || promptAmount <= 0}>
            Enviar com valor
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => confirmPurchase(0)} disabled={saving}>
            Sem valor
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => closePurchasePrompt(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    ) : null
  ) : (
    <Dialog open={valuePromptOpen} onOpenChange={closePurchasePrompt}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Valor da compra</DialogTitle>
          <DialogDescription>
            Essa conversão ainda não tem valor. Envie sem valor ou informe o valor em reais antes de mandar.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium text-foreground" htmlFor="purchase-value-input">
          Valor (R$)
        </label>
        <Input
          id="purchase-value-input"
          type="number"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={promptValor}
          autoFocus
          onChange={(e) => setPromptValor(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && promptAmount > 0) {
              event.preventDefault();
              confirmPurchase(promptValor);
            }
          }}
        />
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button type="button" className="w-full" onClick={() => confirmPurchase(promptValor)} disabled={saving || promptAmount <= 0}>
            Enviar com valor
          </Button>
          <Button type="button" className="w-full" variant="outline" onClick={() => confirmPurchase(0)} disabled={saving}>
            Enviar sem valor
          </Button>
          <Button type="button" className="w-full" variant="ghost" onClick={() => closePurchasePrompt(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const selClass = compact ? 'h-8 text-xs w-full min-w-0' : 'h-8 text-xs w-full min-w-[100px]';
  const noLead = !lead?.id && !state.leadId && !contact?.id && !state.contactId;

  if (noLead) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const spinner = saving ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" /> : null;

  if (field === 'qualificado') {
    return (
      <div className={`flex items-center gap-1 ${saving ? 'opacity-70' : ''}`}>
        {spinner}
        <Select value={qualOpt} onValueChange={onQualChange} disabled={disabled || saving}>
          <SelectTrigger className={selClass} title="Qualificado?">
            <SelectValue placeholder="Pendente" />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={`q-${o.value}`} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field === 'comprou') {
    return (
      <>
        <div className={`flex items-center gap-1 ${saving ? 'opacity-70' : ''}`}>
          {spinner}
          <Select value={comprouOpt} onValueChange={onComprouChange} disabled={disabled || saving}>
            <SelectTrigger className={selClass} title="Comprou?">
              <SelectValue placeholder="Pendente" />
            </SelectTrigger>
            <SelectContent>
              {OPTIONS.map((o) => (
                <SelectItem key={`c-${o.value}`} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {purchasePrompt}
      </>
    );
  }

  if (field === 'valor') {
    return (
      <div className={`flex items-center gap-1 ${saving ? 'opacity-70' : ''}`}>
        {spinner}
        <Input
          type="number"
          min={0}
          step="0.01"
          placeholder="0,00"
          className={`${compact ? 'h-8' : 'h-8'} w-full min-w-0 text-xs`}
          value={valorStr}
          onChange={(e) => setValorStr(e.target.value)}
          onBlur={onValorBlur}
          disabled={disabled || saving}
          title="Valor da venda (R$)"
        />
      </div>
    );
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1 ${saving ? 'opacity-70' : ''}`}>
        {spinner}
        <Select value={qualOpt} onValueChange={onQualChange} disabled={disabled || saving}>
          <SelectTrigger className={selClass} title="Qualificado?">
            <SelectValue placeholder="Qualif." />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={`q-${o.value}`} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={comprouOpt} onValueChange={onComprouChange} disabled={disabled || saving}>
          <SelectTrigger className={selClass} title="Comprou?">
            <SelectValue placeholder="Comprou" />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={`c-${o.value}`} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          step="0.01"
          placeholder="R$"
          className={`${compact ? 'h-7 w-20' : 'h-8 w-24'} text-xs`}
          value={valorStr}
          onChange={(e) => setValorStr(e.target.value)}
          onBlur={onValorBlur}
          disabled={disabled || saving}
          title="Valor da venda"
        />
      </div>
      {purchasePrompt}
    </>
  );
}
