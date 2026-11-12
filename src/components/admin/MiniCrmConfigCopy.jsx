import React, { useEffect, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { applyMiniCrmConfigCopy, planMiniCrmConfigCopy, readMiniCrmConfigSnapshot } from '@/lib/miniCrmConfigCopy';

export default function MiniCrmConfigCopy({ clientId, clientName }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [statuses, setStatuses] = useState(true);
  const [columns, setColumns] = useState(true);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = profile?.role === 'superadmin' && profile?.status === 'active';

  useEffect(() => {
    let active = true;
    if (!allowed) return undefined;
    setPlan(null); setSourceId(''); setError('');
    supabase.from('clientes').select('id, empresa').order('empresa').then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) setError(failure.message || 'Não foi possível carregar os clientes.');
      else setClients((data || []).filter((client) => client.id !== clientId));
    });
    return () => { active = false; };
  }, [allowed, clientId]);

  if (!allowed) return null;
  const preview = async () => {
    setBusy(true); setError(''); setPlan(null);
    try {
      const [source, destination] = await Promise.all([
        readMiniCrmConfigSnapshot(supabase, sourceId), readMiniCrmConfigSnapshot(supabase, clientId),
      ]);
      setPlan(planMiniCrmConfigCopy({ source, destination, statuses, columns }));
    } catch (failure) { setError(failure.message || 'Não foi possível preparar a cópia.'); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      await applyMiniCrmConfigCopy(supabase, profile, plan);
      setPlan(null);
      toast({ title: 'Configuração copiada', description: `Mini CRM de ${clientName} atualizado. Os dados dos leads foram preservados.` });
    } catch (failure) { setError(failure.message || 'Não foi possível copiar.'); setPlan(null); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4 rounded-lg border p-4" aria-label="Copiar configuração do Mini CRM">
    <div><h3 className="text-sm font-semibold">Copiar configuração de outro cliente</h3>
      <p className="mt-1 text-xs text-muted-foreground">Copie os status e as colunas para {clientName}. Itens exclusivos do destino são mantidos, assim como os dados dos leads, vendedores e prazos de follow-up.</p></div>
    <div className="space-y-2"><Label htmlFor="mini-crm-copy-source">Cliente de origem</Label>
      <select id="mini-crm-copy-source" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourceId} disabled={busy} onChange={(event) => { setSourceId(event.target.value); setPlan(null); setError(''); }}>
        <option value="">Escolha um cliente…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
      </select></div>
    <div className="flex flex-wrap gap-5">
      <Label className="flex items-center gap-2"><Checkbox checked={statuses} disabled={busy} onCheckedChange={(value) => { setStatuses(value === true); setPlan(null); }} />Status e cores</Label>
      <Label className="flex items-center gap-2"><Checkbox checked={columns} disabled={busy} onCheckedChange={(value) => { setColumns(value === true); setPlan(null); }} />Colunas e ordem</Label>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {plan ? <div className="space-y-3 rounded-md bg-muted/50 p-3">
      <p className="text-sm font-medium">{plan.source.client.empresa} → {clientName}</p>
      {statuses ? <div className="text-xs"><strong>{plan.sourceCounts.statuses} status da origem</strong><p className="mt-1 text-muted-foreground">{plan.changes.statuses.map((item) => item.label).join(' · ')}</p></div> : null}
      {columns ? <div className="text-xs"><strong>{plan.sourceCounts.columns} colunas da origem</strong><p className="mt-1 text-muted-foreground">{plan.changes.columns.map((item) => item.label).join(' · ')}</p></div> : null}
      {plan.keptStatuses || plan.keptColumns ? <p className="text-xs text-muted-foreground">Itens exclusivos mantidos do destino: status ({plan.keptStatuses}) e colunas ({plan.keptColumns}).</p> : null}
      {plan.keptColumnTypes ? <p className="text-xs text-muted-foreground">{plan.keptColumnTypes} coluna(s) mantêm o tipo do destino para preservar os valores existentes.</p> : null}
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={apply} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}Confirmar cópia</Button>
        <Button size="sm" variant="outline" onClick={() => setPlan(null)} disabled={busy}>Cancelar</Button></div>
    </div> : <Button size="sm" variant="outline" onClick={preview} disabled={busy || !sourceId || (!statuses && !columns)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}Ver prévia da cópia</Button>}
  </section>;
}
