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
 * Editor de funil (pipeline): nome, descrição, etapas com reordenar (subir/descer), tipo, cor.
 * Usado em modal a partir de Configurações para criar ou editar um funil.
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

    if (validStages.length === 0) {
      return;
    }

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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo funil' : `Editar: ${(pipeline?.nome || '').replace(/_/g, ' ')}`}</DialogTitle>
          <DialogDescription>
            Nome e etapas do funil. A ordem das etapas define as colunas do Kanban.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pipeline-nome">Nome do funil</Label>
            <Input
              id="pipeline-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Vendas principais"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pipeline-desc">Descrição (opcional)</Label>
            <Input
              id="pipeline-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Funil de vendas B2B"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Etapas</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddStage}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar etapa
              </Button>
            </div>

            {loadingStages ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando etapas...
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-2">
                {displayStages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
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
                        className="h-8 w-8"
                        onClick={() => moveStage(index, 1)}
                        disabled={index === displayStages.length - 1}
                        title="Descer"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      className="w-32 shrink-0"
                      placeholder="Nome"
                      value={(stage.nome || '').replace(/_/g, ' ')}
                      onChange={(e) => handleStageChange(index, 'nome', e.target.value.replace(/\s+/g, '_'))}
                    />
                    <Select
                      value={stage.tipo || 'intermediaria'}
                      onValueChange={(v) => handleStageChange(index, 'tipo', v)}
                    >
                      <SelectTrigger className="w-[130px] shrink-0">
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
                    <input
                      type="color"
                      className="h-9 w-12 rounded border cursor-pointer shrink-0"
                      value={stage.color || '#6b7280'}
                      onChange={(e) => handleStageChange(index, 'color', e.target.value)}
                      title="Cor"
                    />
                    <Input
                      type="number"
                      className="w-20 shrink-0"
                      placeholder="h"
                      min={0}
                      value={stage.tempo_max_horas ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        handleStageChange(index, 'tempo_max_horas', v === '' ? null : parseInt(v, 10));
                      }}
                      title="Tempo máx. (horas)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => handleRemoveStage(index)}
                      title="Remover etapa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !(nome || '').trim() || !hasStages}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
