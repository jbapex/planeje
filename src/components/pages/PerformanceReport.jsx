import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart2, CheckCircle2, ChevronDown, CircleSlash, Settings2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TaskDelayReport from '@/components/reports/TaskDelayReport';
import CollaboratorIndicatorsSettings from '@/components/reports/CollaboratorIndicatorsSettings';
import {
  INDICATOR_PROFILES,
  LAYERS,
  computeCollaboratorIndicators,
  formatMonthLabel,
  monthStart,
  shiftMonth,
  spDay,
} from '@/lib/collaboratorIndicators';
import { loadCollaboratorIndicatorData } from '@/lib/collaboratorIndicatorsData';

const profileLabel = (value) => INDICATOR_PROFILES.find((item) => item.value === value)?.label || 'Sem perfil';

function IndicatorRow({ item }) {
  const [open, setOpen] = useState(false);
  const tone = !item.measured ? 'muted' : item.hit === true ? 'ok' : item.hit === false ? 'bad' : 'neutral';
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? XCircle : tone === 'muted' ? CircleSlash : null;
  const color = { ok: 'text-emerald-600', bad: 'text-red-600', muted: 'text-muted-foreground', neutral: 'text-foreground' }[tone];
  return (
    <div className="rounded-lg border bg-background/60">
      <button type="button" className="flex w-full items-start gap-2 p-3 text-left" onClick={() => setOpen((value) => !value)}>
        {Icon ? <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} /> : <span className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.label}</span>
          <span className={`block text-base font-semibold ${color}`}>{item.display}</span>
          {item.target && <span className="text-xs text-muted-foreground">Meta {item.target}</span>}
          {!item.measured && item.reason && <span className="block text-xs text-muted-foreground">{item.reason}</span>}
          {item.note && <span className="block text-xs text-amber-700">{item.note}</span>}
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 pb-3 pt-2 text-xs">
          <p className="text-muted-foreground">{item.how}</p>
          {item.items.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {item.items.map((row, index) => (
                <li key={`${row.taskId || row.label}-${index}`} className="flex items-start gap-2 rounded bg-muted/40 px-2 py-1.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${row.ok === true ? 'bg-emerald-500' : row.ok === false ? 'bg-red-500' : 'bg-slate-300'}`} />
                  <span className="min-w-0">
                    <span className="block font-medium">{row.taskId ? <a className="hover:underline" href={`#/tasks/list/${row.taskId}`}>{row.label}</a> : row.label}</span>
                    <span className="text-muted-foreground">{row.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PersonCard({ card }) {
  const { person, layers, oldFlowDeliveries } = card;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b bg-muted/20 py-4">
        <Avatar className="h-11 w-11">
          <AvatarImage src={person.avatar_url} alt={person.full_name} />
          <AvatarFallback>{(person.full_name || '?').charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg">{person.full_name}</CardTitle>
          <p className="text-sm text-muted-foreground">{profileLabel(person.indicator_profile)}</p>
        </div>
        {oldFlowDeliveries > 0 && (
          <Badge variant="outline" className="max-w-[16rem] whitespace-normal text-right font-normal">
            {oldFlowDeliveries} entrega(s) do fluxo antigo não entram no prazo
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-3">
        {LAYERS.map((layer) => (
          <section key={layer.key} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide">{layer.label}</h3>
              <p className="text-xs text-muted-foreground">{layer.hint}</p>
            </div>
            {layers[layer.key].length
              ? layers[layer.key].map((item) => <IndicatorRow key={item.key} item={item} />)
              : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum indicador nesta camada.</p>}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

const PerformanceReport = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { moduleAccess, loading: moduleLoading } = useModuleSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const today = spDay(new Date());
  const [month, setMonth] = useState(monthStart(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reportAccess = useMemo(() => {
    if (profile?.role === 'superadmin') return 'all';
    return moduleAccess.reports || 'self';
  }, [profile, moduleAccess]);
  const isAdmin = ['superadmin', 'admin'].includes(profile?.role);
  const focusClientId = isAdmin ? searchParams.get('metas')?.trim() : '';

  const changeSettingsOpen = (open) => {
    setSettingsOpen(open);
    if (open || !focusClientId) return;
    if (state?.backOnClose) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('metas');
    setSearchParams(next, { replace: true });
  };

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => shiftMonth(monthStart(today), -index)), [today]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      setData(await loadCollaboratorIndicatorData(supabase, { month, selfId: reportAccess === 'self' ? profile.id : null }));
    } catch (error) {
      toast({ title: 'Não foi possível montar os indicadores', description: error.message, variant: 'destructive' });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, profile?.id, reportAccess, toast]);

  useEffect(() => {
    if (!moduleLoading) void load();
  }, [load, moduleLoading]);

  const cards = useMemo(() => (data ? computeCollaboratorIndicators({ ...data, today }) : []), [data, today]);
  const withoutProfile = (data?.people || []).filter((person) => !person.indicator_profile);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center text-3xl font-bold text-gray-800 dark:text-white">
            <BarChart2 className="mr-3 h-8 w-8" />
            Indicadores do mês
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Disciplina, entrega e resultado de cada pessoa, pelo histórico automático das tarefas. O prazo conta a primeira entrega do material no fluxo novo. O que não tem base aparece como não medido. Clique em um indicador para ver as tarefas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((value) => <SelectItem key={value} value={value} className="capitalize">{formatMonthLabel(value)}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" />Configurar
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Calculando indicadores…</p>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => <PersonCard key={card.person.id} card={card} />)}
          {!cards.length && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum colaborador com perfil de indicador. {isAdmin ? 'Use Configurar para escolher o perfil de cada pessoa.' : ''}
            </p>
          )}
          {isAdmin && withoutProfile.length > 0 && (
            <p className="text-xs text-muted-foreground">Sem perfil de indicador: {withoutProfile.map((person) => person.full_name).join(', ')}.</p>
          )}
        </div>
      )}

      <TaskDelayReport reportAccess={reportAccess} profileId={profile?.id} />

      {isAdmin && (
        <CollaboratorIndicatorsSettings
          open={settingsOpen || Boolean(focusClientId)}
          onOpenChange={changeSettingsOpen}
          month={month}
          data={focusClientId && data?.month !== month ? null : data}
          focusClientId={focusClientId}
          onSaved={load}
        />
      )}
    </div>
  );
};

export default PerformanceReport;
