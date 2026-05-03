import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Plus, Trash2, Sun, Bell, Users, ListFilter, SlidersHorizontal } from 'lucide-react';

const DESTINATARIO_OPCOES = [
  { key: 'assignees', label: 'Responsáveis' },
  { key: 'owner', label: 'Owner (dono)' },
  { key: 'josias', label: 'Josias (superadmin)' },
  { key: 'gestor', label: 'Gestores (admin)' },
];

const BRIEFING_MODELO_OPCOES = [
  { value: 'claude-haiku-4-5', label: 'Haiku (econômico, mais rápido)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet (completo, recomendado)' },
];

function normalizeTimeHHmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return '08:00';
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseConfiguracaoJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

function briefingConfigFromRow(configuracao) {
  const base = parseConfiguracaoJson(configuracao);
  const horario = normalizeTimeHHmm(typeof base.horario === 'string' ? base.horario : '08:00');
  const numeros_briefing = Array.isArray(base.numeros_briefing)
    ? base.numeros_briefing.map((x) => String(x || '').replace(/\D/g, '')).filter(Boolean)
    : [];
  const { numeros_briefing: _nb, horario: _h, ...rest } = base;
  return { ...rest, horario, numeros_briefing };
}

/** Inclui o texto pendente do campo na lista (mesma regra do botão Adicionar), sem toast. */
function mergeNumeroPendenteNaLista(lista, pendenteRaw) {
  const d = String(pendenteRaw ?? '').replace(/\D/g, '');
  if (!d) return lista;
  if (lista.includes(d)) return lista;
  return [...lista, d];
}

