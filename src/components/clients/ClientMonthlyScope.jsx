import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, HelpCircle, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useClientMonthlyScope } from '@/hooks/useClientMonthlyScope';
import { clientScopeReference, formatScopeMonth, newClientMonthlyScope, scopeDeliverables, scopeReferenceMonth, SCOPE_DELIVERABLES } from '@/lib/clientMonthlyScopes';
import MonthlyScopeDialog from '@/components/coverage/MonthlyScopeDialog';
import MonthlyScopeSummary from './MonthlyScopeSummary';

const MONTHS = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, index, 1)));
const HISTORY_PAGE = 20;

function historyChanges(entry, canViewField) {
  if (entry.action === 'created') return ['Escopo mensal registrado'];
  if (entry.action === 'deleted') return ['Escopo mensal removido'];
  const before = entry.before_data || {};
  const after = entry.after_data || {};
  const changes = SCOPE_DELIVERABLES.filter(([key]) => canViewField('entregaveis') && Number(before.deliverables?.[key] || 0) !== Number(after.deliverables?.[key] || 0))
    .map(([key, label]) => `${label}: ${before.deliverables?.[key] || 0} → ${after.deliverables?.[key] || 0}`);
  [['product', 'Serviço'], ['channels', 'Canais'], ['meta_ads', 'Meta Ads'], ['google_ads', 'Google Ads'], ['media_goals', 'Metas de tráfego'], ['scope_exceptions', 'Ajustes do mês']]
    .forEach(([key, label]) => { if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push(`${label} atualizado${key === 'scope_exceptions' ? 's' : ''}`); });
  return changes.length ? changes : ['Registro atualizado'];
}

