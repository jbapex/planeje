import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { activeStaff, functionAssignees } from '@/lib/operationalWorkflow';
import AutomationHelp from './AutomationHelp';

export default function OperationalFunctionsPanel({ functions, profiles, canManage, onChanged }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const available = profiles.filter(activeStaff);
  const save = async (event) => {
    event.preventDefault();
    if (saving.current || !canManage) return;
    setError('');
    if (!draft.name.trim()) { setError('Informe o nome da função.'); return; }
    try {
      if (draft.is_active) functionAssignees(draft, profiles);
      saving.current = true;
      setBusy(true);
      const value = { name: draft.name.trim(), assignee_ids: draft.assignee_ids, is_active: draft.is_active };
      const query = draft.id
        ? supabase.from('task_operational_functions').update(value).eq('id', draft.id)
        : supabase.from('task_operational_functions').insert(value);
      const { error: writeError } = await query.select('id').single();
      if (writeError) throw writeError;
      setDraft(null);
      await onChanged();
    } catch (failure) { setError(failure.code === '23505' ? 'Já existe uma função com esse nome.' : failure.code === '42501' ? 'Seu acesso não permite alterar funções.' : failure.message || 'Não foi possível salvar a função.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5" aria-label="Funções operacionais">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-semibold flex items-center gap-2">Funções
        <AutomationHelp label="Sobre as funções">Cada função reúne quem recebe a tarefa naquela etapa. Trocar as pessoas afeta os próximos encaminhamentos; tarefas existentes e histórico permanecem como estão. Funções não concedem acesso ao sistema.</AutomationHelp>
      </h3>
      {canManage && !draft && <Button size="sm" variant="outline" className="rounded-lg bg-background" onClick={() => { setError(''); setDraft({ name: '', assignee_ids: [], is_active: true }); }}>Nova função</Button>}
    </div>
    {!functions.length && !draft && <p className="text-sm text-muted-foreground">Nenhuma função cadastrada.</p>}
    {!draft && <div className="divide-y overflow-hidden rounded-xl border border-border/80 bg-background">{functions.map((fn) => <div key={fn.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <div><p className="font-medium">{fn.name}{!fn.is_active && <span className="ml-2 text-xs text-muted-foreground">Inativa</span>}</p>
        <p className="text-sm text-muted-foreground">{fn.assignee_ids.map((id) => {
          const profile = profiles.find((p) => p.id === id);
          return profile ? `${profile.full_name}${activeStaff(profile) ? '' : ' (indisponível)'}` : 'Pessoa sem perfil';
        }).join(', ') || 'Sem responsável'}</p>
      </div>
      {canManage && <Button size="sm" variant="outline" className="h-8 rounded-lg bg-background" onClick={() => { setError(''); setDraft({ ...fn }); }}>Editar <span className="sr-only">{fn.name}</span></Button>}
    </div>)}</div>}
    {draft && <form onSubmit={save} className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <label className="block text-sm">Nome da função<Input autoFocus value={draft.name} maxLength={80} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Revisão interna" /></label>
      <fieldset disabled={busy} className="space-y-2"><legend className="text-sm mb-2">Quem recebe</legend>
        {available.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.assignee_ids.includes(p.id)} onChange={(e) => setDraft({ ...draft, assignee_ids: e.target.checked ? [...draft.assignee_ids, p.id] : draft.assignee_ids.filter((id) => id !== p.id) })} />{p.full_name}
        </label>)}
        {draft.assignee_ids.filter((id) => !available.some((p) => p.id === id)).map((id) => <label key={id} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <input type="checkbox" checked onChange={() => setDraft({ ...draft, assignee_ids: draft.assignee_ids.filter((item) => item !== id) })} />{profiles.find((p) => p.id === id)?.full_name || 'Pessoa sem perfil'} (indisponível)
        </label>)}
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} disabled={busy} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />Função ativa</label>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar função'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancelar</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </section>;
}