export default function PlanejeAutomacoesPage() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);

  const [briefingAtivo, setBriefingAtivo] = useState(true);
  const [briefingHorario, setBriefingHorario] = useState('08:00');
  const [briefingNumeros, setBriefingNumeros] = useState([]);
  const [briefingModelo, setBriefingModelo] = useState('claude-sonnet-4-6');
  const [briefingExtraJson, setBriefingExtraJson] = useState({});
  const [briefingSaving, setBriefingSaving] = useState(false);

  const [notifAtivo, setNotifAtivo] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [savingMemberId, setSavingMemberId] = useState(null);

  const [novoNumero, setNovoNumero] = useState('');

  const [taskStatuses, setTaskStatuses] = useState([]);
  const [regras, setRegras] = useState([]);
  const [regrasLoading, setRegrasLoading] = useState(true);
  const [savingRegraId, setSavingRegraId] = useState(null);
  const [dialogNovaRegra, setDialogNovaRegra] = useState(false);
  const [novaRegraStatusValue, setNovaRegraStatusValue] = useState('');
  const [criandoRegra, setCriandoRegra] = useState(false);

  const [prefsSilenciarTudo, setPrefsSilenciarTudo] = useState(false);
  const [prefsSilenciarProprias, setPrefsSilenciarProprias] = useState(false);
  const [prefsStatusesSilenciados, setPrefsStatusesSilenciados] = useState([]);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const canEditRegras = profile?.role === 'superadmin' || profile?.role === 'admin';

  const loadAutomacoes = useCallback(async () => {
    const { data, error } = await supabase
      .from('automacoes_config')
      .select('id, nome, ativo, configuracao')
      .in('nome', ['briefing_diario', 'notificacao_tarefa']);

    if (error) throw error;

    const byNome = Object.fromEntries((data || []).map((r) => [r.nome, r]));
    const br = byNome.briefing_diario;
    if (br) {
      setBriefingAtivo(!!br.ativo);
      const parsed = briefingConfigFromRow(br.configuracao);
      const { horario, numeros_briefing, modelo: modeloRaw, ...rest } = parsed;
      setBriefingHorario(horario);
      setBriefingNumeros(numeros_briefing);
      const allowedModelos = BRIEFING_MODELO_OPCOES.map((o) => o.value);
      const m = typeof modeloRaw === 'string' ? modeloRaw : '';
      setBriefingModelo(allowedModelos.includes(m) ? m : 'claude-sonnet-4-6');
      setBriefingExtraJson(rest);
    } else {
      setBriefingAtivo(true);
      setBriefingHorario('08:00');
      setBriefingNumeros([]);
      setBriefingModelo('claude-sonnet-4-6');
      setBriefingExtraJson({});
    }

    const nt = byNome.notificacao_tarefa;
    if (nt) {
      setNotifAtivo(!!nt.ativo);
    } else {
      setNotifAtivo(true);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, whatsapp, role')
      .in('role', ['superadmin', 'admin', 'colaborador'])
      .order('full_name', { ascending: true });

    if (error) throw error;
    setTeam(
      (data || []).map((p) => ({
        ...p,
        whatsapp_local: p.whatsapp ?? '',
      }))
    );
  }, []);

  const loadTaskStatuses = useCallback(async () => {
    const { data, error } = await supabase.from('task_statuses').select('id, value, label').order('sort_order');
    if (error) throw error;
    setTaskStatuses(data || []);
  }, []);

  const loadRegras = useCallback(async () => {
    const { data, error } = await supabase.from('notificacao_regras_status').select('*').order('status_value');
    if (error) throw error;
    setRegras(
      (data || []).map((r) => ({
        ...r,
        destinatarios: Array.isArray(r.destinatarios) ? r.destinatarios.map((x) => String(x).toLowerCase()) : [],
      }))
    );
  }, []);

  const loadPrefs = useCallback(async (userId) => {
    if (!userId) {
      setPrefsSilenciarTudo(false);
      setPrefsSilenciarProprias(false);
      setPrefsStatusesSilenciados([]);
      return;
    }
    const { data, error } = await supabase
      .from('notificacao_preferencias_usuario')
      .select('silenciar_tudo, silenciar_proprias_acoes, statuses_silenciados')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      setPrefsSilenciarTudo(!!data.silenciar_tudo);
      setPrefsSilenciarProprias(!!data.silenciar_proprias_acoes);
      setPrefsStatusesSilenciados(
        Array.isArray(data.statuses_silenciados) ? data.statuses_silenciados.map((x) => String(x)) : []
      );
    } else {
      setPrefsSilenciarTudo(false);
      setPrefsSilenciarProprias(false);
      setPrefsStatusesSilenciados([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setTeamLoading(true);
      try {
        await loadAutomacoes();
        if (!cancelled) await loadTeam();
      } catch (e) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar',
            description: e.message || String(e),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTeamLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAutomacoes, loadTeam, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRegrasLoading(true);
      setPrefsLoading(true);
      try {
        await loadTaskStatuses();
        if (!cancelled) await loadRegras();
        if (!cancelled && user?.id) await loadPrefs(user.id);
      } catch (e) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar notificações',
            description: e.message || String(e),
          });
        }
      } finally {
        if (!cancelled) {
          setRegrasLoading(false);
          setPrefsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTaskStatuses, loadRegras, loadPrefs, user?.id, toast]);

  const handleSaveBriefing = async () => {
    setBriefingSaving(true);
    try {
      const numerosComPendente = mergeNumeroPendenteNaLista(briefingNumeros, novoNumero);
      if (numerosComPendente !== briefingNumeros) {
        setBriefingNumeros(numerosComPendente);
        setNovoNumero('');
      }
      const configuracao = {
        ...briefingExtraJson,
        horario: briefingHorario,
        numeros_briefing: numerosComPendente,
        modelo: briefingModelo,
      };
      const row = {
        nome: 'briefing_diario',
        ativo: briefingAtivo,
        configuracao,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('automacoes_config').upsert(row, { onConflict: 'nome' });
      if (error) throw error;
      await loadAutomacoes();
      toast({ title: 'Briefing salvo', description: 'Configurações atualizadas.' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar briefing',
        description: e.message || String(e),
      });
    } finally {
      setBriefingSaving(false);
    }
  };

  const handleSaveNotificacao = async () => {
    setNotifSaving(true);
    try {
      const { data: existing } = await supabase
        .from('automacoes_config')
        .select('configuracao')
        .eq('nome', 'notificacao_tarefa')
        .maybeSingle();

      const configuracao =
        existing?.configuracao && typeof existing.configuracao === 'object' ? existing.configuracao : {};

      const row = {
        nome: 'notificacao_tarefa',
        ativo: notifAtivo,
        configuracao,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('automacoes_config').upsert(row, { onConflict: 'nome' });
      if (error) throw error;
      await loadAutomacoes();
      toast({ title: 'Notificações salvas', description: 'Preferência atualizada.' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: e.message || String(e),
      });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleSaveMember = async (row) => {
    setSavingMemberId(row.id);
    try {
      const raw = (row.whatsapp_local ?? '').trim();
      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp: raw || null,
        })
        .eq('id', row.id);
      if (error) throw error;
      await loadTeam();
      toast({ title: 'WhatsApp salvo', description: row.full_name || row.id });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: e.message || String(e),
      });
    } finally {
      setSavingMemberId(null);
    }
  };

  const adicionarNumeroBriefing = () => {
    const d = novoNumero.replace(/\D/g, '');
    if (!d) {
      toast({ variant: 'destructive', title: 'Informe um número válido' });
      return;
    }
    if (briefingNumeros.includes(d)) {
      toast({ title: 'Número já está na lista' });
      return;
    }
    setBriefingNumeros((prev) => [...prev, d]);
    setNovoNumero('');
  };

  const statusLabel = (value) => taskStatuses.find((s) => s.value === value)?.label || value;

  const statusDisponiveisParaNovaRegra = taskStatuses.filter((s) => !regras.some((r) => r.status_value === s.value));

  const setDestRegraChecked = (regraId, key, on) => {
    setRegras((prev) =>
      prev.map((r) => {
        if (r.id !== regraId) return r;
        const set = new Set(Array.isArray(r.destinatarios) ? r.destinatarios : []);
        if (on) set.add(key);
        else set.delete(key);
        return { ...r, destinatarios: [...set] };
      })
    );
  };

  const handleSaveRegra = async (r) => {
    if (!canEditRegras) return;
    setSavingRegraId(r.id);
    try {
      const { error } = await supabase
        .from('notificacao_regras_status')
        .update({
          ativo: !!r.ativo,
          destinatarios: r.destinatarios,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id);
      if (error) throw error;
      await loadRegras();
      toast({ title: 'Regra salva', description: statusLabel(r.status_value) });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar regra',
        description: e.message || String(e),
      });
    } finally {
      setSavingRegraId(null);
    }
  };

  const handleCriarRegra = async () => {
    if (!canEditRegras || !novaRegraStatusValue) {
      toast({ variant: 'destructive', title: 'Selecione um status' });
      return;
    }
    setCriandoRegra(true);
    try {
      const { error } = await supabase.from('notificacao_regras_status').insert({
        status_value: novaRegraStatusValue,
        ativo: true,
        destinatarios: ['assignees'],
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setDialogNovaRegra(false);
      setNovaRegraStatusValue('');
      await loadRegras();
      toast({ title: 'Regra criada' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar regra',
        description: e.message || String(e),
      });
    } finally {
      setCriandoRegra(false);
    }
  };

  const setPrefsStatusSilenciado = (value, on) => {
    setPrefsStatusesSilenciados((prev) => {
      if (on) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((v) => v !== value);
    });
  };

  const handleSavePrefs = async () => {
    if (!user?.id) {
      toast({ variant: 'destructive', title: 'Faça login para salvar preferências' });
      return;
    }
    setPrefsSaving(true);
    try {
      const { error } = await supabase.from('notificacao_preferencias_usuario').upsert(
        {
          user_id: user.id,
          silenciar_tudo: prefsSilenciarTudo,
          silenciar_proprias_acoes: prefsSilenciarProprias,
          statuses_silenciados: prefsStatusesSilenciados,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      await loadPrefs(user.id);
      toast({ title: 'Preferências salvas' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar preferências',
        description: e.message || String(e),
      });
    } finally {
      setPrefsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 px-2 sm:px-4 md:px-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Automações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Briefing diário, alertas de tarefa e números WhatsApp da equipe. As alterações entram após salvar cada bloco.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2">
              <Sun className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">Briefing diário</CardTitle>
              <CardDescription>
                Envio automático do resumo (via integração em servidor). Defina horário e quem recebe no WhatsApp.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
            <div>
              <Label htmlFor="briefing-ativo" className="text-base">
                Ativo
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Liga ou desliga o agendamento no worker.</p>
            </div>
            <Switch id="briefing-ativo" checked={briefingAtivo} onCheckedChange={setBriefingAtivo} />
          </div>

          <div className="space-y-2 max-w-xs">
            <Label htmlFor="briefing-horario">Horário</Label>
            <Input
              id="briefing-horario"
              type="time"
              value={briefingHorario}
              onChange={(e) => setBriefingHorario(e.target.value)}
            />
          </div>

          <div className="space-y-2 max-w-md">
            <Label htmlFor="briefing-modelo">Modelo Claude</Label>
            <Select value={briefingModelo} onValueChange={setBriefingModelo}>
              <SelectTrigger id="briefing-modelo">
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                {BRIEFING_MODELO_OPCOES.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Salvo em <code className="text-xs">configuracao.modelo</code> no Supabase; o worker usa ao gerar o briefing.
            </p>
          </div>

          <div className="space-y-3">
            <Label>Números que recebem o briefing</Label>
            <div className="flex flex-wrap gap-2">
              {briefingNumeros.map((n) => (
                <div
                  key={n}
                  className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm"
                >
                  <span>{n}</span>
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground"
                    onClick={() => setBriefingNumeros((prev) => prev.filter((x) => x !== n))}
                    aria-label={`Remover ${n}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {briefingNumeros.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum número. Adicione abaixo (apenas dígitos, com DDI).</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
              <Input
                placeholder="Ex.: 5541999999999"
                value={novoNumero}
                onChange={(e) => setNovoNumero(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarNumeroBriefing())}
              />
              <Button type="button" variant="secondary" className="gap-2 shrink-0" onClick={adicionarNumeroBriefing}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground max-w-lg">
              O número digitado entra na lista ao clicar em <strong>Adicionar</strong> ou ao clicar em{' '}
              <strong>Salvar</strong> do card (não precisa adicionar antes, se for o único número novo).
            </p>
          </div>

          <Button onClick={handleSaveBriefing} disabled={briefingSaving} className="gap-2">
            {briefingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-violet-100 dark:bg-violet-900/40 p-2">
              <Bell className="h-5 w-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">Notificações de tarefa</CardTitle>
              <CardDescription>
                Quando uma tarefa muda de status, o responsável recebe uma notificação no WhatsApp.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
            <div>
              <Label htmlFor="notif-ativo" className="text-base">
                Ativo
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Desative para pausar os envios do webhook.</p>
            </div>
            <Switch id="notif-ativo" checked={notifAtivo} onCheckedChange={setNotifAtivo} />
          </div>

          <Button onClick={handleSaveNotificacao} disabled={notifSaving} className="gap-2">
            {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-900/40 p-2">
                <ListFilter className="h-5 w-5 text-sky-700 dark:text-sky-300" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg">Regras por status</CardTitle>
                <CardDescription>
                  Para cada status de tarefa, defina quem recebe WhatsApp quando a tarefa entra nesse status (webhook).
                </CardDescription>
              </div>
            </div>
            {canEditRegras && statusDisponiveisParaNovaRegra.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setNovaRegraStatusValue(statusDisponiveisParaNovaRegra[0]?.value || '');
                  setDialogNovaRegra(true);
                }}
              >
                Nova regra
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {regrasLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : regras.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra cadastrada. Crie uma com &quot;Nova regra&quot; ou aplique a migração do Supabase.
            </p>
          ) : (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="min-w-[240px]">Destinatários</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regras.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{statusLabel(r.status_value)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={!!r.ativo}
                          disabled={!canEditRegras}
                          onCheckedChange={(v) =>
                            setRegras((prev) => prev.map((x) => (x.id === r.id ? { ...x, ativo: !!v } : x)))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {DESTINATARIO_OPCOES.map((op) => (
                            <label key={op.key} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={(r.destinatarios || []).includes(op.key)}
                                disabled={!canEditRegras}
                                onCheckedChange={(c) => setDestRegraChecked(r.id, op.key, c === true)}
                              />
                              <span>{op.label}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          disabled={!canEditRegras || savingRegraId === r.id}
                          onClick={() => handleSaveRegra(r)}
                        >
                          {savingRegraId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Salvar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!canEditRegras && (
            <p className="text-xs text-muted-foreground mt-3">Apenas superadmin e admin podem editar regras.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/40 p-2">
              <SlidersHorizontal className="h-5 w-5 text-indigo-700 dark:text-indigo-300" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">Minhas preferências</CardTitle>
              <CardDescription>
                Controle o que você recebe quando tarefas mudam de status (notificações por WhatsApp).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {prefsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
                <Label htmlFor="pref-silenciar-tudo" className="cursor-pointer">
                  Silenciar todas as notificações
                </Label>
                <Switch
                  id="pref-silenciar-tudo"
                  checked={prefsSilenciarTudo}
                  onCheckedChange={setPrefsSilenciarTudo}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
                <Label htmlFor="pref-silenciar-proprias" className="cursor-pointer">
                  Não me notificar pelas minhas próprias ações
                </Label>
                <Switch
                  id="pref-silenciar-proprias"
                  checked={prefsSilenciarProprias}
                  onCheckedChange={setPrefsSilenciarProprias}
                />
              </div>
              <div className="space-y-2">
                <Label>Silenciar estes status (opcional)</Label>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 p-3">
                  {taskStatuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum status cadastrado.</p>
                  ) : (
                    taskStatuses.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={prefsStatusesSilenciados.includes(s.value)}
                          onCheckedChange={(c) => setPrefsStatusSilenciado(s.value, c === true)}
                        />
                        <span>{s.label || s.value}</span>
                        <span className="text-xs text-muted-foreground">({s.value})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <Button onClick={handleSavePrefs} disabled={prefsSaving || !user?.id} className="gap-2">
                {prefsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2">
              <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">Equipe e WhatsApp</CardTitle>
              <CardDescription>Números usados em alertas e integrações (apenas dígitos ou E.164).</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : team.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum membro interno encontrado.</p>
          ) : (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="min-w-[200px]">WhatsApp</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.full_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{row.role || '—'}</TableCell>
                      <TableCell>
                        <Input
                          value={row.whatsapp_local}
                          onChange={(e) =>
                            setTeam((prev) =>
                              prev.map((t) => (t.id === row.id ? { ...t, whatsapp_local: e.target.value } : t))
                            )
                          }
                          placeholder="5541999999999"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          disabled={savingMemberId === row.id}
                          onClick={() => handleSaveMember(row)}
                        >
                          {savingMemberId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Salvar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogNovaRegra} onOpenChange={setDialogNovaRegra}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova regra por status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Status</Label>
            <Select value={novaRegraStatusValue} onValueChange={setNovaRegraStatusValue}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {statusDisponiveisParaNovaRegra.map((s) => (
                  <SelectItem key={s.id} value={s.value}>
                    {s.label || s.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogNovaRegra(false)} disabled={criandoRegra}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCriarRegra} disabled={criandoRegra || !novaRegraStatusValue}>
              {criandoRegra ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
