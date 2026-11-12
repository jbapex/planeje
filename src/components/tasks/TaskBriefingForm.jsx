import React from 'react';
import { FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { briefingFamily, emptyBriefingPayload } from '@/lib/briefingObrigatorio';
import TaskFieldHelp, { TaskFieldLabel } from '@/components/tasks/TaskFieldHelp';

/**
 * A legenda do post fica visível na tarefa. Roteiro, gravação e formato
 * continuam opcionais e recolhidos.
 */
export default function TaskBriefingForm({
  type,
  payload,
  briefingLegado = false,
  onPayloadChange,
}) {
  const family = briefingFamily(type);
  const p = { ...emptyBriefingPayload(), ...(payload || {}) };
  const planned = p.plan_material && typeof p.plan_material === 'object' ? p.plan_material : {};

  if (!type || family === 'isento' || family === 'generico') return null;

  const current = (key, plannedKey = key) => {
    const own = p[key];
    return own !== undefined && own !== null && String(own) !== '' ? own : (planned[plannedKey] || '');
  };
  const set = (key, value) => onPayloadChange({ ...p, [key]: value });
  const showCaption = family === 'video' || family === 'arte';
  const hasSeparatedContent = Boolean(
    current('roteiro') || current('quem_grava')
    || current('data_gravacao') || current('local_gravacao') || current('duracao_alvo_seg')
    || current('formato') || current('pauta_resumo')
  );

  if (briefingLegado && !showCaption) return null;

  return (
    <div className="space-y-4">
      {showCaption && (
        <div className="space-y-1.5">
          <TaskFieldLabel htmlFor="task-post-caption" help="Texto que vai na publicação. Publicações copia este campo.">Legenda do post</TaskFieldLabel>
          <Textarea
            id="task-post-caption"
            rows={6}
            value={current('copy_final', 'legenda')}
            onChange={(event) => set('copy_final', event.target.value)}
            placeholder="Texto da publicação"
          />
        </div>
      )}

      {!briefingLegado && (
        <details className="group overflow-hidden rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <div className="rounded-lg bg-violet-100 p-2 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"><FileText className="h-4 w-4" /></div>
              <p className="text-sm font-semibold">Conteúdo separado</p>
              <TaskFieldHelp label="Sobre conteúdo separado">
                {hasSeparatedContent
                  ? 'Há roteiro ou informações complementares neste bloco.'
                  : 'Abra só se precisar separar roteiro, gravação ou formato. A orientação principal e a legenda ficam nos campos acima.'}
              </TaskFieldHelp>
            </div>
            <span className="text-xs font-medium text-violet-700 group-open:hidden dark:text-violet-200">Abrir</span>
            <span className="hidden text-xs font-medium text-violet-700 group-open:inline dark:text-violet-200">Recolher</span>
          </summary>

          <div className="space-y-4 border-t bg-muted/10 p-4">
            {family === 'video' && <>
              <div className="space-y-1.5"><Label className="text-xs">Roteiro ou texto falado</Label><Textarea rows={5} value={current('roteiro')} onChange={(event) => set('roteiro', event.target.value)} /></div>
              <details className="rounded-lg border bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium">Informações de gravação <span className="font-normal text-muted-foreground">(opcional)</span></summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs">Quem grava</Label><Input value={current('quem_grava')} onChange={(event) => set('quem_grava', event.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Data da gravação</Label><Input type="date" value={current('data_gravacao')} onChange={(event) => set('data_gravacao', event.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Local</Label><Input value={current('local_gravacao')} onChange={(event) => set('local_gravacao', event.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Duração aproximada</Label><Input type="number" min={1} value={current('duracao_alvo_seg')} onChange={(event) => set('duracao_alvo_seg', event.target.value)} placeholder="Segundos" /></div>
                </div>
              </details>
            </>}

            {family === 'arte' && <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label className="text-xs">Formato</Label><Input value={current('formato')} onChange={(event) => set('formato', event.target.value)} placeholder="Ex.: feed 1:1 ou story" /></div>
              {String(type).toLowerCase() === 'carrossel' && <div className="space-y-1.5"><Label className="text-xs">Quantidade de páginas</Label><Input type="number" min={2} value={current('qtd_slides')} onChange={(event) => set('qtd_slides', event.target.value)} /></div>}
            </div>}

            {family === 'planejamento' && <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label className="text-xs">Mês de referência</Label><Input type="month" value={String(current('mes_referencia')).slice(0, 7)} onChange={(event) => set('mes_referencia', event.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Quantidade prevista</Label><Input type="number" min={1} value={current('qtd_entregas_contratadas')} onChange={(event) => set('qtd_entregas_contratadas', event.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Resumo da pauta</Label><Textarea rows={4} value={current('pauta_resumo')} onChange={(event) => set('pauta_resumo', event.target.value)} /></div>
            </div>}
          </div>
        </details>
      )}
    </div>
  );
}
