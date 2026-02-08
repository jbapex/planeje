import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
const TIPOS = [
  { value: 'intermediaria', label: 'Intermediária' },
  { value: 'ganho', label: 'Ganho' },
  { value: 'perdido', label: 'Perdido' },
];

/**
 * Editor de funil (pipeline): nome, descrição, etapas com reordenar, tipo, cor.
 */
export default function PipelineEditor({
  open,
  onOpenChange,
  pipeline,
  onSaved,
  createPipeline,
  updatePipeline,
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
  refetch,
}) {
  const isNew = !pipeline?.id;
  const [nome, setNome] = useState(pipeline?.nome || 'Novo funil');
  const [descricao, setDescricao] = useState(pipeline?.descricao || '');
  const [stages, setStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(pipeline?.nome || 'Novo funil');
    setDescricao(pipeline?.descricao || '');
    if (!pipeline?.id) {
      setStages([]);
      setLoadingStages(false);
      return;
    }
    let cancelled = false;
    setLoadingStages(true);
    supabase
      .from('crm_stages')
      .select('*')
      .eq('pipeline_id', pipeline.id)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setStages(data || []);
          setLoadingStages(false);
        }
      });
    return () => { cancelled = true; };
  }, [open, pipeline?.id, pipeline?.nome, pipeline?.descricao]);

  const handleAddStage = () => {
    setStages((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        nome: '',
        tipo: 'intermediaria',
        color: '#6b7280',
        ordem: prev.length,
        tempo_max_horas: null,
        _new: true,
      },
    ]);
  };

  const handleRemoveStage = (index) => {
    setStages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStageChange = (index, field, value) => {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const moveStage = (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= stages.length) return;
    setStages((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr.map((s, i) => ({ ...s, ordem: i }));
    });
  };

  const handleSave = async () => {
    const nomeTrim = (nome || '').trim();
    if (!nomeTrim) return;

    const validStages = stages
      .map((s, i) => ({
        ...s,
        nome: (s.nome || '').trim().replace(/\s+/g, '_'),
        ordem: i,
      }))
      .filter((s) => s.nome);

    if (validStages.length === 0) return;

    setSaving(true);
    try {
      let pipelineId = pipeline?.id;
      if (isNew) {
        const created = await createPipeline({ nome: nomeTrim, descricao: (descricao || '').trim() });
        if (!created) return;
        pipelineId = created.id;
      } else {
        await updatePipeline(pipeline.id, { nome: nomeTrim, descricao: (descricao || '').trim() });
      }

      const existingStages = stages.filter((s) => !s._new && s.id);
      const newStages = stages.filter((s) => s._new);
      const orderAfterSave = [];

      for (let i = 0; i < validStages.length; i++) {
        const s = validStages[i];
        if (s._new) {
          const created = await createStage(pipelineId, {
            nome: s.nome,
            tipo: s.tipo || 'intermediaria',
            color: s.color || '#6b7280',
            ordem: i,
          });
          if (created) orderAfterSave.push(created.id);
        } else {
          await updateStage(s.id, {
            nome: s.nome,
            tipo: s.tipo || 'intermediaria',
            color: s.color || '#6b7280',
            ordem: i,
          });
          orderAfterSave.push(s.id);
        }
      }

      if (orderAfterSave.length > 0) {
        await reorderStages(pipelineId, orderAfterSave);
      }

      const toDelete = existingStages.filter((e) => !validStages.find((v) => v.id === e.id));
      for (const s of toDelete) {
        await deleteStage(s.id);
      }

      await refetch();
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const displayStages = stages.length ? stages : [];
  const hasStages = displayStages.some((s) => (s.nome || '').trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 gap-0 border border-gray-200/90 dark:border-gray-700 shadow-xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200/80 dark:border-gray-700/80">
          <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? 'Novo funil' : `Editar: ${(pipeline?.nome || '').replace(/_/g, ' ')}`}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Nome e etapas do funil. A ordem das etapas define as colunas do Kanban.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline-nome" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nome do funil
              </Label>
              <Input
                id="pipeline-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Vendas principais"
                className="h-10 rounded-lg border-gray-200 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pipeline-desc" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Descrição <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="pipeline-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Funil de vendas B2B"
                className="h-10 rounded-lg border-gray-200 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Etapas
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Use as setas para reordenar.</p>
              </div>
              <Button
                type="button"
                onClick={handleAddStage}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg h-9 text-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Adicionar etapa
              </Button>
            </div>

            {loadingStages ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm rounded-xl border border-dashed border-gray-200 dark:border-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando etapas...
              </div>
            ) : displayStages.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-gray-200 dark:border-gray-600 bg-slate-50/50 dark:bg-slate-800/20">
                Nenhuma etapa. Clique em &quot;Adicionar etapa&quot; para começar.
              </div>
            ) : (
              <ul className="space-y-3">
                {displayStages.map((stage, index) => (
                  <li
                    key={stage.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200/80 dark:border-gray-600/80 bg-white dark:bg-gray-800/40 p-3 shadow-sm"
                  >
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => moveStage(index, -1)}
                        disabled={index === 0}
                        title="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => moveStage(index, 1)}
                        disabled={index === displayStages.length - 1}
                        title="Descer"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-sm font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                      {index + 1}
                    </div>
                    <Input
                      className="flex-1 min-w-0 h-9 rounded-lg text-sm border-gray-200 dark:border-gray-600"
                      placeholder="Nome da etapa"
                      value={(stage.nome || '').replace(/_/g, ' ')}
                      onChange={(e) => handleStageChange(index, 'nome', e.target.value.replace(/\s+/g, '_'))}
                    />
                    <Select
                      value={stage.tipo || 'intermediaria'}
                      onValueChange={(v) => handleStageChange(index, 'tipo', v)}
                    >
                      <SelectTrigger className="w-[130px] h-9 rounded-lg shrink-0 border-gray-200 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="color"
                        className="h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer bg-transparent"
                        value={stage.color || '#6b7280'}
                        onChange={(e) => handleStageChange(index, 'color', e.target.value)}
                        title="Cor"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveStage(index)}
                        title="Remover etapa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-200/80 dark:border-gray-700/80 bg-slate-50/50 dark:bg-slate-900/30 rounded-b-2xl gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-lg"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !(nome || '').trim() || !hasStages}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
