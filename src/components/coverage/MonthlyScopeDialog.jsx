import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CHANNEL_OPTIONS } from '@/lib/taskChannelPublications';
import { SCOPE_DELIVERABLES } from '@/lib/clientMonthlyScopes';

export default function MonthlyScopeDialog({ open, onOpenChange, scope, clientName, monthLabel, saving, onSave, canViewField = () => true, referenceLabel, onUseCurrentContract }) {
  const [form, setForm] = useState(scope);

  useEffect(() => setForm(scope), [scope]);
  if (!form) return null;

  const changeDeliverable = (key, value) => {
    setForm((current) => ({
      ...current,
      deliverables: {
        ...(current.deliverables || {}),
        [key]: Math.max(0, Number.parseInt(value, 10) || 0),
      },
    }));
  };

  const toggleChannel = (channel) => {
    setForm((current) => {
      const channels = current.channels || [];
      return {
        ...current,
        channels: channels.includes(channel)
          ? channels.filter((item) => item !== channel)
          : [...channels, channel],
      };
    });
  };

  const changeGoal = (key, value) => setForm((current) => ({
    ...current,
    media_goals: { ...(current.media_goals || {}), [key]: value },
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(event) => { if (saving) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Escopo mensal · {clientName}</DialogTitle>
          <DialogDescription className="capitalize">{monthLabel}</DialogDescription>
        </DialogHeader>

        <fieldset disabled={saving} className="space-y-5 py-2 min-w-0">
          {referenceLabel && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{referenceLabel}</span>
            {onUseCurrentContract && <Button variant="ghost" size="sm" onClick={onUseCurrentContract} disabled={saving}>Usar contrato atual</Button>}
          </div>}
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <span>Este registro vale somente para este mês.</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Como funciona o escopo mensal?">
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-sm">
                O mês pode usar o escopo anterior ou o contrato atual como referência. Alterações feitas aqui ficam registradas no histórico e não mudam outros meses. O andamento do planejamento é acompanhado em Projetos.
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Produto</Label>
              <Select value={form.product || 'indefinido'} onValueChange={(value) => setForm((current) => ({ ...current, product: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="execucao_completa">Execução completa</SelectItem>
                  <SelectItem value="execucao_parcial">Execução parcial</SelectItem>
                  <SelectItem value="apenas_consultoria">Apenas consultoria</SelectItem>
                  <SelectItem value="trafego">Tráfego</SelectItem>
                  <SelectItem value="indefinido">A definir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canViewField('entregaveis') && <div className="space-y-2">
            <div>
              <h4 className="font-medium">Entregas contratadas no mês</h4>
              <p className="text-xs text-muted-foreground">Informe quantas unidades deste cliente precisam entrar no planejamento.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SCOPE_DELIVERABLES.map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`scope-${key}`} className="text-xs">{label}</Label>
                  <Input
                    id={`scope-${key}`}
                    type="number"
                    min="0"
                    value={form.deliverables?.[key] ?? 0}
                    onChange={(event) => changeDeliverable(key, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>}

          <div className="space-y-2">
            <Label>Canais incluídos</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((channel) => (
                <Button
                  key={channel}
                  type="button"
                  size="sm"
                  variant={(form.channels || []).includes(channel) ? 'default' : 'outline'}
                  onClick={() => toggleChannel(channel)}
                >
                  {channel}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant={form.meta_ads ? 'default' : 'outline'} onClick={() => setForm((current) => ({ ...current, meta_ads: !current.meta_ads }))}>
              Meta Ads {form.meta_ads ? 'incluído' : 'não incluído'}
            </Button>
            <Button type="button" variant={form.google_ads ? 'default' : 'outline'} onClick={() => setForm((current) => ({ ...current, google_ads: !current.google_ads }))}>
              Google Ads {form.google_ads ? 'incluído' : 'não incluído'}
            </Button>
          </div>

          <details className="rounded-lg border p-3" open={Boolean(form.meta_ads || form.google_ads)}>
            <summary className="cursor-pointer font-medium text-sm">Objetivo e metas de tráfego do mês</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {canViewField('objetivo_meta') && <div className="space-y-1">
                <Label htmlFor="scope-media-objective">Objetivo</Label>
                <Input id="scope-media-objective" value={form.media_goals?.objetivo_meta || ''} onChange={(event) => changeGoal('objetivo_meta', event.target.value)} placeholder="Ex.: gerar mensagens e vendas" />
              </div>}
              {[
                ['budget', 'Verba do mês (R$)', 'valor'],
                ['meta_custo_mensagem', 'Meta de custo por mensagem (R$)', 'meta_custo_mensagem'],
                ['meta_custo_compra', 'Meta de custo por compra (R$)', 'meta_custo_compra'],
                ['roas_alvo', 'ROAS desejado', 'roas_alvo'],
              ].filter(([, , permission]) => canViewField(permission)).map(([key, label]) => <div key={key} className="space-y-1">
                <Label htmlFor={`scope-media-${key}`}>{label}</Label>
                <Input id={`scope-media-${key}`} type="number" min="0" step="0.01" value={form.media_goals?.[key] ?? ''} onChange={(event) => changeGoal(key, event.target.value)} placeholder="Não definido" />
              </div>)}
            </div>
          </details>

          <div className="space-y-1">
            <Label htmlFor="scope-exceptions">Exceções deste mês</Label>
            <Textarea
              id="scope-exceptions"
              rows={3}
              value={form.scope_exceptions || ''}
              onChange={(event) => setForm((current) => ({ ...current, scope_exceptions: event.target.value }))}
              placeholder="Ex.: duas peças extras para a campanha de lançamento."
            />
          </div>
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => onSave(form)} disabled={saving}>{saving ? 'Salvando…' : 'Salvar escopo do mês'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
