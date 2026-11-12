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

export default function TrafegoDiarioDialog({ row, open, onOpenChange, onSaved }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [nota, setNota] = useState('');
  const [bloqueio, setBloqueio] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = (next) => {
    if (next) {
      setNota('');
      setBloqueio(row?.bloqueio || '');
    }
    onOpenChange(next);
  };

  const save = async () => {
    if (!row?.client?.id || !user?.id) return;
    if (!nota.trim() && !bloqueio) {
      toast({
        title: 'Escreva o que fez',
        description: 'Uma linha basta: pausei X, gastei Y, próximo passo…',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const observation = serializeTrafegoDiario({
      acoes: ['analise'],
      bloqueio,
      visto: nota.trim(),
      proximo: '',
      comentario: '',
    });
    const { error } = await supabase.from('cliente_meta_observations').insert({
      cliente_id: row.client.id,
      user_id: user.id,
      observation,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Registrado', description: row.client.empresa });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar visita · {row?.client?.empresa}</DialogTitle>
          <DialogDescription>
            Escreva o que você fez na Meta. Uma linha basta. Sem isso, ninguém sabe que esta conta foi olhada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="trafego-nota">O que você fez</Label>
            <Textarea
              id="trafego-nota"
              className="mt-1"
              rows={4}
              placeholder="Ex.: CPA alto, pausei o conjunto de remarketing. Troco criativo amanhã."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-1.5">Está parado esperando alguém?</p>
            <div className="space-y-1">
              {TRAFEGO_BLOQUEIOS.map((b) => (
                <label key={b.id || 'none'} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="bloqueio"
                    checked={bloqueio === b.id}
                    onChange={() => setBloqueio(b.id)}
                    className="accent-violet-600"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Registrar visita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
