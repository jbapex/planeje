import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { listWhatsappGroups, saveClienteGrupo, suggestGrupoForCliente } from '@/lib/clienteWhatsappGrupo';
import { useToast } from '@/components/ui/use-toast';

export default function TrafegoVincularGrupoDialog({ row, open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listWhatsappGroups()
      .then((list) => {
        if (!cancelled) setGroups(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const suggested = useMemo(
    () => suggestGrupoForCliente(row?.client?.empresa, groups),
    [groups, row?.client?.empresa]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => String(g.display_name || '').toLowerCase().includes(q));
  }, [groups, query]);

  const pick = async (group) => {
    if (!row?.client?.id) return;
    setSaving(true);
    try {
      await saveClienteGrupo(row.client.id, group);
      toast({ title: 'Grupo vinculado', description: `${group.display_name} → ${row.client.empresa}` });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Não foi possível vincular', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular grupo · {row?.client?.empresa}</DialogTitle>
          <DialogDescription>
            Escolha o grupo de WhatsApp da equipe com este cliente. Depois o botão abre direto nessa conversa.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Buscar grupo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2"
        />
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="overflow-y-auto max-h-[50vh] space-y-1 pr-1">
            {suggested && (
              <button
                type="button"
                className="w-full text-left rounded-lg border border-violet-300 bg-violet-50 dark:bg-violet-950/40 px-3 py-2 text-sm"
                disabled={saving}
                onClick={() => pick(suggested)}
              >
                <span className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  Sugestão
                </span>
                <p className="font-medium">{suggested.display_name}</p>
              </button>
            )}
            {filtered.map((g) => (
              <button
                key={g.chat_jid}
                type="button"
                className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:border-violet-400"
                disabled={saving}
                onClick={() => pick(g)}
              >
                {g.display_name}
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum grupo com esse nome.</p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
