import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import {
  CONVERSAS_CANAIS_PATH,
  CONVERSAS_DEFAULT_PATH,
  canManageConversasConfig,
} from '@/lib/conversasRoutes';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Headphones,
  ArrowLeft,
  Smartphone,
  Users,
  Layers,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import AtendimentoConversasLimpezaCard from '@/components/atendimento/AtendimentoConversasLimpezaCard';
import AtendimentoGrupoIaRemetentesCard from '@/components/atendimento/AtendimentoGrupoIaRemetentesCard';
import AtendimentoEquipeNumerosCard from '@/components/atendimento/AtendimentoEquipeNumerosCard';
import AtendimentoAvisoEsperaCard from '@/components/atendimento/AtendimentoAvisoEsperaCard';
import { cn } from '@/lib/utils';

function channelLabel(config) {
  if (!config) return '—';
  return config.name || config.subdomain || config.id?.slice(0, 8) || '—';
}

function toggleSelection(id, selectedIds) {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

function accessSelectionFromRows(rows = []) {
  const filaIds = new Set();
  const canalIds = new Set();
  rows.forEach((row) => {
    if (row.fila_id) filaIds.add(row.fila_id);
    if (row.whatsapp_config_id) canalIds.add(row.whatsapp_config_id);
  });
  return { filaIds: [...filaIds], canalIds: [...canalIds] };
}

function AccessMultiPicker({ label, hint, options, selectedIds, onToggle, emptyText }) {
  if (!options.length) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selectedIds.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'jb-gradient-bg border-transparent text-white shadow-sm'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {active && <Check className="h-3 w-3 shrink-0" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfigStepGuide() {
  const steps = [
    { n: 1, title: 'Crie filas', desc: 'Com nome e tempo de SLA para a 1ª resposta.' },
    { n: 2, title: 'Atribua números', desc: 'Cada WhatsApp entra em uma fila.' },
    { n: 3, title: 'Libere a equipe', desc: 'Fila = ver conversas; número = enviar mensagens.' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 mb-6">
      {steps.map((step, i) => (
        <div
          key={step.n}
          className="relative flex gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full jb-gradient-bg text-sm font-bold text-white">
            {step.n}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{step.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{step.desc}</p>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function AtendimentoConfigPage({ embeddedInCrm }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canManage = canManageConversasConfig(profile?.role);
  const isSuperAdmin = profile?.role === 'superadmin';

  const {
    effectiveClienteId,
    configs,
    isAdminWithoutCliente,
    conversasAccessMissing,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ forConversas: true });

  const [filas, setFilas] = useState([]);
  const [filaCanais, setFilaCanais] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newFilaName, setNewFilaName] = useState('');
  const [newFilaSla, setNewFilaSla] = useState('5');
  const [accessUserId, setAccessUserId] = useState('');
  const [accessFilaIds, setAccessFilaIds] = useState([]);
  const [accessCanalIds, setAccessCanalIds] = useState([]);
  const [assigningChannelId, setAssigningChannelId] = useState(null);
  const [editingFilaId, setEditingFilaId] = useState(null);
  const [editFilaName, setEditFilaName] = useState('');
  const [editFilaSla, setEditFilaSla] = useState('5');
  const [savingFilaId, setSavingFilaId] = useState(null);
  const [editingAccessUserId, setEditingAccessUserId] = useState(null);
  const [editAccessFilaIds, setEditAccessFilaIds] = useState([]);
  const [editAccessCanalIds, setEditAccessCanalIds] = useState([]);
  const [savingAccessUserId, setSavingAccessUserId] = useState(null);
  const [addingAccess, setAddingAccess] = useState(false);

  const channels = configs || [];

  const channelIds = useMemo(() => new Set(channels.map((c) => c.id)), [channels]);

  const clienteFilaCanais = useMemo(
    () => filaCanais.filter((row) => channelIds.has(row.whatsapp_config_id)),
    [filaCanais, channelIds],
  );

  const filaIdByChannelId = useMemo(() => {
    const map = new Map();
    clienteFilaCanais.forEach((row) => map.set(row.whatsapp_config_id, row.fila_id));
    return map;
  }, [clienteFilaCanais]);

  const channelsWithoutFila = useMemo(
    () => channels.filter((c) => !filaIdByChannelId.has(c.id)),
    [channels, filaIdByChannelId],
  );

  const filaOptions = useMemo(
    () => filas.map((f) => ({ id: f.id, label: f.name })),
    [filas],
  );

  const canalOptions = useMemo(
    () => channels.map((c) => ({ id: c.id, label: channelLabel(c) })),
    [channels],
  );

  const acessosByUser = useMemo(() => {
    const map = new Map();
    acessos.forEach((row) => {
      if (!map.has(row.user_id)) map.set(row.user_id, []);
      map.get(row.user_id).push(row);
    });
    return [...map.entries()]
      .map(([userId, rows]) => ({
        userId,
        rows,
        ...accessSelectionFromRows(rows),
      }))
      .sort((a, b) => {
        const nameA = agents.find((ag) => ag.id === a.userId)?.full_name || a.userId;
        const nameB = agents.find((ag) => ag.id === b.userId)?.full_name || b.userId;
        return nameA.localeCompare(nameB, 'pt-BR');
      });
  }, [acessos, agents]);

  const loadAll = useCallback(async () => {
    if (!effectiveClienteId) {
      setFilas([]);
      setFilaCanais([]);
      setAcessos([]);
      return;
    }
    setLoading(true);
    const [filasRes, canaisRes, acessosRes, agentsRes] = await Promise.all([
      supabase.from('atendimento_filas').select('*').eq('cliente_id', effectiveClienteId).order('sort_order'),
      supabase.from('atendimento_fila_canais').select('*'),
      supabase.from('atendimento_usuario_acesso').select('*').eq('cliente_id', effectiveClienteId),
      supabase.from('profiles').select('id, full_name, role').in('role', ['superadmin', 'admin', 'colaborador']).order('full_name'),
    ]);
    setLoading(false);
    setFilas(filasRes.data || []);
    setFilaCanais(canaisRes.data || []);
    setAcessos(acessosRes.data || []);
    setAgents(agentsRes.data || []);
  }, [effectiveClienteId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateFila = async () => {
    if (!effectiveClienteId || !newFilaName.trim()) return;
    const { error } = await supabase.from('atendimento_filas').insert({
      cliente_id: effectiveClienteId,
      name: newFilaName.trim(),
      sla_primeira_resposta_minutos: parseInt(newFilaSla, 10) || 5,
    });
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }
    setNewFilaName('');
    toast({ title: 'Fila criada' });
    loadAll();
  };

  const handleDeleteFila = async (id) => {
    const linked = clienteFilaCanais.filter((r) => r.fila_id === id);
    if (linked.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Fila em uso',
        description: 'Reatribua os números WhatsApp antes de excluir esta fila.',
      });
      return;
    }
    const { error } = await supabase.from('atendimento_filas').delete().eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
    else {
      toast({ title: 'Fila removida' });
      if (editingFilaId === id) setEditingFilaId(null);
      loadAll();
    }
  };

  const handleStartEditFila = (fila) => {
    setEditingFilaId(fila.id);
    setEditFilaName(fila.name || '');
    setEditFilaSla(String(fila.sla_primeira_resposta_minutos ?? 5));
  };

  const handleCancelEditFila = () => {
    setEditingFilaId(null);
    setEditFilaName('');
    setEditFilaSla('5');
  };

  const handleSaveEditFila = async (id) => {
    const name = editFilaName.trim();
    const sla = parseInt(editFilaSla, 10);
    if (!name) {
      toast({ variant: 'destructive', title: 'Informe o nome da fila' });
      return;
    }
    if (!sla || sla < 1) {
      toast({ variant: 'destructive', title: 'SLA inválido', description: 'Use pelo menos 1 minuto.' });
      return;
    }
    setSavingFilaId(id);
    const { error } = await supabase
      .from('atendimento_filas')
      .update({
        name,
        sla_primeira_resposta_minutos: sla,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setSavingFilaId(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
      return;
    }
    toast({ title: 'Fila atualizada' });
    handleCancelEditFila();
    loadAll();
  };

  const handleAssignChannelFila = async (whatsappConfigId, filaId) => {
    setAssigningChannelId(whatsappConfigId);
    const existing = clienteFilaCanais.find((r) => r.whatsapp_config_id === whatsappConfigId);

    if (!filaId || filaId === '__none__') {
      if (existing) {
        const { error } = await supabase.from('atendimento_fila_canais').delete().eq('id', existing.id);
        if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
        else toast({ title: 'Número desvinculado da fila' });
      }
    } else {
      const { error } = await supabase.from('atendimento_fila_canais').upsert(
        { fila_id: filaId, whatsapp_config_id: whatsappConfigId },
        { onConflict: 'whatsapp_config_id' },
      );
      if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message });
      else toast({ title: 'Fila atualizada' });
    }

    setAssigningChannelId(null);
    loadAll();
  };

  const persistUserAccess = async (userId, filaIds, canalIds, { replaceExisting = false } = {}) => {
    if (!effectiveClienteId || !userId) return false;
    if (!filaIds.length && !canalIds.length) {
      toast({
        variant: 'destructive',
        title: 'Selecione ao menos uma fila ou número',
      });
      return false;
    }

    let nextFilaIds = [...filaIds];
    let nextCanalIds = [...canalIds];

    if (!replaceExisting) {
      const current = accessSelectionFromRows(acessos.filter((a) => a.user_id === userId));
      nextFilaIds = [...new Set([...current.filaIds, ...filaIds])];
      nextCanalIds = [...new Set([...current.canalIds, ...canalIds])];
    }

    const { error: deleteError } = await supabase
      .from('atendimento_usuario_acesso')
      .delete()
      .eq('cliente_id', effectiveClienteId)
      .eq('user_id', userId);

    if (deleteError) {
      toast({ variant: 'destructive', title: 'Erro', description: deleteError.message });
      return false;
    }

    const rows = [
      ...nextFilaIds.map((fila_id) => ({
        cliente_id: effectiveClienteId,
        user_id: userId,
        fila_id,
        whatsapp_config_id: null,
      })),
      ...nextCanalIds.map((whatsapp_config_id) => ({
        cliente_id: effectiveClienteId,
        user_id: userId,
        fila_id: null,
        whatsapp_config_id,
      })),
    ];

    const { error: insertError } = await supabase.from('atendimento_usuario_acesso').insert(rows);
    if (insertError) {
      toast({ variant: 'destructive', title: 'Erro', description: insertError.message });
      return false;
    }

    return true;
  };

  const handleAddAccess = async () => {
    if (!accessUserId) return;
    setAddingAccess(true);
    const ok = await persistUserAccess(accessUserId, accessFilaIds, accessCanalIds);
    setAddingAccess(false);
    if (!ok) return;
    toast({ title: 'Acesso adicionado' });
    setAccessUserId('');
    setAccessFilaIds([]);
    setAccessCanalIds([]);
    loadAll();
  };

  const handleStartEditAccess = (entry) => {
    setEditingAccessUserId(entry.userId);
    setEditAccessFilaIds(entry.filaIds);
    setEditAccessCanalIds(entry.canalIds);
  };

  const handleCancelEditAccess = () => {
    setEditingAccessUserId(null);
    setEditAccessFilaIds([]);
    setEditAccessCanalIds([]);
  };

  const handleSaveEditAccess = async (userId) => {
    setSavingAccessUserId(userId);
    const ok = await persistUserAccess(userId, editAccessFilaIds, editAccessCanalIds, {
      replaceExisting: true,
    });
    setSavingAccessUserId(null);
    if (!ok) return;
    toast({ title: 'Permissões atualizadas' });
    handleCancelEditAccess();
    loadAll();
  };

  const handleRemoveUserAccess = async (userId) => {
    const { error } = await supabase
      .from('atendimento_usuario_acesso')
      .delete()
      .eq('cliente_id', effectiveClienteId)
      .eq('user_id', userId);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }
    if (editingAccessUserId === userId) handleCancelEditAccess();
    toast({ title: 'Acessos removidos' });
    loadAll();
  };

  const agentName = (id) => agents.find((a) => a.id === id)?.full_name || id?.slice(0, 8);
  const agentRole = (id) => agents.find((a) => a.id === id)?.role;

  const renderAccessBadges = (filaIds, canalIds) => (
    <div className="flex flex-wrap gap-1.5">
      {filaIds.map((filaId) => (
        <Badge key={`fila-${filaId}`} variant="secondary" className="font-normal">
          <Layers className="h-3 w-3 mr-1" />
          {filas.find((f) => f.id === filaId)?.name || 'Fila'}
        </Badge>
      ))}
      {canalIds.map((canalId) => (
        <Badge key={`canal-${canalId}`} variant="outline" className="font-normal">
          <Smartphone className="h-3 w-3 mr-1" />
          {channelLabel(channels.find((c) => c.id === canalId))}
        </Badge>
      ))}
    </div>
  );

  if (!canManage) {
    return <Navigate to={CONVERSAS_DEFAULT_PATH} replace />;
  }

  if (conversasAccessMissing) {
    return (
      <div className={embeddedInCrm ? '' : 'p-4 md:p-6 w-full'}>
        <p className="text-sm text-muted-foreground">
          Seu usuário ainda não tem acesso ao atendimento. Peça ao superadmin para vincular você nas filas e canais da operação.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('wa-config-page w-full', embeddedInCrm ? '' : 'p-4 md:p-6')}>
      <div className="mb-6">
        {!embeddedInCrm && (
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 h-8" asChild>
            <Link to={CONVERSAS_DEFAULT_PATH}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar para Conversas
            </Link>
          </Button>
        )}
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          Configuração de atendimento
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize filas, números WhatsApp e quem da equipe pode atender cada conversa.
        </p>
      </div>

      <ConfigStepGuide />

      {isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Operação</CardTitle>
            <CardDescription>Selecione o cliente para configurar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientesForAdmin.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.empresa || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      )}

      <Tabs defaultValue="estrutura" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 h-auto p-1">
          <TabsTrigger value="estrutura" className="gap-1.5 py-2">
            <Layers className="h-4 w-4 shrink-0" />
            Filas e números
          </TabsTrigger>
          <TabsTrigger value="equipe" className="gap-1.5 py-2">
            <Users className="h-4 w-4 shrink-0" />
            Equipe
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="manutencao" className="gap-1.5 py-2 col-span-2 sm:col-span-1">
              Manutenção
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="estrutura" className="space-y-4 mt-0">
          <AtendimentoAvisoEsperaCard clienteId={effectiveClienteId} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filas de atendimento</CardTitle>
              <CardDescription>
                Agrupe conversas por área ou prioridade. O SLA define em quantos minutos a equipe deve dar a 1ª resposta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_100px_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="new-fila-name">Nome da fila</Label>
                  <Input
                    id="new-fila-name"
                    placeholder="Ex.: Comercial, Suporte…"
                    value={newFilaName}
                    onChange={(e) => setNewFilaName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFila()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-fila-sla">SLA (min)</Label>
                  <Input
                    id="new-fila-sla"
                    type="number"
                    min={1}
                    value={newFilaSla}
                    onChange={(e) => setNewFilaSla(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreateFila} disabled={!newFilaName.trim()} className="sm:mb-0">
                  <Plus className="h-4 w-4 mr-1" />
                  Criar fila
                </Button>
              </div>

              {filas.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
                  Nenhuma fila ainda. Crie a primeira acima — depois atribua os números WhatsApp.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filas.map((f) => {
                    const linked = clienteFilaCanais.filter((r) => r.fila_id === f.id);
                    const isEditing = editingFilaId === f.id;
                    const isSaving = savingFilaId === f.id;
                    return (
                      <div key={f.id} className="rounded-xl border bg-card p-4 shadow-sm">
                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-fila-name-${f.id}`}>Nome</Label>
                              <Input
                                id={`edit-fila-name-${f.id}`}
                                value={editFilaName}
                                onChange={(e) => setEditFilaName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditFila(f.id);
                                  if (e.key === 'Escape') handleCancelEditFila();
                                }}
                                autoFocus
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-fila-sla-${f.id}`}>SLA (min)</Label>
                              <Input
                                id={`edit-fila-sla-${f.id}`}
                                type="number"
                                min={1}
                                value={editFilaSla}
                                onChange={(e) => setEditFilaSla(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditFila(f.id);
                                  if (e.key === 'Escape') handleCancelEditFila();
                                }}
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => handleSaveEditFila(f.id)}
                                disabled={isSaving || !editFilaName.trim()}
                              >
                                {isSaving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    Salvar
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEditFila}
                                disabled={isSaving}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{f.name}</p>
                                <Badge variant="secondary" className="mt-1.5 font-normal">
                                  SLA {f.sla_primeira_resposta_minutos} min
                                </Badge>
                              </div>
                              <div className="flex shrink-0 gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleStartEditFila(f)}
                                  title="Editar fila"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleDeleteFila(f.id)}
                                  title="Excluir fila"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs text-muted-foreground mb-2">
                                {linked.length === 0
                                  ? 'Nenhum número nesta fila'
                                  : `${linked.length} número${linked.length !== 1 ? 's' : ''}`}
                              </p>
                              {linked.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {linked.map((row) => (
                                    <Badge key={row.id} variant="outline" className="font-normal">
                                      <Smartphone className="h-3 w-3 mr-1" />
                                      {channelLabel(channels.find((c) => c.id === row.whatsapp_config_id))}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Números WhatsApp
              </CardTitle>
              <CardDescription>
                Escolha em qual fila cada número entra. Mensagens novas vão direto para essa fila.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {channels.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span>Nenhum número conectado ainda.</span>
                    <Button variant="outline" size="sm" className="w-fit" asChild>
                      <Link to={CONVERSAS_CANAIS_PATH}>
                        <Smartphone className="h-4 w-4 mr-1.5" />
                        Conectar número
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {channelsWithoutFila.length > 0 && filas.length > 0 && (
                    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 [&>svg]:text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {channelsWithoutFila.length} número{channelsWithoutFila.length !== 1 ? 's' : ''} sem fila:{' '}
                        {channelsWithoutFila.map((c) => channelLabel(c)).join(', ')}. Atribua uma fila abaixo.
                      </AlertDescription>
                    </Alert>
                  )}

                  {filas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Crie pelo menos uma fila antes de atribuir os números.
                    </p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Número / canal</TableHead>
                            <TableHead className="w-[220px]">Fila de destino</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {channels.map((ch) => {
                            const currentFilaId = filaIdByChannelId.get(ch.id) || '__none__';
                            const isAssigning = assigningChannelId === ch.id;
                            return (
                              <TableRow key={ch.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {channelLabel(ch)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={currentFilaId}
                                    onValueChange={(v) => handleAssignChannelFila(ch.id, v)}
                                    disabled={isAssigning}
                                  >
                                    <SelectTrigger className="h-9">
                                      {isAssigning ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <SelectValue placeholder="Selecione a fila" />
                                      )}
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Sem fila</SelectItem>
                                      {filas.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>
                                          {f.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipe" className="space-y-4 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissões da equipe</CardTitle>
              <CardDescription>
                Cada colaborador pode ter acesso a várias filas e números. Admins e superadmins veem tudo automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-medium">Adicionar acesso</p>
                <div className="space-y-1.5">
                  <Label>Colaborador</Label>
                  <Select value={accessUserId} onValueChange={setAccessUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione quem receberá o acesso" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name || a.id} ({a.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <AccessMultiPicker
                  label="Filas liberadas"
                  hint="Pode marcar mais de uma."
                  options={filaOptions}
                  selectedIds={accessFilaIds}
                  onToggle={(id) => setAccessFilaIds((prev) => toggleSelection(id, prev))}
                  emptyText="Crie filas na aba anterior."
                />

                <AccessMultiPicker
                  label="Números liberados"
                  hint="Pode marcar mais de um."
                  options={canalOptions}
                  selectedIds={accessCanalIds}
                  onToggle={(id) => setAccessCanalIds((prev) => toggleSelection(id, prev))}
                  emptyText="Conecte números WhatsApp primeiro."
                />

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    onClick={handleAddAccess}
                    disabled={!accessUserId || addingAccess || (!accessFilaIds.length && !accessCanalIds.length)}
                  >
                    {addingAccess ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar acesso
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Se o colaborador já tiver acessos, os novos serão somados aos existentes.
                  </p>
                </div>
              </div>

              {acessosByUser.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
                  Sem restrições — todos os colaboradores veem todas as conversas da operação.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {acessosByUser.map((entry) => {
                    const isEditing = editingAccessUserId === entry.userId;
                    const isSaving = savingAccessUserId === entry.userId;
                    return (
                      <div key={entry.userId} className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{agentName(entry.userId)}</p>
                            {agentRole(entry.userId) && (
                              <p className="text-xs text-muted-foreground capitalize">{agentRole(entry.userId)}</p>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex shrink-0 gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleStartEditAccess(entry)}
                                title="Editar permissões"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemoveUserAccess(entry.userId)}
                                title="Remover todos os acessos"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-4">
                            <AccessMultiPicker
                              label="Filas"
                              options={filaOptions}
                              selectedIds={editAccessFilaIds}
                              onToggle={(id) => setEditAccessFilaIds((prev) => toggleSelection(id, prev))}
                              emptyText="Nenhuma fila cadastrada."
                            />
                            <AccessMultiPicker
                              label="Números"
                              options={canalOptions}
                              selectedIds={editAccessCanalIds}
                              onToggle={(id) => setEditAccessCanalIds((prev) => toggleSelection(id, prev))}
                              emptyText="Nenhum número cadastrado."
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => handleSaveEditAccess(entry.userId)}
                                disabled={
                                  isSaving || (!editAccessFilaIds.length && !editAccessCanalIds.length)
                                }
                              >
                                {isSaving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    Salvar
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEditAccess}
                                disabled={isSaving}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {renderAccessBadges(entry.filaIds, entry.canalIds)}
                            <p className="text-xs text-muted-foreground">
                              {entry.filaIds.length + entry.canalIds.length} permissão
                              {entry.filaIds.length + entry.canalIds.length !== 1 ? 'ões' : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <AtendimentoEquipeNumerosCard />
          {effectiveClienteId && (
            <AtendimentoGrupoIaRemetentesCard clienteId={effectiveClienteId} />
          )}
        </TabsContent>

        {isSuperAdmin && effectiveClienteId && (
          <TabsContent value="manutencao" className="mt-0">
            <AtendimentoConversasLimpezaCard
              clienteId={effectiveClienteId}
              channels={channels}
              onPurged={() => toast({ title: 'Conversas excluídas', description: 'A lista foi limpa para o canal selecionado.' })}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
