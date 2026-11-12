import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Save, Loader2, Trash2, Copy, Sparkles, CalendarDays, ExternalLink, Link2, Route, FileText, Video, Palette, ChevronRight, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/components/ui/use-toast';
import AutomationHelp from '@/components/tasks/automations/AutomationHelp';
import { ChannelLogo } from '@/components/tasks/TaskChannelBadges';
import { CHANNEL_OPTIONS } from '@/lib/taskChannelPublications';
import { supabase } from '@/lib/customSupabaseClient';
import { createTaskFromPlanMaterial } from '@/lib/projectPlanTasks';
import { emptyProjectPlan, normalizeProjectPlan, projectPlanPayload, reuseProjectPlan, applyProjectPlanSuggestion, parseSuggestedPlanMaterials, nextPlanMaterialNumber, normalizePlanMaterialNumber, planMaterialSequenceNumber, planMaterialTaskTitle, planMaterialTaskType, planMaterialPreparation } from '@/lib/projectPlanning';
import AiChatDialog from '@/components/projects/AiChatDialog';
import PlanRichTextEditor from '@/components/projects/PlanRichTextEditor';
import { richTextHasContent, richTextToPlainText, richTextValueToHtml, sanitizeRichTextHtml } from '@/lib/richText';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { projectMonths, projectPeriod, projectPeriodLabel, materialReferenceMonth, formatProjectMonth } from '@/lib/projectPeriod';
import { isTerminalTaskStatus } from '@/lib/taskUrgency';

