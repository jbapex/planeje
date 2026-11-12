import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { loadRastreamentoConversionRules } from '@/lib/applyRastreamentoConversionRules';
import {
  CONVERSION_EVENT_NAMES,
  CONVERSION_TRIGGER_TYPES,
  conversionEventLabel,
} from '@/lib/rastreamentoConversionRules';

const emptyForm = {
  name: '',
  trigger_type: 'etiqueta',
  trigger_value: '',
  event_name: 'QualifiedLead',
};

export default function RastreamentoGatilhosCard({ clienteId }) {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    if (!clienteId) {
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      setRules(await loadRastreamentoConversionRules(clienteId));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não carregou os gatilhos', description: error.message });
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRule = async (event) => {
    event.preventDefault();
    if (!clienteId || !form.trigger_value.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('rastreamento_conversion_rules').insert({
        cliente_id: clienteId,
        name: form.name.trim() || form.trigger_value.trim(),
        trigger_type: form.trigger_type,
        trigger_value: form.trigger_value.trim(),
        match_mode: 'contains',
        event_name: form.event_name,
        active: true,
      });
      if (error) throw error;
      setForm(emptyForm);
      await load();
      toast({ title: 'Gatilho salvo' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não salvou o gatilho', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule, active) => {
    const { error } = await supabase
      .from('rastreamento_conversion_rules')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', rule.id)
      .eq('cliente_id', clienteId);
    if (error) {
      toast({ variant: 'destructive', title: 'Não atualizou', description: error.message });
      return;
    }
    await load();
  };

  const remove = async (rule) => {
    const { error } = await supabase
      .from('rastreamento_conversion_rules')
      .delete()
      .eq('id', rule.id)
      .eq('cliente_id', clienteId);
    if (error) {
      toast({ variant: 'destructive', title: 'Não excluiu', description: error.message });
      return;
    }
    await load();
  };

  if (!clienteId) return null;

  return (
    <div>
      <p className="rt-kicker" style={{ marginBottom: 10 }}>Novo gatilho</p>
      <form className="rt-settings-form" onSubmit={addRule}>
        <div className="rt-settings-field">
          <Label className="text-[11px]">Nome</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="h-9"
            placeholder="Qualificado no WhatsApp"
          />
        </div>
        <div className="rt-settings-field">
          <Label className="text-[11px]">Quando</Label>
          <Select
            value={form.trigger_type}
            onValueChange={(value) => setForm((prev) => ({ ...prev, trigger_type: value }))}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONVERSION_TRIGGER_TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rt-settings-field">
          <Label className="text-[11px]">Etiqueta ou frase</Label>
          <Input
            value={form.trigger_value}
            onChange={(e) => setForm((prev) => ({ ...prev, trigger_value: e.target.value }))}
            className="h-9"
            placeholder="qualificado"
            required
          />
        </div>
        <div className="rt-settings-field">
          <Label className="text-[11px]">Evento Meta</Label>
          <Select
            value={form.event_name}
            onValueChange={(value) => setForm((prev) => ({ ...prev, event_name: value }))}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONVERSION_EVENT_NAMES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-9" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
          Adicionar
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Nenhum gatilho neste cliente. Crie o primeiro acima.</p>
      ) : (
        <ul className="rt-rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className="rt-rule">
              <div className="rt-rule__copy">
                <p>{rule.name}</p>
                <small>
                  {rule.trigger_type === 'etiqueta' ? 'Etiqueta' : 'Mensagem'} “{rule.trigger_value}” →{' '}
                  {conversionEventLabel(rule.event_name)}
                </small>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {conversionEventLabel(rule.event_name)}
              </span>
              <Switch checked={rule.active} onCheckedChange={(active) => toggle(rule, active)} />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(rule)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
