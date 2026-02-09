import React, { useState, useEffect, useMemo } from 'react';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PipelineEditor from '@/components/crm/PipelineEditor';
import { Loader2, Plus, Trash2, Info, Pencil, Check, Search, RefreshCw, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'em-uso', label: 'Em uso' },
];

export default function CrmSettingsFunil() {
  const { profile } = useAuth();
  const { settings, loading, saving, updateSettings, fetchSettings } = useClienteCrmSettings();
  const { toast } = useToast();
  const [statuses, setStatuses] = useState([]);
  const [tags, setTags] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');

  const effectiveClienteId = profile?.cliente_id;
  const {
    pipelines,
    pipelineLoading,
    currentPipelineId,
    setCurrentPipelineId,
    refetch: refetchPipeline,
    createPipeline,
    updatePipeline,
    createStage,
    updateStage,
    reorderStages,
    deletePipeline,
    deleteStage,
  } = useCrmPipeline();
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [editorPipeline, setEditorPipeline] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (settings) {
      setStatuses(Array.isArray(settings.statuses) ? settings.statuses.map((s) => ({ ...s })) : []);
      setTags(Array.isArray(settings.tags) ? settings.tags.map((t) => ({ ...t })) : []);
      setOrigins(Array.isArray(settings.origins) ? [...settings.origins] : []);
    }
  }, [settings]);

  const filteredPipelines = useMemo(() => {
    let list = [...pipelines];
    const q = (search || '').trim().toLowerCase();
    if (q) {
      list = list.filter((p) => (p.nome || '').toLowerCase().replace(/_/g, ' ').includes(q));
    }
    if (filter === 'em-uso') {
      list = list.filter((p) => p.id === currentPipelineId);
    }
    return list;
  }, [pipelines, search, filter, currentPipelineId]);

  const handleAddStatus = () => setStatuses((p) => [...p, { name: '', color: '#6b7280' }]);
  const handleRemoveStatus = (i) => setStatuses((p) => p.filter((_, idx) => idx !== i));
  const handleStatusChange = (i, field, value) => {
    setStatuses((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };
  const handleAddTag = () => setTags((p) => [...p, { name: '', color: '#6b7280' }]);
  const handleRemoveTag = (i) => setTags((p) => p.filter((_, idx) => idx !== i));
  const handleTagChange = (i, field, value) => {
    setTags((p) => p.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };
  const handleAddOrigin = () => setOrigins((p) => [...p, '']);
  const handleRemoveOrigin = (i) => setOrigins((p) => p.filter((_, idx) => idx !== i));
  const handleOriginChange = (i, value) => setOrigins((p) => p.map((o, idx) => (idx === i ? value : o)));

  const handleSave = async () => {
    const validStatuses = statuses.filter((s) => s.name?.trim()).map((s) => ({ name: (s.name || '').trim().replace(/\s+/g, '_'), color: s.color || '#6b7280' }));
    const validTags = tags.filter((t) => t.name?.trim()).map((t) => ({ name: (t.name || '').trim().replace(/\s+/g, '_'), color: t.color || '#6b7280' }));
    const validOrigins = origins.map((o) => (o || '').trim()).filter(Boolean);
    if (validStatuses.length === 0) {
      toast({ variant: 'destructive', title: 'Status obrigatório', description: 'Adicione pelo menos um status no card Status padrão.' });
      return;
    }
    const ok = await updateSettings(
      { ...settings, statuses: validStatuses, tags: validTags, origins: validOrigins },
      true
    );
    if (ok) await fetchSettings();
  };

  const handleCreatePipelineFromStatuses = async () => {
    const validStatuses = statuses.filter((s) => s.name?.trim()).map((s) => ({
      name: (s.name || '').trim().replace(/\s+/g, '_'),
      color: s.color || '#6b7280',
    }));
    if (validStatuses.length === 0) {
      toast({ variant: 'destructive', title: 'Adicione pelo menos um status', description: 'Configure os status do funil abaixo e clique novamente em "Criar funil".' });
      return;
    }
    if (!effectiveClienteId) {
      toast({ variant: 'destructive', title: 'Cliente não identificado', description: 'Faça login como cliente.' });
      return;
    }
    setCreatingPipeline(true);
    try {
      const { data: newPipeline, error: errPipe } = await supabase
        .from('crm_pipelines')
        .insert({
          cliente_id: effectiveClienteId,
          nome: 'Pipeline principal',
          descricao: 'Funil criado a partir dos status configurados.',
        })
        .select('id')
        .single();
      if (errPipe) throw errPipe;
      const pipelineId = newPipeline.id;
      const stageIds = [];
      for (let i = 0; i < validStatuses.length; i++) {
        const s = validStatuses[i];
        const nome = s.name;
        const tipo =
          ['vendeu', 'ganho', 'fechado_ganho'].some((x) => nome.toLowerCase() === x)
            ? 'ganho'
            : ['nao_compareceu', 'perdido', 'fechado_perdido'].some((x) => nome.toLowerCase() === x)
              ? 'perdido'
              : 'intermediaria';
        const { data: newStage, error: errStage } = await supabase
          .from('crm_stages')
          .insert({
            pipeline_id: pipelineId,
            nome,
            ordem: i,
            tipo,
            color: s.color || '#6b7280',
          })
          .select('id')
          .single();
        if (errStage) throw errStage;
        stageIds.push({ id: newStage.id, nome, tipo });
      }
      const firstStageId = stageIds[0]?.id;
      const now = new Date().toISOString();
      const { data: leadsToUpdate } = await supabase.from('leads').select('id, status').eq('cliente_id', effectiveClienteId);
      if (leadsToUpdate?.length) {
        for (const lead of leadsToUpdate) {
          const stage = stageIds.find((st) => st.nome === lead.status) || stageIds[0];
          const statusVida = stage?.tipo === 'ganho' ? 'ganho' : stage?.tipo === 'perdido' ? 'perdido' : 'ativo';
          await supabase
            .from('leads')
            .update({
              pipeline_id: pipelineId,
              stage_id: stage?.id ?? firstStageId,
              status: stage?.nome ?? lead.status,
              status_vida: statusVida,
              stage_entered_at: now,
              updated_at: now,
            })
            .eq('id', lead.id);
        }
      }
      await refetchPipeline();
      toast({ title: 'Funil criado', description: 'O pipeline e as etapas foram criados. O Kanban passará a usá-los.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao criar funil', description: e?.message || String(e) });
    } finally {
      setCreatingPipeline(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cardClass = 'dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl';
  const headerClass = 'p-3 sm:p-4';
  const titleClass = 'text-sm font-semibold dark:text-white';
  const descClass = 'text-xs text-muted-foreground dark:text-gray-400 mt-0.5';

  return (
    <div className="flex flex-col gap-6 w-full min-w-0 pb-10">
      {/* Seção Funis – mesmo padrão da página Usuários */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Funil
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pipelines.length === 0
                ? 'Nenhum funil. Crie o primeiro para usar o Kanban.'
                : `${pipelines.length} ${pipelines.length === 1 ? 'funil' : 'funis'} de vendas`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setEditorPipeline({})}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              onClick={() => refetchPipeline()}
              disabled={pipelineLoading}
              title="Atualizar lista"
            >
              <RefreshCw className={cn('h-4 w-4', pipelineLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Pesquisar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Filtro:</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[130px] h-10 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-900/50 overflow-hidden">
          {pipelineLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando funis...</span>
            </div>
          ) : filteredPipelines.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {pipelines.length === 0 ? 'Nenhum funil ainda. Clique em Novo para criar o primeiro.' : 'Nenhum resultado para a pesquisa ou filtro.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200/80 dark:divide-gray-700/80">
              {filteredPipelines.map((pip) => {
                const isActive = currentPipelineId === pip.id;
                const displayName = (pip.nome || 'Sem nome').replace(/_/g, ' ');
                return (
                  <li
                    key={pip.id}
                    className="flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                      <GitBranch className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {displayName}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {pip.descricao || 'Funil de vendas'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {isActive ? (
                        <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Em uso
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => setCurrentPipelineId(pip.id)}
                          title="Usar este funil"
                        >
                          Usar este
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setEditorPipeline(pip)}
                        title="Editar funil"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(pip)}
                        title="Excluir funil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {effectiveClienteId && !pipelineLoading && pipelines.length === 0 && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/10 rounded-xl">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
            <AlertTitle>Alternativa: criar a partir dos status</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>Preencha os status no card &quot;Status padrão&quot; abaixo e use o botão para criar um funil com essas etapas.</p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={creatingPipeline || statuses.filter((s) => s.name?.trim()).length === 0}
                onClick={handleCreatePipelineFromStatuses}
              >
                {creatingPipeline ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar funil a partir dos status
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <PipelineEditor
        open={editorPipeline !== null}
        onOpenChange={(open) => !open && setEditorPipeline(null)}
        pipeline={editorPipeline && editorPipeline.id ? editorPipeline : null}
        onSaved={() => refetchPipeline()}
        createPipeline={createPipeline}
        updatePipeline={updatePipeline}
        createStage={createStage}
        updateStage={updateStage}
        reorderStages={reorderStages}
        deleteStage={deleteStage}
        refetch={refetchPipeline}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
            <AlertDialogDescription>
              O funil &quot;{(deleteTarget?.nome || '').replace(/_/g, ' ')}&quot; será excluído. Os leads desse funil ficarão sem funil atribuído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget?.id) {
                  await deletePipeline(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cards de configuração */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card className={cardClass}>
          <CardHeader className={headerClass}>
            <CardTitle className={titleClass}>Etiquetas</CardTitle>
            <CardDescription className={descClass}>
              Rótulos opcionais para classificar leads (ex: quente, prioritário, meta-ads). Você pode atribuir várias etiquetas a cada lead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
            {tags.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Nome da etiqueta (ex: quente)"
                  value={(t.name || '').replace(/_/g, ' ')}
                  onChange={(e) => handleTagChange(i, 'name', e.target.value.replace(/\s+/g, '_'))}
                  className="flex-1"
                />
                <input
                  type="color"
                  value={t.color || '#6b7280'}
                  onChange={(e) => handleTagChange(i, 'color', e.target.value)}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveTag(i)} title="Remover">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar etiqueta
            </Button>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className={headerClass}>
            <CardTitle className={titleClass}>Origem dos leads</CardTitle>
            <CardDescription className={descClass}>Canais de origem (ex: instagram, facebook, whatsapp) para usar ao cadastrar leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
            {origins.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Origem (ex: instagram)" value={o} onChange={(e) => handleOriginChange(i, e.target.value)} className="flex-1" />
                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveOrigin(i)} title="Remover">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={handleAddOrigin}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar origem
            </Button>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader className={headerClass}>
            <CardTitle className={titleClass}>Status padrão (quando não há funil)</CardTitle>
            <CardDescription className={descClass}>
              Status que seus leads podem ter quando não há pipeline em uso (ex: agendado, compareceu, vendeu). O Kanban usa as etapas do funil quando disponível.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
            {statuses.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Nome do status (ex: agendado)"
                  value={(s.name || '').replace(/_/g, ' ')}
                  onChange={(e) => handleStatusChange(i, 'name', e.target.value.replace(/\s+/g, '_'))}
                  className="flex-1"
                />
                <input
                  type="color"
                  value={s.color || '#6b7280'}
                  onChange={(e) => handleStatusChange(i, 'color', e.target.value)}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStatus(i)} title="Remover">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={handleAddStatus}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar status
            </Button>
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          'Salvar configurações'
        )}
      </Button>
    </div>
  );
}