export function PlanDateInput({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-1"><Label>{label}</Label><div className="flex gap-2">
    <Input type="date" aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 [&::-webkit-calendar-picker-indicator]:hidden" />
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="icon" aria-label={`Abrir calendário: ${label}`}><CalendarDays className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent className="w-auto p-0 z-[80]" align="end"><Calendar locale={ptBR} mode="single" selected={value ? new Date(`${value}T12:00:00`) : undefined} onSelect={(d) => { if (d) onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }} /></PopoverContent></Popover>
  </div></div>;
}

function PlanDateShortcut({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const display = value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Definir data';
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-9 gap-2 rounded-full bg-background px-3 font-normal" aria-label={`${label}: ${display}`}><CalendarDays className="h-4 w-4" /><span className="text-muted-foreground">{label}</span><span className="font-medium">{display}</span></Button></PopoverTrigger>
    <PopoverContent className="w-auto p-0 z-[80]" align="start">
      <Calendar locale={ptBR} mode="single" selected={value ? new Date(`${value}T12:00:00`) : undefined} onSelect={(date) => { if (date) onChange(format(date, 'yyyy-MM-dd')); setOpen(false); }} />
      {value && <div className="border-t p-2"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { onChange(''); setOpen(false); }}>Limpar data</Button></div>}
    </PopoverContent>
  </Popover>;
}

function PlanPreparationShortcut({ material, task, template, functions, onChange }) {
  const stages = Array.isArray(template?.stages) ? template.stages : [];
  const preparation = task
    ? { ...planMaterialPreparation(material, stages), entryStage: stages.find((stage) => stage.key === task.workflow_entry_stage_key) || planMaterialPreparation(material, stages).entryStage }
    : planMaterialPreparation(material, stages);
  const entryStage = preparation.entryStage;
  const entryFunction = functions.find((fn) => fn.id === entryStage?.function_id);
  const label = task && task.workflow_stage_key !== 'backlog'
    ? (stages.find((stage) => stage.key === task.workflow_stage_key)?.label || preparation.label)
    : (entryStage?.label || preparation.label);

  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-9 max-w-full gap-2 rounded-full bg-background px-3 font-normal" aria-label={`Primeiro passo: ${label}`}><ChevronRight className="h-4 w-4 shrink-0 text-violet-600" /><span className="text-muted-foreground">Começa em</span><span className="truncate font-medium">{label}</span></Button></PopoverTrigger>
    <PopoverContent className="z-[80] w-[360px] max-w-[calc(100vw-2rem)] space-y-4" align="start">
      <div><div className="flex items-center gap-2"><p className="font-semibold">Onde o trabalho começa?</p><AutomationHelp>“A Fazer” continua sendo a entrada. Ao iniciar, a tarefa pula o que já está pronto e vai para a primeira função que ainda precisa agir.</AutomationHelp></div><p className="mt-1 text-xs text-muted-foreground">Marque somente o que já foi concluído antes da tarefa.</p></div>
      {task ? <div className="rounded-xl border bg-muted/40 p-3 text-sm"><p className="font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">A tarefa já foi criada. O andamento agora é controlado em Tarefas.</p></div> : <>
        <div className="space-y-1.5"><Label>Briefing</Label><Select value={preparation.briefingStatus} onValueChange={(value) => onChange({ briefing_status: value, ...(value === 'needs_briefing' ? { script_status: 'not_started' } : {}) })}><SelectTrigger aria-label="Situação do briefing"><SelectValue /></SelectTrigger><SelectContent className="z-[90]"><SelectItem value="needs_briefing">Ainda precisa preparar</SelectItem><SelectItem value="ready">Já está pronto</SelectItem></SelectContent></Select></div>
        {preparation.video && preparation.briefingStatus === 'ready' && <div className="space-y-1.5"><Label>Roteiro</Label><Select value={preparation.scriptStatus} onValueChange={(value) => onChange({ script_status: value })}><SelectTrigger aria-label="Situação do roteiro"><SelectValue /></SelectTrigger><SelectContent className="z-[90]"><SelectItem value="not_started">Ainda precisa escrever</SelectItem><SelectItem value="ready_for_review">Pronto para revisar</SelectItem><SelectItem value="approved">Já está aprovado</SelectItem></SelectContent></Select></div>}
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm dark:bg-violet-950/20"><p className="font-medium">Primeiro passo: {entryStage?.label || preparation.label}</p><p className="mt-1 text-xs text-muted-foreground">{entryFunction?.name || 'A função será definida pelo fluxo'} recebe a tarefa em A Fazer.</p></div>
      </>}
    </PopoverContent>
  </Popover>;
}

function PlanWorkflowShortcut({ material, task, profiles, functions, templates, loading, error, onChange }) {
  const type = planMaterialTaskType(material);
  const compatible = templates.filter((template) => (template.task_types || []).includes(type));
  const configuredId = task?.workflow_template_id || material.workflow_template_id;
  const selected = templates.find((template) => template.id === configuredId) || compatible[0] || null;
  const stages = Array.isArray(selected?.stages) ? selected.stages : [];
  const currentStage = task
    ? stages.find((stage) => stage.key === task.workflow_stage_key) || stages.find((stage) => stage.status_value === task.status) || stages[0]
    : stages[0];
  const functionFor = (stage) => functions.find((fn) => fn.id === stage?.function_id);
  const peopleFor = (stage) => {
    const ids = functionFor(stage)?.assignee_ids || [];
    return ids.map((id) => profiles.find((profile) => profile.id === id)?.full_name).filter(Boolean);
  };
  const currentPeople = task
    ? (task.assignee_ids || []).map((id) => profiles.find((profile) => profile.id === id)?.full_name).filter(Boolean)
    : peopleFor(currentStage);
  const flowName = selected?.name?.replace(/^Conteúdo\s*[—–-]\s*/i, '') || (loading ? 'Carregando…' : 'Sem fluxo');
  const summary = currentPeople.length ? `${flowName} · ${currentPeople.join(', ')}` : flowName;

  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-9 max-w-full gap-2 rounded-full px-3 font-normal text-muted-foreground" aria-label={`Fluxo e responsáveis: ${summary}`}><Route className="h-4 w-4 shrink-0" /><span className="truncate">{flowName}</span></Button></PopoverTrigger>
    <PopoverContent className="z-[80] w-[380px] max-w-[calc(100vw-2rem)] space-y-3" align="start">
      <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">Fluxo e responsáveis</p><p className="text-xs text-muted-foreground">Cada etapa envia a tarefa para a função configurada.</p></div><AutomationHelp>O tipo do material escolhe o fluxo. As pessoas vêm das funções e mudam automaticamente quando a tarefa avança.</AutomationHelp></div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!task && compatible.length > 0 && <div className="space-y-1"><Label>Fluxo desta tarefa</Label><Select value={material.workflow_template_id || '__automatic__'} onValueChange={(value) => onChange(value === '__automatic__' ? null : value)}><SelectTrigger aria-label="Fluxo desta tarefa"><SelectValue /></SelectTrigger><SelectContent className="z-[90]"><SelectItem value="__automatic__">Automático pelo tipo</SelectItem>{compatible.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>}
      {task && <p className="rounded-lg bg-muted/50 p-2 text-sm">Esta tarefa já foi criada. A etapa atual e os responsáveis continuam sendo controlados em Tarefas.</p>}
      {selected ? <div className="max-h-64 space-y-2 overflow-y-auto pr-1">{stages.map((stage) => {
        const fn = functionFor(stage);
        const names = peopleFor(stage);
        const active = currentStage?.key === stage.key;
        return <div key={stage.key} className={`rounded-lg border px-3 py-2 text-sm ${active ? 'border-violet-300 bg-violet-50/60 dark:bg-violet-950/20' : ''}`}><p className="font-medium">{stage.label}</p><p className="text-xs text-muted-foreground">{fn?.name || 'Função não configurada'} · {names.join(', ') || 'Sem responsável'}</p></div>;
      })}</div> : !loading && <p className="text-sm text-muted-foreground">Este tipo ainda não possui um fluxo configurado.</p>}
      <Button asChild type="button" variant="outline" size="sm" className="w-full"><Link to="/tasks/automations">Configurar funções e pessoas</Link></Button>
    </PopoverContent>
  </Popover>;
}

function MaterialMonthSelect({ material, project, task, onChange, label = 'Mês do conteúdo' }) {
  const months = projectMonths(project);
  if (months.length < 2) return null;
  const selected = materialReferenceMonth(material, project, task);
  const locked = Boolean(task?.post_date || material.data_postagem || material.data_publicacao);
  return <div className="space-y-1.5"><Label>{label}</Label><Select value={selected} disabled={locked} onValueChange={(value) => onChange(`${value}-01`)}><SelectTrigger aria-label={label} className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent className="z-[90]">{[...new Set([...months, selected])].filter(Boolean).map((month) => <SelectItem key={month} value={month}>{formatProjectMonth(month)}</SelectItem>)}</SelectContent></Select>{locked && <p className="text-xs text-muted-foreground">Segue a data de postagem. Altere em “Postar”.</p>}</div>;
}

function Field({ label, value, onChange, placeholder, rows = 3 }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Textarea aria-label={label} rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

const suggestionLabels = { objetivo: 'Objetivo', contexto_ia: 'Contexto e prioridades', estrategia_comunicacao: 'Comunicação', mensagem_principal: 'Mensagem principal', tom_voz: 'Tom de voz', gatilhos: 'Orientações criativas', conteudo_criativos: 'Ações e campanhas', fases: 'Ações', trafego_pago: 'Tráfego', materiais: 'Materiais', descricao: 'Título', detalhes: 'Orientações para produção', roteiro: 'Roteiro', legenda: 'Legenda', nome: 'Nome', canais: 'Canais', tipo: 'Tipo', plataforma: 'Canal', data_entrega: 'Entrega', data_postagem: 'Postagem', orcamento: 'Verba', publico: 'Público', cronograma: 'Cronograma' };
function SuggestionContent({ value }) {
  if (value == null) return null;
  if (Array.isArray(value)) return <div className="space-y-3">{value.map((item, i) => <div key={i} className="rounded-lg border p-3"><SuggestionContent value={item} /></div>)}</div>;
  if (typeof value === 'object') return <div className="space-y-3">{Object.entries(value).filter(([key]) => !['id', 'project_id', 'task_id', 'responsavel_id'].includes(key)).map(([key, item]) => <div key={key}><p className="font-medium text-sm">{suggestionLabels[key] || key.replaceAll('_', ' ')}</p><SuggestionContent value={item} /></div>)}</div>;
  return <p className="whitespace-pre-wrap text-sm text-muted-foreground">{String(value)}</p>;
}
const taskRoute = (task) => `/tasks/kanban/${task.id}`;
const types = { arte: 'Arte', carrossel: 'Carrossel', video: 'Vídeo', reels: 'Reels', story: 'Story', post: 'Post', outro: 'Outro' };
const materialLooks = {
  arte: { icon: Palette, className: 'bg-fuchsia-500', soft: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-200' },
  carrossel: { icon: Palette, className: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200' },
  video: { icon: Video, className: 'bg-sky-500', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200' },
  reels: { icon: Video, className: 'bg-cyan-500', soft: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200' },
  story: { icon: FileText, className: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200' },
  post: { icon: FileText, className: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200' },
  outro: { icon: FileText, className: 'bg-slate-500', soft: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200' },
};

function ChannelToggleGroup({ channels = [], onChange, disabled = false }) {
  return <div className="flex flex-wrap gap-2">{CHANNEL_OPTIONS.map((channel) => {
    const selected = channels.includes(channel);
    return <Button key={channel} type="button" variant={selected ? 'default' : 'outline'} size="sm" className="h-8 rounded-full px-2.5 text-xs" aria-pressed={selected} disabled={disabled} onClick={() => onChange(selected ? channels.filter((value) => value !== channel) : [...channels, channel])}><ChannelLogo channel={channel} className="mr-1 h-4 w-4 text-[8px]" />{channel}</Button>;
  })}</div>;
}

const materialContentFields = [
  { key: 'detalhes', label: 'Orientações para produção', placeholder: 'Objetivo, mensagem, formato e cuidados para produzir.', rows: 4 },
  { key: 'roteiro', label: 'Roteiro ou texto da peça', placeholder: 'Texto, cenas ou estrutura do material.', rows: 5 },
  { key: 'legenda', label: 'Legenda', placeholder: 'Legenda prevista para a publicação.', rows: 3 },
];

function MaterialContentEditor({ material, onChange, showEmpty = true, fieldKeys = null }) {
  const contentFields = materialContentFields.filter((field) => fieldKeys ? fieldKeys.includes(field.key) : (showEmpty || material[field.key]));
  return <div className="grid gap-3 md:grid-cols-2">{contentFields.map((field) => {
    const value = material[field.key] || '';
    const rows = Math.min(14, Math.max(field.rows, Math.ceil(value.length / 130) + 1));
    const fullWidth = ['detalhes', 'roteiro'].includes(field.key);
    return <div key={field.key} className={fullWidth ? 'md:col-span-2' : ''}><Field label={field.label} value={value} onChange={(nextValue) => onChange({ [field.key]: nextValue })} rows={rows} placeholder={field.placeholder} /></div>;
  })}</div>;
}

function CompactMaterialContentEditor({ material, onChange }) {
  const [primaryKeys] = useState(() => {
    const filled = materialContentFields.filter((field) => material[field.key]).map((field) => field.key);
    return filled.length ? filled : ['detalhes'];
  });
  const optionalKeys = materialContentFields.filter((field) => !primaryKeys.includes(field.key)).map((field) => field.key);
  return <div className="space-y-3">
    <MaterialContentEditor material={material} onChange={onChange} fieldKeys={primaryKeys} />
    {!!optionalKeys.length && <details className="rounded-xl border bg-background p-4"><summary className="cursor-pointer text-sm font-medium">Adicionar outros campos <span className="font-normal text-muted-foreground">(opcional)</span></summary><div className="mt-4"><MaterialContentEditor material={material} onChange={onChange} fieldKeys={optionalKeys} /></div></details>}
  </div>;
}

function MaterialSuggestionPreview({ materials, clientName, project, onChange, onRemove }) {
  const [expandedId, setExpandedId] = useState(null);
  return <div className="space-y-3">{materials.map((material, index) => {
    const itemId = material.id || String(index);
    const expanded = expandedId === itemId;
    const preview = material.roteiro || material.detalhes || material.legenda || '';
    return <article key={itemId} className={`overflow-hidden rounded-2xl border bg-card transition-shadow ${expanded ? 'shadow-md ring-1 ring-violet-200 dark:ring-violet-900' : 'shadow-sm'}`}>
      <div className="flex items-start gap-3 p-4">
        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : itemId)}>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">{types[material.tipo] || 'Material'} {material.numero}</span><span className="text-xs text-muted-foreground">Rascunho do plano</span></div>
          <h4 className="mt-2 font-semibold">{material.descricao || `Material ${index + 1}`}</h4>
          {preview && <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{preview}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">{(material.canais || []).slice(0, 3).map((channel) => <ChannelLogo key={channel} channel={channel} className="h-4 w-4 text-[8px]" />)}{material.canais?.length ? material.canais.join(', ') : 'Sem canal'}</span>
            <span>{formatProjectMonth(materialReferenceMonth(material, project))}</span><span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{material.data_postagem ? `Postar ${new Date(`${material.data_postagem}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Postagem não definida'}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Remover sugestão ${index + 1}`} onClick={() => onRemove(index)}><Trash2 className="h-4 w-4" /></Button><Button type="button" variant="outline" size="sm" onClick={() => setExpandedId(expanded ? null : itemId)}>{expanded ? 'Fechar' : 'Revisar'}<ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} /></Button></div>
      </div>
      {expanded && <div className="space-y-5 border-t bg-muted/10 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_90px]">
          <div className="space-y-1.5"><Label>Título</Label><Input aria-label={`Título do material ${index + 1}`} value={material.descricao || ''} onChange={(event) => onChange(index, { descricao: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tipo</Label><Select value={material.tipo || 'outro'} onValueChange={(value) => onChange(index, { tipo: value, formato: types[value] })}><SelectTrigger aria-label={`Tipo do material ${index + 1}`}><SelectValue /></SelectTrigger><SelectContent className="z-[90]">{Object.entries(types).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Número</Label><Input aria-label={`Número do material ${index + 1}`} inputMode="numeric" value={material.numero || ''} onChange={(event) => onChange(index, { numero: event.target.value.replace(/\D/g, '').slice(0, 4) })} /></div>
        </div>
        <MaterialMonthSelect material={material} project={project} onChange={(mes_referencia) => onChange(index, { mes_referencia })} label={`Mês do material ${index + 1}`} />
        <div><div className="mb-3 flex items-center gap-2"><h5 className="text-sm font-semibold">Texto que seguirá para a tarefa</h5><AutomationHelp>Mostramos primeiro somente os campos que a IA encontrou no plano. Você pode corrigir o texto antes de adicionar o rascunho.</AutomationHelp></div><CompactMaterialContentEditor material={material} onChange={(values) => onChange(index, values)} /></div>
        <div className="grid gap-5 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_420px]"><div><div className="mb-3 flex items-center gap-2"><h5 className="text-sm font-semibold">Onde será publicado</h5><AutomationHelp>Marque todos os canais que usarão exatamente este material. Outra edição ou formato deve ser outro material.</AutomationHelp></div><ChannelToggleGroup channels={material.canais || []} onChange={(canais) => onChange(index, { canais })} /></div><div className="grid gap-3 sm:grid-cols-2"><PlanDateInput label="Produzir até" value={material.data_entrega} onChange={(data_entrega) => onChange(index, { data_entrega })} /><PlanDateInput label="Postar em" value={material.data_postagem} onChange={(data_postagem) => onChange(index, { data_postagem })} /></div></div>
        <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/20 dark:text-violet-200">Ao adicionar, este item vira somente um rascunho no plano. A tarefa ainda não será criada.</p>
      </div>}
    </article>;
  })}</div>;
}

function PlanChannelShortcut({ material, task, onChange }) {
  const channels = material.canais || [];
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-9 w-full justify-start gap-2 rounded-full bg-background px-3 font-normal" aria-label={channels.length ? `Canais: ${channels.join(', ')}` : 'Definir canais'}><span className="flex -space-x-1">{channels.slice(0, 3).map((channel) => <ChannelLogo key={channel} channel={channel} className="h-5 w-5 text-[9px] ring-1" />)}</span><span className="truncate">{channels.length ? `${channels.length} ${channels.length === 1 ? 'canal' : 'canais'}` : 'Definir canais'}</span></Button></PopoverTrigger>
    <PopoverContent className="z-[80] w-[430px] max-w-[calc(100vw-2rem)] space-y-3" align="start"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">Canais deste material</p><p className="text-xs text-muted-foreground">O mesmo material pode seguir para vários canais.</p></div><AutomationHelp>Se um canal precisar de outro corte, dimensão ou edição, crie um material separado. Depois que a tarefa for criada, a execução de cada canal fica em Publicações.</AutomationHelp></div>{task ? <div className="rounded-xl border bg-muted/40 p-3 text-sm"><p className="font-medium">A tarefa já foi criada.</p><p className="mt-1 text-xs text-muted-foreground">Ajuste destinos e publicações dentro da tarefa para preservar o controle da execução.</p><Button asChild type="button" variant="outline" size="sm" className="mt-3"><Link to={taskRoute(task)}>Abrir publicações da tarefa</Link></Button></div> : <ChannelToggleGroup channels={channels} onChange={onChange} />}</PopoverContent>
  </Popover>;
}

const planDocumentClass = 'plan-rich-editor text-base leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-5 [&_img]:my-4 [&_img]:max-w-full [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:mb-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-7';

function PlanDocumentPreview({ value }) {
  return <article
    className={`${planDocumentClass} min-h-[320px] rounded-2xl border bg-background px-6 py-5 shadow-sm`}
    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(richTextValueToHtml(value)) }}
  />;
}

const ProjectPlanningWorkspace = forwardRef(function ProjectPlanningWorkspace({ project, client, onSaved }, ref) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [assignmentConfig, setAssignmentConfig] = useState({ profiles: [], functions: [], templates: [], statuses: [], loading: true, error: '' });
  const [busyMaterial, setBusyMaterial] = useState(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [linkId, setLinkId] = useState(null);
  const [existingTaskId, setExistingTaskId] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [materialSuggestion, setMaterialSuggestion] = useState(null);
  const [extractingMaterials, setExtractingMaterials] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState(null);
  const [materialMonth, setMaterialMonth] = useState('all');
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);
  const [planDialogMode, setPlanDialogMode] = useState(null);
  useEffect(() => {
    if (loading) return;
    const mode = searchParams.get('plan');
    if (mode !== 'view' && mode !== 'edit') return;
    setPlanDialogMode(mode);
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams]);
  const planRef = useRef(null);
  const versionRef = useRef(null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saveQueue = useRef(Promise.resolve(true));
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const draftKey = `project-planning-draft:${project.id}`;

  const loadTasks = useCallback(async () => {
    const { data, error: err } = await supabase.from('tarefas').select('id,title,status,plan_material_id,project_id,assignee_ids,due_date,post_date,workflow_template_id,workflow_stage_key,workflow_entry_stage_key,operational_function_id,production_delivered_at').eq('project_id', project.id);
    if (err) throw err;
    if (mounted.current) setTasks(data || []);
  }, [project.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.all([
        supabase.from('profiles').select('id,full_name,status,role').neq('role', 'cliente'),
        supabase.from('task_operational_functions').select('id,name,assignee_ids,is_active').eq('is_active', true),
        supabase.from('task_workflow_templates').select('id,name,task_types,stages,is_active,created_at').eq('is_active', true).order('created_at').order('id'),
        supabase.from('task_statuses').select('value,is_terminal'),
      ]);
      if (!active) return;
      const failed = results.find((result) => result.error);
      setAssignmentConfig({
        profiles: (results[0].data || []).filter((profile) => profile.status === 'active' && ['admin', 'superadmin', 'colaborador'].includes(profile.role)),
        functions: results[1].data || [],
        templates: results[2].data || [],
        statuses: results[3].data || [],
        loading: false,
        error: failed ? 'Não foi possível conferir o fluxo agora.' : '',
      });
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    (async () => {
      try {
        const { data, error: err } = await supabase.from('campaign_plans').select('*').eq('project_id', project.id).maybeSingle();
        if (err) throw err;
        if (!active) return;
        const next = normalizeProjectPlan(data) || emptyProjectPlan(project.id);
        versionRef.current = data?.updated_at || null;
        planRef.current = next;
        setPlan(next);
        try { const cached = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (cached?.plan) setRecoveredDraft(cached.plan); } catch { /* optional local recovery */ }
        await loadTasks();
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; mounted.current = false; };
  }, [project.id, draftKey, loadTasks]);

  const change = useCallback((next) => {
    planRef.current = next;
    revision.current += 1;
    setPlan(next);
    setDirty(true);
    setError('');
    try { localStorage.setItem(draftKey, JSON.stringify({ plan: next, baseVersion: versionRef.current })); } catch { /* server save remains available */ }
  }, [draftKey]);

  const save = useCallback(() => {
    saveQueue.current = saveQueue.current.catch(() => false).then(async () => {
      while (planRef.current && revision.current > savedRevision.current) {
        const snapshot = structuredClone(planRef.current);
        const snapshotRevision = revision.current;
        if (mounted.current) { setSaving(true); setError(''); }
        try {
          const payload = projectPlanPayload(snapshot);
          let query = snapshot.id
            ? supabase.from('campaign_plans').update(payload).eq('id', snapshot.id)
            : supabase.from('campaign_plans').insert({ ...payload, project_id: project.id });
          if (snapshot.id) query = versionRef.current ? query.eq('updated_at', versionRef.current) : query.is('updated_at', null);
          const { data, error: err } = await query.select('id,updated_at').maybeSingle();
          if (err) throw err;
          if (!data) throw new Error('O plano mudou em outra janela. Seu rascunho está guardado neste navegador. Reabra o planejamento para conferir antes de aplicar.');
          versionRef.current = data.updated_at;
          planRef.current = { ...planRef.current, id: data.id, updated_at: data.updated_at };
          savedRevision.current = snapshotRevision;
          if (mounted.current) setPlan(planRef.current);
          if (revision.current === savedRevision.current) {
            try { localStorage.removeItem(draftKey); } catch { /* optional cache */ }
            if (mounted.current) setDirty(false);
          }
          onSavedRef.current?.();
        } catch (err) {
          if (mounted.current) setError(err.message || 'Não foi possível salvar.');
          return false;
        } finally { if (mounted.current) setSaving(false); }
      }
      return true;
    });
    return saveQueue.current;
  }, [draftKey, project.id]);
  useImperativeHandle(ref, () => ({ flush: save }), [save]);
  useEffect(() => {
    if (!dirty || error) return;
    const timer = setTimeout(() => { void save(); }, 800);
    return () => clearTimeout(timer);
  }, [plan, dirty, error, save]);
  useEffect(() => {
    const warn = (event) => { if (revision.current > savedRevision.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); void save(); };
  }, [save]);

  const setField = (key, value) => change({ ...planRef.current, [key]: value });
  const setNested = (key, field, value) => setField(key, { ...planRef.current[key], [field]: value });
  const updateMaterial = (id, key, value) => setField('materiais', planRef.current.materiais.map((m) => String(m.id) === String(id) ? { ...m, [key]: value } : m));
  const patchMaterial = (id, values) => setField('materiais', planRef.current.materiais.map((m) => String(m.id) === String(id) ? { ...m, ...values } : m));
  const materialTask = (id) => tasks.find((task) => String(task.plan_material_id) === String(id));
  const deleteMaterial = plan?.materiais?.find((m) => String(m.id) === String(deleteId));
  const deleteTask = deleteMaterial && materialTask(deleteMaterial.id);

  const addMaterial = (tipo = 'arte') => {
    const m = { id: crypto.randomUUID(), mes_referencia: `${materialMonth === 'all' ? projectPeriod(project).start : materialMonth}-01`, tipo, formato: types[tipo], numero: nextPlanMaterialNumber(planRef.current.materiais, tipo), descricao: '', detalhes: '', roteiro: '', legenda: '', cta: '', referencias: '', canais: [], data_entrega: '', data_postagem: '', briefing_status: 'needs_briefing', script_status: 'not_started' };
    setField('materiais', [...planRef.current.materiais, m]);
    setExpandedMaterialId(m.id);
  };
  const removeMaterial = async () => {
    if (!deleteId) return;
    const materialId = deleteId;
    const linked = Boolean(materialTask(materialId));
    setBusyMaterial(materialId);
    setField('materiais', planRef.current.materiais.filter((m) => String(m.id) !== String(materialId)));
    setDeleteId(null);
    try {
      if (await save()) toast({ title: linked ? 'Item removido do plano. A tarefa foi preservada.' : 'Item removido do plano.' });
    } finally { setBusyMaterial(null); }
  };
  const updateMaterialDate = async (material, field, value) => {
    const linkedTask = materialTask(material.id);
    const previous = material[field] || '';
    updateMaterial(material.id, field, value);
    if (!linkedTask) return;
    try {
      if (!await save()) return;
      const taskField = field === 'data_entrega' ? 'due_date' : 'post_date';
      const { error: taskError } = await supabase.from('tarefas').update({ [taskField]: value || null }).eq('id', linkedTask.id);
      if (taskError) throw taskError;
      await loadTasks();
      toast({ title: field === 'data_entrega' ? 'Data de criação atualizada.' : 'Data de postagem atualizada.', description: 'O planejamento e a tarefa estão sincronizados.' });
    } catch (dateError) {
      updateMaterial(material.id, field, previous);
      await save();
      toast({ title: 'Não foi possível atualizar a data', description: dateError.message, variant: 'destructive' });
    }
  };
  const createTask = async (material) => {
    if (!material.descricao?.trim()) { toast({ title: 'Dê um título ao material.', variant: 'destructive' }); return; }
    setBusyMaterial(material.id);
    try {
      if (!await save()) return;
      const result = await createTaskFromPlanMaterial(supabase, project.id, String(material.id));
      await loadTasks();
      toast({ title: result.created ? 'Tarefa criada em A Fazer.' : 'Este item já tem uma tarefa.' });
      onSavedRef.current?.();
    } catch (err) { toast({ title: 'Não foi possível criar a tarefa', description: err.message, variant: 'destructive' }); }
    finally { setBusyMaterial(null); }
  };
  const askAiToExtractMaterials = async () => {
    if (!richTextHasContent(planRef.current?.contexto_ia)) {
      toast({ title: 'Escreva o plano do mês antes de pedir sugestões.', variant: 'destructive' });
      return;
    }
    setExtractingMaterials(true);
    try {
      const planText = richTextToPlainText(planRef.current.contexto_ia);
      const existingTitles = (planRef.current.materiais || []).map((item) => item.descricao).filter(Boolean);
      const systemPrompt = `Você transforma um planejamento de um ou vários meses em uma pré-configuração de materiais para uma agência.
Leia somente o plano fornecido e identifique cada entrega que realmente precisa ser produzida, como arte, carrossel, vídeo, reels, story ou post.
Não crie tarefas, responsáveis, aprovações ou status. Não invente entregas. Copie integralmente o texto existente para o campo correto: orientação em detalhes, texto ou cenas em roteiro e legenda em legenda. Se houver chamada para ação, mantenha-a dentro do roteiro ou da legenda correspondente. Referências permanecem no documento do plano e não precisam virar um campo da tarefa. Não resuma nem reescreva o conteúdo.
Use somente estes tipos: arte, carrossel, video, reels, story, post ou outro.
Use somente estes canais quando estiverem explícitos: Instagram, Facebook, LinkedIn, TikTok, YouTube, Site, Google Meu Negócio ou Outro.
data_entrega é o prazo de criação ou produção e só deve ser preenchida quando esse prazo estiver explícito. data_postagem é a data de publicar ou postar. Quando o material tiver uma data principal explícita, como uma data de evento, promoção ou campanha, use-a como sugestão de data_postagem para revisão. Converta datas como 05/09/2026 ou 5 de setembro para AAAA-MM-DD usando o ano do período informado.
Responda somente JSON válido, sem explicação e sem bloco Markdown.
Informe em "mes_referencia" o mês de uso do material em AAAA-MM-01 quando estiver explícito no plano. Não use o prazo de produção para escolher esse mês. Se não houver mês, deixe vazio para revisão.
Copie em "numero" o número explícito do material, como 01 em "VÍDEO 01". Quando não houver número, deixe vazio.
Em "descricao", escreva somente o assunto específico do material. Não repita cliente, nome do planejamento, tipo nem número.
Responda no formato:
{"materiais":[{"tipo":"video","numero":"01","descricao":"Título sem repetir Video 01","detalhes":"Orientações para produção","roteiro":"Roteiro ou texto","legenda":"Legenda incluindo a chamada quando houver","canais":["Instagram"],"data_entrega":"","data_postagem":"","mes_referencia":""}]}`;
      const userPrompt = `Cliente: ${client?.empresa || client?.name || 'Não informado'}
Planejamento: ${project?.name || 'Não informado'}
Período: ${projectPeriodLabel(project)} (início: ${project?.mes_referencia}; fim: ${project?.mes_fim || project?.mes_referencia})
Itens que já existem e não devem ser repetidos: ${existingTitles.length ? existingTitles.join(' | ') : 'Nenhum'}

PLANO DO PERÍODO:
${planText}`;
      const { data, error: aiError } = await supabase.functions.invoke('openai-chat', {
        body: { messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], model: 'gpt-4o', stream: false, temperature: 0.1, max_tokens: 6000 },
      });
      if (aiError) throw aiError;
      const materials = parseSuggestedPlanMaterials(data?.content ?? data, planRef.current.materiais, { referencePeriod: project?.mes_referencia });
      if (!materials.length) {
        toast({ title: 'Nenhum item novo foi encontrado.', description: 'O plano pode já estar coberto pelos itens existentes.' });
        return;
      }
      setMaterialSuggestion(materials);
    } catch (err) {
      toast({ title: 'Não foi possível preparar os itens', description: err.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setExtractingMaterials(false);
    }
  };
  const linkExisting = async () => {
    if (!existingTaskId || !linkId || !await save()) return;
    setBusyMaterial(linkId);
    try {
      const { error: err } = await supabase.rpc('link_task_to_plan_material', { p_project_id: project.id, p_material_id: String(linkId), p_task_id: existingTaskId });
      if (err) throw err;
      await loadTasks(); setLinkId(null); setExistingTaskId('');
      toast({ title: 'Tarefa vinculada. Fluxo e responsáveis preservados.' });
    } catch (err) { toast({ title: 'Não foi possível vincular', description: err.message, variant: 'destructive' }); }
    finally { setBusyMaterial(null); }
  };
  const openReuse = async () => {
    setReuseOpen(true);
    const { data, error: err } = await supabase.from('projetos').select('id,name,mes_referencia,campaign_plans(*)').eq('client_id', project.client_id).neq('id', project.id).order('mes_referencia', { ascending: false });
    if (err) toast({ title: 'Erro ao buscar planejamentos', description: err.message, variant: 'destructive' });
    else setSources((data || []).filter((p) => Array.isArray(p.campaign_plans) ? p.campaign_plans.length : p.campaign_plans));
  };
  const planDocumentText = richTextToPlainText(plan?.contexto_ia || '').replace(/\s+/g, ' ').trim();
  const hasPlanDocument = richTextHasContent(plan?.contexto_ia);
  const planExcerpt = planDocumentText.length > 320 ? `${planDocumentText.slice(0, 320).trim()}…` : planDocumentText;
  const linkedMaterialCount = (plan?.materiais || []).filter((material) => tasks.some((task) => String(task.plan_material_id) === String(material.id))).length;
  const months = projectMonths(project);
  const isMultipleMonths = months.length > 1;
  const monthOf = (material) => materialReferenceMonth(material, project, materialTask(material.id));
  const visibleMaterials = (plan?.materiais || []).filter((material) => materialMonth === 'all' || monthOf(material) === materialMonth)
    .slice().sort((a, b) => monthOf(a).localeCompare(monthOf(b)));
  const monthProgress = (month) => {
    const materials = (plan?.materiais || []).filter((material) => monthOf(material) === month);
    const completed = materials.filter((material) => isTerminalTaskStatus(materialTask(material.id)?.status, assignmentConfig.statuses)).length;
    return { total: materials.length, completed };
  };
  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" aria-label="Carregando planejamento" /></div>;
  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 text-red-900 p-3 text-sm">{error}<Button variant="outline" size="sm" className="ml-3" onClick={save}>Tentar salvar novamente</Button></div>}
    {recoveredDraft && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center gap-3 text-sm text-amber-950">Há um rascunho não salvo neste navegador.<Button size="sm" onClick={() => { change({ ...normalizeProjectPlan(recoveredDraft), id: planRef.current?.id, updated_at: versionRef.current }); setRecoveredDraft(null); }}>Recuperar rascunho</Button><Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem(draftKey); setRecoveredDraft(null); }}>Manter versão salva</Button></div>}
    {plan && <>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Resumo do planejamento">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"><FileText className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{isMultipleMonths ? 'Plano do período' : 'Plano do mês'}</h2><span className="text-xs text-muted-foreground">{projectPeriodLabel(project)}</span><AutomationHelp label="Como funciona o plano mensal">O documento guarda a estratégia do período. Cada material pertence a um mês e tem seu próprio prazo de produção. Abra para visualizar ou editar; os materiais continuam disponíveis logo abaixo.</AutomationHelp>{hasPlanDocument && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">Documento criado</span>}</div>
              {hasPlanDocument ? <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground line-clamp-3">{planExcerpt}</p> : <p className="mt-2 text-sm text-muted-foreground">Nenhum documento foi escrito para este período.</p>}
              <p className="mt-3 text-xs text-muted-foreground">{plan.materiais.length} {plan.materiais.length === 1 ? 'material definido' : 'materiais definidos'} · {linkedMaterialCount} em Tarefas{saving ? ' · Salvando…' : dirty ? ' · Alterações pendentes' : ''}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={openReuse}><Copy className="mr-2 h-4 w-4" />Reaproveitar</Button>
            {hasPlanDocument ? <><Button type="button" variant="outline" size="sm" onClick={() => setPlanDialogMode('view')}><Eye className="mr-2 h-4 w-4" />Visualizar plano</Button><Button type="button" size="sm" onClick={() => setPlanDialogMode('edit')}><Pencil className="mr-2 h-4 w-4" />Editar plano</Button></> : <Button type="button" size="sm" onClick={() => setPlanDialogMode('edit')}><Plus className="mr-2 h-4 w-4" />Criar plano</Button>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-muted/20 shadow-sm" aria-label="O que será produzido">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-card/80 p-5">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"><FileText className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><h3 className="text-lg font-semibold">O que será produzido</h3><AutomationHelp>Este é o atalho entre o plano e Tarefas. Prepare texto, datas, canais e o primeiro passo; a tarefa só nasce quando você enviar para A Fazer.</AutomationHelp></div><p className="mt-0.5 text-sm text-muted-foreground">{plan.materiais.length} {plan.materiais.length === 1 ? 'material' : 'materiais'} · {tasks.filter((task) => task.plan_material_id && plan.materiais.some((material) => String(material.id) === String(task.plan_material_id))).length} em Tarefas</p></div></div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={extractingMaterials} onClick={askAiToExtractMaterials}>{extractingMaterials ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{extractingMaterials ? 'Lendo o plano…' : 'Ler plano com IA'}</Button><Button type="button" onClick={() => addMaterial()}><Plus className="mr-2 h-4 w-4" />Novo material</Button></div>
        </div>
        <div className="p-3 sm:p-4">
          {isMultipleMonths && <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Materiais por mês"><Button type="button" size="sm" variant={materialMonth === 'all' ? 'secondary' : 'outline'} aria-pressed={materialMonth === 'all'} className="h-8 rounded-full" onClick={() => setMaterialMonth('all')}>Todos</Button>{months.map((month) => { const progress = monthProgress(month); return <Button type="button" key={month} size="sm" variant={materialMonth === month ? 'secondary' : 'outline'} aria-pressed={materialMonth === month} className="h-8 rounded-full" onClick={() => setMaterialMonth(month)}>{formatProjectMonth(month)} · {progress.total ? `${progress.completed}/${progress.total} concluídos` : 'A definir'}</Button>; })}</div>}
          {isMultipleMonths && materialMonth !== 'all' && !visibleMaterials.length && <p className="mb-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum material definido para {formatProjectMonth(materialMonth)}. “Novo material” adiciona diretamente neste mês.</p>}
          {!plan.materiais.length && <div className="rounded-2xl border border-dashed bg-background/60 p-10 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Plus className="h-5 w-5 text-muted-foreground" /></div><p className="font-medium">Nenhum material preparado</p><p className="mt-1 text-sm text-muted-foreground">Adicione manualmente ou use a IA para ler o plano acima.</p></div>}
          {!!plan.materiais.length && <div className="hidden grid-cols-[minmax(0,1fr)_140px_140px_150px_180px_40px] gap-3 px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid"><span>Material</span><span>Criação</span><span>Postagem</span><span>Canais</span><span>Primeiro passo</span><span /></div>}
          <div className="divide-y overflow-hidden rounded-xl border bg-background">{visibleMaterials.map((material, materialIndex) => {
            const task = materialTask(material.id);
            const typeKey = material.tipo || 'outro';
            const look = materialLooks[typeKey] || materialLooks.outro;
            const TypeIcon = look.icon;
            const compatible = assignmentConfig.templates.filter((template) => (template.task_types || []).includes(planMaterialTaskType(material)));
            const selectedTemplate = assignmentConfig.templates.find((template) => template.id === (task?.workflow_template_id || material.workflow_template_id)) || compatible[0] || null;
            const stages = Array.isArray(selectedTemplate?.stages) ? selectedTemplate.stages : [];
            const stage = task ? stages.find((item) => item.key === task.workflow_stage_key) : null;
            const statusLabel = task ? (stage?.label || 'Em Tarefas') : 'Rascunho';
            const expanded = expandedMaterialId === material.id;
            const title = task?.title || planMaterialTaskTitle(client?.empresa || client?.name, material, plan.materiais);
            return <React.Fragment key={material.id}>{isMultipleMonths && (materialIndex === 0 || monthOf(visibleMaterials[materialIndex - 1]) !== monthOf(material)) && <div className="bg-muted/50 px-4 py-2 text-xs font-semibold">{formatProjectMonth(monthOf(material))}{!months.includes(monthOf(material)) && <span className="ml-2 text-amber-700 dark:text-amber-300">Fora do período · confira a postagem</span>}</div>}<article className="group relative bg-background transition-colors hover:bg-muted/20">
              <div className={`absolute inset-y-0 left-0 w-1 ${look.className}`} />
              <div className="grid gap-3 p-3 pl-4 sm:p-4 sm:pl-5 lg:grid-cols-[minmax(0,1fr)_140px_140px_150px_180px_40px] lg:items-center">
                <button type="button" className="min-w-0 text-left" aria-expanded={expanded} aria-label={`${expanded ? 'Recolher' : 'Ver detalhes'}: ${title}`} onClick={() => setExpandedMaterialId(expanded ? null : material.id)}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${look.soft}`}><TypeIcon className="h-3.5 w-3.5" />{types[typeKey] || 'Outro'} {material.numero || planMaterialSequenceNumber(plan.materiais, material)}</span>
                    <div className="min-w-0"><h4 className="truncate text-sm font-semibold sm:text-base">{title}</h4><div className="mt-1 flex items-center gap-2"><span className={`inline-flex items-center gap-1 text-xs font-medium ${task ? 'text-violet-700 dark:text-violet-200' : 'text-muted-foreground'}`}>{task && <Route className="h-3.5 w-3.5" />}{statusLabel}</span>{!!material.canais?.length && <span className="truncate text-xs text-muted-foreground">· {material.canais.join(', ')}</span>}</div></div>
                  </div>
                </button>
                <div aria-label="Atalho da data de criação"><PlanDateShortcut label="Criar" value={task ? (task.due_date || '') : material.data_entrega} onChange={(value) => void updateMaterialDate(material, 'data_entrega', value)} /></div>
                <div aria-label="Atalho da data de postagem"><PlanDateShortcut label="Postar" value={task ? (task.post_date || '') : material.data_postagem} onChange={(value) => void updateMaterialDate(material, 'data_postagem', value)} /></div>
                <PlanChannelShortcut material={material} task={task} onChange={(canais) => updateMaterial(material.id, 'canais', canais)} />
                <PlanPreparationShortcut material={material} task={task} template={selectedTemplate} functions={assignmentConfig.functions} onChange={(values) => patchMaterial(material.id, values)} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 shrink-0 lg:static" aria-expanded={expanded} aria-label={`${expanded ? 'Recolher' : 'Ver detalhes'}: ${title}`} onClick={() => setExpandedMaterialId(expanded ? null : material.id)}><ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} /></Button>
              </div>
              {expanded && <div className="space-y-4 border-t bg-muted/10 px-4 py-5 sm:px-5">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_90px]">
                  <div className="space-y-1.5"><Label>Título do material</Label><Input aria-label={`Título do material: ${title}`} value={material.descricao || ''} onChange={(event) => updateMaterial(material.id, 'descricao', event.target.value)} placeholder="Ex.: Pinterest" /></div>
                  <div className="space-y-1.5"><Label>Tipo</Label><Select value={material.tipo || 'outro'} disabled={Boolean(task)} onValueChange={(value) => patchMaterial(material.id, { tipo: value, formato: types[value], script_status: 'not_started' })}><SelectTrigger aria-label={`Tipo do material: ${title}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(types).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Número</Label><Input aria-label={`Número do material: ${title}`} inputMode="numeric" maxLength={4} disabled={Boolean(task)} value={material.numero || planMaterialSequenceNumber(plan.materiais, material)} onChange={(event) => updateMaterial(material.id, 'numero', event.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => updateMaterial(material.id, 'numero', normalizePlanMaterialNumber(material.numero) || planMaterialSequenceNumber(plan.materiais, material))} /></div>
                </div>
                <div className="max-w-xs"><MaterialMonthSelect material={material} project={project} task={task} label={`Mês do conteúdo: ${title}`} onChange={(mes_referencia) => updateMaterial(material.id, 'mes_referencia', mes_referencia)} /></div>
                <div><div className="mb-3 flex items-center gap-2"><h5 className="text-sm font-semibold">Informações para produção</h5><AutomationHelp>O texto preenchido seguirá para a tarefa. Datas, canais e primeiro passo já podem ser alterados pelos atalhos da linha acima.</AutomationHelp></div><CompactMaterialContentEditor material={material} onChange={(values) => patchMaterial(material.id, values)} /></div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex flex-wrap gap-2"><PlanWorkflowShortcut material={material} task={task} profiles={assignmentConfig.profiles} functions={assignmentConfig.functions} templates={assignmentConfig.templates} loading={assignmentConfig.loading} error={assignmentConfig.error} onChange={(value) => updateMaterial(material.id, 'workflow_template_id', value)} /></div>
                  <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDeleteId(material.id)}><Trash2 className="mr-1.5 h-4 w-4" />Remover</Button>{!task && tasks.some((item) => !item.plan_material_id) && <Button variant="outline" size="sm" onClick={() => { setLinkId(material.id); setExistingTaskId(''); }}><Link2 className="mr-1.5 h-4 w-4" />Vincular tarefa</Button>}{task ? <Button asChild size="sm"><Link to={taskRoute(task)} onClick={async (event) => { event.preventDefault(); if (await save()) window.location.hash = `#${taskRoute(task)}`; }}>Abrir tarefa<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button> : <Button size="sm" disabled={busyMaterial === material.id || !material.descricao?.trim()} onClick={() => createTask(material)}>{busyMaterial === material.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar para A Fazer'}</Button>}</div>
                </div>
              </div>}
            </article></React.Fragment>;
          })}</div>
        </div>
      </section>
    </>}
    <Dialog open={Boolean(planDialogMode)} onOpenChange={(open) => { if (open) return; if (planDialogMode === 'edit' && dirty) { void save().then((ok) => { if (ok) setPlanDialogMode(null); }); } else setPlanDialogMode(null); }}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-6 py-5">
          <DialogTitle>{planDialogMode === 'view' ? 'Visualizar plano' : hasPlanDocument ? 'Editar plano' : 'Criar plano'}</DialogTitle>
          <DialogDescription>{planDialogMode === 'view' ? 'Visualização do documento usado para orientar os materiais deste período.' : 'Escreva e formate o documento. As alterações são salvas automaticamente.'}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {planDialogMode === 'view' && <PlanDocumentPreview value={plan?.contexto_ia || ''} />}
          {planDialogMode === 'edit' && <div className="space-y-5">
            <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => { setAiPrompt('Ajude a organizar e melhorar o texto do Plano do mês sem apagar informações importantes. Mostre a sugestão para minha revisão antes de aplicar.'); setAiOpen(true); }}><Sparkles className="mr-2 h-4 w-4" />Ajudar a escrever</Button></div>
            <PlanRichTextEditor ariaLabel="Plano do mês" value={plan?.contexto_ia || ''} onChange={(html) => setField('contexto_ia', html)} placeholder={'Escreva aqui como escreveria em um documento.\n\nExemplo: objetivo do mês, campanha principal, vídeos, artes, ofertas e datas importantes.'} />
            <details className="rounded-xl border bg-card p-5">
              <summary className="cursor-pointer font-medium">Informações estruturadas do plano <span className="font-normal text-muted-foreground">(opcional)</span></summary>
              <div className="mt-5 space-y-5">
                <Field label="Objetivo do período" value={plan?.objetivo} onChange={(v) => setField('objetivo', v)} placeholder="O que queremos alcançar?" />
                <Field label="Direção da comunicação" value={plan?.estrategia_comunicacao?.mensagem_principal} onChange={(v) => setNested('estrategia_comunicacao', 'mensagem_principal', v)} placeholder="Mensagem principal e direção dos conteúdos." />
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Tom de voz" value={plan?.estrategia_comunicacao?.tom_voz} onChange={(v) => setNested('estrategia_comunicacao', 'tom_voz', v)} /><Field label="Orientações criativas" value={plan?.estrategia_comunicacao?.gatilhos} onChange={(v) => setNested('estrategia_comunicacao', 'gatilhos', v)} /></div>
                <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">Ações e campanhas</h3><Button size="sm" variant="outline" onClick={() => setNested('conteudo_criativos', 'fases', [...(plan?.conteudo_criativos?.fases || []), { id: crypto.randomUUID(), nome: '', descricao: '' }])}><Plus className="mr-2 h-4 w-4" />Adicionar ação</Button></div>
                  {(plan?.conteudo_criativos?.fases || []).map((action, i) => <div key={action.id || i} className="space-y-2 rounded-lg border p-3"><div className="flex gap-2"><Input aria-label={`Nome da ação ${i + 1}`} placeholder="Nome da ação ou campanha" value={action.nome || ''} onChange={(e) => setNested('conteudo_criativos', 'fases', plan.conteudo_criativos.fases.map((a, n) => n === i ? { ...a, nome: e.target.value } : a))} /><Button variant="ghost" size="icon" aria-label={`Remover ação ${i + 1}`} onClick={() => setNested('conteudo_criativos', 'fases', plan.conteudo_criativos.fases.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button></div><Textarea aria-label={`Descrição da ação ${i + 1}`} placeholder="O que vamos fazer e por quê?" value={action.descricao || ''} onChange={(e) => setNested('conteudo_criativos', 'fases', plan.conteudo_criativos.fases.map((a, n) => n === i ? { ...a, descricao: e.target.value } : a))} /></div>)}
                </div>
                <details className="rounded-lg border p-4" open={Boolean(plan?.trafego_pago?.objetivo || plan?.trafego_pago?.publico || plan?.trafego_pago?.acoes)}><summary className="cursor-pointer font-medium">Ações de tráfego</summary><div className="mt-4 space-y-4"><Field label="Objetivo das ações de tráfego" value={plan?.trafego_pago?.objetivo} onChange={(v) => setNested('trafego_pago', 'objetivo', v)} /><Field label="Público e abordagem" value={plan?.trafego_pago?.publico} onChange={(v) => setNested('trafego_pago', 'publico', v)} /><Field label="Ações e distribuição da verba" value={plan?.trafego_pago?.acoes} onChange={(v) => setNested('trafego_pago', 'acoes', v)} /><AutomationHelp label="Onde ajustar verba e metas">A verba e as metas do mês ficam na ficha do cliente.</AutomationHelp></div></details>
              </div>
            </details>
          </div>}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4 sm:items-center sm:justify-between">
          <span role="status" className="text-xs text-muted-foreground">{saving ? 'Salvando…' : error ? 'Não salvo' : dirty ? 'Alterações pendentes' : hasPlanDocument ? 'Plano salvo' : 'Documento vazio'}</span>
          {planDialogMode === 'view' ? <div className="flex gap-2"><Button variant="outline" onClick={() => setPlanDialogMode(null)}>Fechar</Button><Button onClick={() => setPlanDialogMode('edit')}><Pencil className="mr-2 h-4 w-4" />Editar plano</Button></div> : <Button disabled={saving} onClick={async () => { if (await save()) setPlanDialogMode(null); }}><Save className="mr-2 h-4 w-4" />Salvar e fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}><DialogContent><DialogHeader><DialogTitle>Remover este item do planejamento?</DialogTitle><DialogDescription>{deleteTask ? `O item deixará de aparecer em “O que será produzido”. A tarefa “${deleteTask.title}” continuará em Tarefas com seu histórico e suas automações.` : 'O item será removido de “O que será produzido”.'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button><Button variant="destructive" disabled={Boolean(busyMaterial)} onClick={removeMaterial}>{busyMaterial ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Remover do plano</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(linkId)} onOpenChange={(o) => !o && setLinkId(null)}><DialogContent><DialogHeader><DialogTitle>Vincular tarefa existente</DialogTitle><DialogDescription>Escolha uma tarefa deste projeto. Seu conteúdo, responsáveis e fluxo serão preservados.</DialogDescription></DialogHeader><Select value={existingTaskId} onValueChange={setExistingTaskId}><SelectTrigger aria-label="Tarefa existente"><SelectValue placeholder="Escolha a tarefa" /></SelectTrigger><SelectContent>{tasks.filter((t) => !t.plan_material_id).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent></Select><DialogFooter><Button disabled={!existingTaskId || Boolean(busyMaterial)} onClick={linkExisting}>Vincular tarefa</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={reuseOpen} onOpenChange={setReuseOpen}><DialogContent><DialogHeader><DialogTitle>Reaproveitar planejamento do cliente</DialogTitle><DialogDescription>Copia textos e materiais para este projeto, com novas identificações e sem repetir datas, responsáveis ou tarefas.</DialogDescription></DialogHeader><Select value={sourceId} onValueChange={setSourceId}><SelectTrigger aria-label="Planejamento de origem"><SelectValue placeholder="Escolha um planejamento" /></SelectTrigger><SelectContent>{sources.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{!sources.length && <p className="text-sm text-muted-foreground">Nenhum outro planejamento deste cliente disponível.</p>}<DialogFooter><Button variant="outline" onClick={() => setReuseOpen(false)}>Cancelar</Button><Button disabled={!sourceId} onClick={() => { const p = sources.find((s) => s.id === sourceId); const source = Array.isArray(p?.campaign_plans) ? p.campaign_plans[0] : p?.campaign_plans; if (source) { const reused = reuseProjectPlan(source, project.id); change({ ...reused, materiais: reused.materiais.map((material) => ({ ...material, mes_referencia: `${projectPeriod(project).start}-01` })) }); setReuseOpen(false); } }}>Usar como base</Button></DialogFooter></DialogContent></Dialog>
    {aiOpen && plan && <AiChatDialog open={aiOpen} onOpenChange={setAiOpen} project={project} client={client} plan={plan} initialPrompt={aiPrompt} onPlanUpdate={(updates) => { setSuggestion(updates); setAiOpen(false); }} />}
    <Dialog open={Boolean(materialSuggestion)} onOpenChange={(open) => !open && setMaterialSuggestion(null)}><DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 border-b bg-muted/20 px-6 py-5"><DialogTitle>{materialSuggestion?.length || 0} {materialSuggestion?.length === 1 ? 'material encontrado' : 'materiais encontrados'}</DialogTitle><DialogDescription>Confira o resumo. Abra somente o material que precisar corrigir. Ao adicionar, eles ficam como rascunhos do plano; nenhuma tarefa é criada.</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><MaterialSuggestionPreview project={project} materials={materialSuggestion || []} clientName={client?.empresa || client?.name} onChange={(index, values) => setMaterialSuggestion((currentMaterials) => (currentMaterials || []).map((material, currentIndex) => currentIndex === index ? { ...material, ...values } : material))} onRemove={(index) => setMaterialSuggestion((currentMaterials) => (currentMaterials || []).filter((_, currentIndex) => currentIndex !== index))} /></div><DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4"><Button variant="outline" onClick={() => setMaterialSuggestion(null)}>Cancelar</Button><Button disabled={!materialSuggestion?.length} onClick={() => { const count = materialSuggestion?.length || 0; change(applyProjectPlanSuggestion(planRef.current, { materiais: materialSuggestion || [] })); setMaterialSuggestion(null); toast({ title: `${count} ${count === 1 ? 'material adicionado' : 'materiais adicionados'}.`, description: 'Eles ficaram como rascunho em “O que será produzido”. Envie para A Fazer somente quando estiverem prontos.' }); }}>{`Adicionar ${materialSuggestion?.length || 0} ao plano`}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(suggestion)} onOpenChange={(o) => !o && setSuggestion(null)}><DialogContent className="max-w-3xl max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>Conferir sugestão da IA</DialogTitle><DialogDescription>Confira antes de aplicar. Os materiais existentes serão preservados; novos materiais sugeridos serão adicionados ao plano.</DialogDescription></DialogHeader><SuggestionContent value={suggestion} /><DialogFooter><Button variant="outline" onClick={() => setSuggestion(null)}>Descartar</Button><Button onClick={() => { change(applyProjectPlanSuggestion(planRef.current, suggestion)); setSuggestion(null); }}>Aplicar sugestão</Button></DialogFooter></DialogContent></Dialog>
  </div>;
});
export default ProjectPlanningWorkspace;
