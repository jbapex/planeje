import React, { useState, useEffect } from 'react';
import { useCrmContactAutomations } from '@/hooks/useCrmContactAutomations';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Zap, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRIGGER_LABELS = {
  new_contact: 'Quando um novo contato chegar',
  new_contact_meta_ads: 'Quando um novo contato com rastreio Meta Ads chegar',
};

export default function AutomacoesPage() {
  const { toast } = useToast();
  const { pipelines, loading: pipelinesLoading } = useCrmPipeline();
  const { automations, loading: automationsLoading, create, update, setActive, remove } = useCrmContactAutomations();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formTriggerType, setFormTriggerType] = useState('new_contact');
  const [formPipelineId, setFormPipelineId] = useState('');
  const [formStageId, setFormStageId] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [stagesForPipeline, setStagesForPipeline] = useState([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!formPipelineId) {
      setStagesForPipeline([]);
      setFormStageId('');
      return;
    }
    setStagesLoading(true);
    supabase
      .from('crm_stages')
      .select('id, nome, ordem')
      .eq('pipeline_id', formPipelineId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setStagesForPipeline(data || []);
        setFormStageId((prev) => {
          const stillValid = (data || []).some((s) => s.id === prev);
          return stillValid ? prev : (data?.[0]?.id || '');
        });
      })
      .finally(() => setStagesLoading(false));
  }, [formPipelineId]);

  const openCreate = () => {
    setEditingId(null);
    setFormTriggerType('new_contact');
    setFormPipelineId(pipelines?.[0]?.id || '');
    setFormStageId('');
    setFormActive(true);
    setModalOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setFormTriggerType(a.trigger_type || 'new_contact');
    setFormPipelineId(a.pipeline_id);
    setFormStageId(a.stage_id);
    setFormActive(a.is_active);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formPipelineId || !formStageId) {
      toast({ variant: 'destructive', title: 'Selecione funil e etapa' });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await update(editingId, { pipeline_id: formPipelineId, stage_id: formStageId, is_active: formActive });
      } else {
        await create({ pipeline_id: formPipelineId, stage_id: formStageId, is_active: formActive, trigger_type: formTriggerType });
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  };

  const loading = automationsLoading || pipelinesLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Automações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure para que novos contatos (WhatsApp) entrem automaticamente em um funil e etapa. Você pode ter uma regra para todos os novos contatos e outra só para contatos com rastreio Meta Ads.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={openCreate} className="gap-2" disabled={!pipelines?.length}>
              <Plus className="h-4 w-4" />
              Nova automação
            </Button>
          </div>

          {!pipelines?.length ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Crie pelo menos um funil em Ajustes → Funil para configurar uma automação.
                </p>
              </CardContent>
            </Card>
          ) : automations.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Nenhuma automação configurada. Clique em &quot;Nova automação&quot; para que novos contatos sejam
                  exportados automaticamente para um funil.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {automations.map((a) => (
                <Card key={a.id} className={cn(!a.is_active && 'opacity-75')}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-2">
                          <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base">
                            {TRIGGER_LABELS[a.trigger_type] || a.trigger_type}
                          </CardTitle>
                          <CardDescription className="mt-0.5">
                            → Funil <strong>{a.pipeline?.nome ?? '—'}</strong>, etapa{' '}
                            <strong>{a.stage?.nome ?? '—'}</strong>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={!!a.is_active}
                          onCheckedChange={(checked) => setActive(a.id, !!checked)}
                        />
                        <span className="text-xs text-muted-foreground">{a.is_active ? 'Ativa' : 'Inativa'}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar automação' : 'Nova automação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quando</Label>
              <Select
                value={formTriggerType}
                onValueChange={setFormTriggerType}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_contact">{TRIGGER_LABELS.new_contact}</SelectItem>
                  <SelectItem value="new_contact_meta_ads">{TRIGGER_LABELS.new_contact_meta_ads}</SelectItem>
                </SelectContent>
              </Select>
              {editingId && <p className="text-xs text-muted-foreground">O tipo de gatilho não pode ser alterado na edição.</p>}
            </div>
            <div className="space-y-2">
              <Label>Funil</Label>
              <Select value={formPipelineId} onValueChange={setFormPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select
                value={formStageId}
                onValueChange={setFormStageId}
                disabled={stagesLoading || !formPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={stagesLoading ? 'Carregando...' : 'Selecione a etapa'} />
                </SelectTrigger>
                <SelectContent>
                  {stagesForPipeline.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <Label htmlFor="form-active" className="cursor-pointer">Ativa</Label>
              <Switch id="form-active" checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving || !formPipelineId || !formStageId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
            <AlertDialogDescription>
              Novos contatos deixarão de ser exportados automaticamente para o funil. Contatos já exportados não
              são alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