export default function ClientMonthlyScope({ client }) {
  const { profile, canViewField } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = scopeReferenceMonth(searchParams.get('month')) || scopeReferenceMonth(new Date());
  const { scope, loading, error, refresh } = useClientMonthlyScope(client?.id, month);
  const [editing, setEditing] = useState(null);
  const [draftSource, setDraftSource] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyUsers, setHistoryUsers] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const sectionRef = useRef(null);
  const saveLock = useRef(false);
  const historyRequest = useRef(0);
  const editorRequest = useRef(0);
  const canManage = ['superadmin', 'admin'].includes(profile?.role);
  const sectionRequested = searchParams.get('section') === 'escopo';
  const year = Number(month.slice(0, 4));
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from(new Set([year, ...Array.from({ length: 9 }, (_, index) => currentYear - 5 + index)])).sort((a, b) => a - b), [year, currentYear]);

  useEffect(() => { if (sectionRequested) sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [sectionRequested]);
  useEffect(() => {
    historyRequest.current += 1;
    editorRequest.current += 1;
    setEditing(null); setPreparing(false); setHistoryOpen(false); setHistory([]); setHistoryError(null); setHistoryLoading(false); setHistoryMore(false);
    return () => { historyRequest.current += 1; editorRequest.current += 1; };
  }, [client?.id, month]);

  const selectMonth = (value) => {
    if (saving) return;
    const next = new URLSearchParams(searchParams);
    next.set('section', 'escopo'); next.set('month', value.slice(0, 7));
    setSearchParams(next, { replace: true });
  };
  const moveMonth = (delta) => {
    const date = new Date(`${month}T12:00:00`);
    date.setMonth(date.getMonth() + delta);
    selectMonth(scopeReferenceMonth(date));
  };

  const openEditor = async () => {
    if (!canManage || preparing || loading || error) return;
    if (scope) { setDraftSource(''); setEditing(scope); return; }
    const request = ++editorRequest.current;
    setPreparing(true);
    try {
      const { data, error: previousError } = await supabase.from('client_monthly_scopes').select('*')
        .eq('client_id', client.id).lt('reference_month', month).order('reference_month', { ascending: false }).limit(1).maybeSingle();
      if (previousError) throw previousError;
      if (request !== editorRequest.current) return;
      setDraftSource(data ? `Referência: escopo de ${formatScopeMonth(data.reference_month)}` : 'Referência: contrato atual do cadastro');
      setEditing(newClientMonthlyScope(client, month, data));
    } catch (error) {
      if (request === editorRequest.current) toast({ title: 'Não foi possível abrir o escopo', description: error.message, variant: 'destructive' });
    } finally { if (request === editorRequest.current) setPreparing(false); }
  };

  const loadHistory = async (append = false) => {
    const request = ++historyRequest.current;
    setHistoryOpen(true); setHistoryLoading(true); setHistoryError(null);
    try {
      const offset = append ? history.length : 0;
      const { data, error: queryError } = await supabase.from('client_monthly_scope_history').select('*')
        .eq('client_id', client.id).eq('reference_month', month).order('changed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + HISTORY_PAGE - 1);
      if (queryError) throw queryError;
      const ids = [...new Set((data || []).map((entry) => entry.changed_by).filter(Boolean))];
      let names = {};
      if (ids.length) {
        const users = await supabase.from('profiles').select('id, full_name').in('id', ids);
        names = Object.fromEntries((users.data || []).map((user) => [user.id, user.full_name]));
      }
      if (request !== historyRequest.current) return;
      setHistory((previous) => append ? [...previous, ...(data || [])] : data || []);
      setHistoryUsers((previous) => ({ ...previous, ...names }));
      setHistoryMore((data || []).length === HISTORY_PAGE);
    } catch (error) { if (request === historyRequest.current) setHistoryError(error.message); }
    finally { if (request === historyRequest.current) setHistoryLoading(false); }
  };

  const save = async (next) => {
    if (!canManage || saveLock.current) return;
    saveLock.current = true; setSaving(true);
    try {
      const numericGoals = ['budget', 'meta_custo_mensagem', 'meta_custo_compra', 'roas_alvo'];
      const goals = { ...(next.media_goals || {}) };
      for (const key of numericGoals) {
        if (goals[key] === '' || goals[key] == null) continue;
        if (!Number.isFinite(Number(goals[key])) || Number(goals[key]) < 0) throw new Error('As metas e a verba devem ser números iguais ou maiores que zero.');
        goals[key] = Number(goals[key]);
      }
      const values = {
        product: next.product || 'indefinido', deliverables: scopeDeliverables(next.deliverables),
        channels: next.channels || [], meta_ads: Boolean(next.meta_ads), google_ads: Boolean(next.google_ads),
        media_goals: goals, scope_exceptions: next.scope_exceptions || null,
      };
      let result;
      if (scope?.id) {
        result = await supabase.from('client_monthly_scopes').update(values).eq('id', scope.id).eq('updated_at', scope.updated_at).select('id').maybeSingle();
        if (!result.error && !result.data) throw new Error('Outra pessoa atualizou este escopo. Feche o editor, atualize a ficha e confira a versão mais recente antes de salvar.');
      } else {
        result = await supabase.from('client_monthly_scopes').insert({
          ...values, client_id: client.id, reference_month: month, cloned_from_scope_id: next.cloned_from_scope_id || null,
          account_owner_id: next.account_owner_id || null, created_by: profile.id, updated_by: profile.id,
        });
      }
      if (result.error) {
        if (result.error.code === '23505') throw new Error('Este mês já foi registrado por outra pessoa. Feche o editor e atualize a ficha para conferir o escopo.');
        throw result.error;
      }
      setEditing(null); setHistoryOpen(false);
      toast({ title: 'Escopo do mês salvo' });
      await refresh();
    } catch (error) { toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }); }
    finally { saveLock.current = false; setSaving(false); }
  };

  return <section id="client-monthly-scope" ref={sectionRef} className="rounded-xl border bg-card p-4 space-y-4 scroll-mt-6" aria-label="Contrato e escopo mensal">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <h2 className="font-semibold">Contrato e escopo mensal</h2>
        <Popover><PopoverTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Ajuda do contrato e escopo mensal"><HelpCircle className="h-4 w-4" /></Button></PopoverTrigger>
          <PopoverContent className="w-80 text-sm">O cadastro guarda o contrato atual. Aqui você registra o combinado para cada mês, com histórico. Projetos consulta essas quantidades para planejar e Cobertura acompanha as entregas. Nenhuma etapa ou automação de Tarefas é alterada.</PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9" disabled={saving} onClick={() => moveMonth(-1)} aria-label="Escopo do mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <Select value={month.slice(5, 7)} onValueChange={(value) => selectMonth(`${year}-${value}-01`)} disabled={saving}><SelectTrigger className="w-36 capitalize" aria-label="Mês do escopo"><SelectValue /></SelectTrigger><SelectContent>{MONTHS.map((label, index) => <SelectItem key={label} value={String(index + 1).padStart(2, '0')} className="capitalize">{label}</SelectItem>)}</SelectContent></Select>
        <Select value={String(year)} onValueChange={(value) => selectMonth(`${value}-${month.slice(5, 7)}-01`)} disabled={saving}><SelectTrigger className="w-24" aria-label="Ano do escopo"><SelectValue /></SelectTrigger><SelectContent>{years.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="icon" className="h-9 w-9" disabled={saving} onClick={() => moveMonth(1)} aria-label="Escopo do próximo mês"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
    {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando escopo" /> : error ? <div className="flex gap-2 items-center text-sm text-destructive">Não foi possível carregar o escopo.<Button variant="outline" size="sm" onClick={refresh}>Tentar novamente</Button></div> : <>
      {!scope && <p className="text-sm text-amber-700 dark:text-amber-300">Escopo deste mês ainda não registrado. Abaixo, a referência atual do cadastro.</p>}
      <MonthlyScopeSummary scope={scope || clientScopeReference(client)} canViewField={canViewField} />
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="outline" size="sm" asChild><Link to={`/projects?client_id=${client.id}&year=${year}&month=${Number(month.slice(5, 7)) - 1}`}>Planejar este mês</Link></Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild><Link to={`/clients/${client.id}/edit`} state={{ backOnClose: true }}>Contrato atual do cadastro</Link></Button>
        {canManage && <Button variant="ghost" size="sm" onClick={() => historyOpen ? setHistoryOpen(false) : void loadHistory()} disabled={historyLoading}><History className="mr-1.5 h-4 w-4" />Histórico</Button>}
        {canManage && <Button size="sm" onClick={openEditor} disabled={loading || Boolean(error) || preparing}>{preparing ? 'Abrindo…' : scope ? 'Editar escopo do mês' : 'Definir escopo do mês'}</Button>}
      </div>
    </div>
    {historyOpen && <div className="border-t pt-3 space-y-3">
      <h3 className="text-sm font-medium">Histórico · {formatScopeMonth(month)}</h3>
      {history.map((entry) => <details key={entry.id} className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer"><span className="font-medium">{new Date(entry.changed_at).toLocaleString('pt-BR')}</span> · {historyUsers[entry.changed_by] || 'Usuário não disponível'}<span className="ml-2 text-muted-foreground">{entry.action === 'created' ? 'Registro criado' : entry.action === 'deleted' ? 'Removido' : 'Atualização'}</span></summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">{historyChanges(entry, canViewField).map((change) => <li key={change}>{change}</li>)}</ul>
        <div className="mt-3"><MonthlyScopeSummary scope={entry.after_data || entry.before_data} canViewField={canViewField} /></div>
      </details>)}
      {historyLoading && <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando histórico" />}
      {historyError && <div className="text-sm text-destructive">Não foi possível carregar o histórico.<Button variant="ghost" size="sm" onClick={() => void loadHistory()}>Tentar novamente</Button></div>}
      {!historyLoading && !historyError && !history.length && <p className="text-sm text-muted-foreground">Nenhum registro para este mês.</p>}
      {historyMore && !historyLoading && <Button variant="outline" size="sm" onClick={() => void loadHistory(true)}>Carregar anteriores</Button>}
    </div>}
    <MonthlyScopeDialog open={Boolean(editing)} scope={editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }} clientName={client.empresa} monthLabel={formatScopeMonth(month)} saving={saving} onSave={save} canViewField={canViewField} referenceLabel={draftSource} onUseCurrentContract={!scope ? () => { setEditing(newClientMonthlyScope(client, month)); setDraftSource('Referência: contrato atual do cadastro'); } : undefined} />
  </section>;
}
