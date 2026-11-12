import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { TRAFEGO_BLOQUEIOS, serializeTrafegoDiario } from '@/lib/trafegoFila';

/**
 * Motivo operacional quando a pausa não vem da Meta (interruptor off).
 */
export default function TrafegoMotivoParadoDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  itemName,
  initialBloqueio = '',
  onSaved,
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bloqueio, setBloqueio] = useState(initialBloqueio || 'cliente');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = (next) => {
    if (next) {
      setBloqueio(initialBloqueio || 'cliente');
      setNota('');
    }
    onOpenChange(next);
  };

  const save = async () => {
    if (!clientId || !user?.id) return;
    if (!bloqueio && !nota.trim()) {
      toast({
        title: 'Escolha o motivo',
        description: 'Diga por que está parado — senão ninguém sabe se foi escolha ou problema.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const visto = [
      itemName ? `Pausa: ${itemName}` : 'Pausa operacional',
      nota.trim(),
    ]
      .filter(Boolean)
      .join(' · ');
    const observation = serializeTrafegoDiario({
      acoes: ['pausou'],
      bloqueio: bloqueio || '',
      visto,
      proximo: '',
      comentario: '',
    });
    const { error } = await supabase.from('cliente_meta_observations').insert({
      cliente_id: clientId,
      user_id: user.id,
      observation,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Motivo registrado', description: clientName || 'Conta' });
    onOpenChange(false);
    onSaved?.({ bloqueio: bloqueio || '', visto });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Por que está parado?</DialogTitle>
          <DialogDescription>
            {clientName || 'Conta'}
            {itemName ? ` · ${itemName}` : ''}. A Meta não apontou erro — anote o motivo operacional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1.5">Motivo</p>
            <div className="space-y-1">
              {TRAFEGO_BLOQUEIOS.filter((b) => b.id).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="motivo-parado"
                    checked={bloqueio === b.id}
                    onChange={() => setBloqueio(b.id)}
                    className="accent-violet-600"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="motivo-nota">Detalhe (opcional)</Label>
            <Textarea
              id="motivo-nota"
              className="mt-1"
              rows={2}
              placeholder="Ex.: Dia do Bacon era dia 31; cliente pediu pausa até sexta."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar motivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
