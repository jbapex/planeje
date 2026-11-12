import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Eye, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PROJECT_STAGES } from '@/lib/projectsMonthlyOverview';
import { CONTA_SERVICOS } from '@/lib/projectPlanningWorkflow';
import './ProjectsMonthlyKanban.css';
import ProjectDeadlineLabel from './ProjectDeadlineLabel';
import { projectPeriodLabel } from '@/lib/projectPeriod';

const STAGE_COLORS = { a_fazer: '#64748b', planejamento: '#2563eb', aprovacao: '#7c3aed', execucao: '#ea580c', concluido: '#059669', pausado: '#64748b' };
const DRAG_TYPE = 'application/x-planeje-project';

export function ProjectClientMark({ client, className = 'h-8 w-8' }) {
  const logo = Array.isArray(client?.logo_urls) ? client.logo_urls.find(Boolean) : '';
  const initials = String(client?.empresa || '?').trim().slice(0, 2).toUpperCase();
  return (
    <Avatar className={`${className} shrink-0 rounded-lg`}>
      <AvatarImage src={logo || undefined} alt="" className="object-cover" />
      <AvatarFallback className="rounded-lg text-[10px] font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

function ProjectCardMenu({ project, client, stage, pending, hasDocument, savingId, onOpenProject, onUpdateProjectStatus, onDismissPlan, onDeleteProject, onMarkConta, moveProject }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Ações do projeto ${project.name} · ${client?.empresa || ''}`} className="absolute right-1 top-1 h-7 w-7 rounded-lg text-muted-foreground" disabled={Boolean(savingId)}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[210px]">
        {!pending && <DropdownMenuItem onSelect={() => onOpenProject(project.id)}><ArrowUpRight className="mr-2 h-4 w-4" />Abrir projeto</DropdownMenuItem>}
        {!pending && <DropdownMenuItem onSelect={() => onOpenProject(project.id, hasDocument ? 'view' : 'edit')}><Eye className="mr-2 h-4 w-4" />{hasDocument ? 'Ver plano' : 'Montar plano'}</DropdownMenuItem>}
        {onMarkConta && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">Conta</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={CONTA_SERVICOS.some((item) => item.value === client?.tipo_servico) ? client.tipo_servico : ''} onValueChange={(value) => onMarkConta(client.id, value)}>
            {CONTA_SERVICOS.map((item) => <DropdownMenuRadioItem key={item.value} value={item.value}>{item.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></>}
        {onUpdateProjectStatus && !pending && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">Mover para</DropdownMenuLabel><DropdownMenuRadioGroup value={stage} onValueChange={(nextStage) => void moveProject(project.id, nextStage)}>{PROJECT_STAGES.map((item) => <DropdownMenuRadioItem key={item.key} value={item.key}>{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></>}
        <DropdownMenuSeparator />
        {pending
          ? <DropdownMenuItem onSelect={() => onDismissPlan?.(client.id, project.mes_referencia)}><Trash2 className="mr-2 h-4 w-4" />Tirar deste mês</DropdownMenuItem>
          : <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => onDeleteProject?.(project)}><Trash2 className="mr-2 h-4 w-4" />Excluir projeto</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ProjectsMonthlyKanban({ rows, analysisFooterRef, statusOptions, startingClient, onStartProject, onDefineDates, focusStage, selectedStage, onSelectStage, onOpenProject, onUpdateProjectStatus, onDismissPlan, onDeleteProject, onMarkConta }) {
  const [draggedId, setDraggedId] = useState(null);
  const [dropStage, setDropStage] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [boardHeight, setBoardHeight] = useState(520);
  const savingRef = useRef(false);
  const boardRef = useRef(null);
  const stages = [...PROJECT_STAGES];
  if (rows.some((row) => !PROJECT_STAGES.some((stage) => stage.key === row.stage))) stages.push({ key: 'other', label: 'Outras etapas' });

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const main = board.closest('main');
    const footer = analysisFooterRef?.current;
    const resize = () => {
      const availableBottom = Math.min(window.innerHeight, main?.getBoundingClientRect().bottom ?? window.innerHeight);
      const footerSpace = footer ? footer.getBoundingClientRect().height + (parseFloat(window.getComputedStyle(footer).marginTop) || 0) : 8;
      setBoardHeight(Math.max(300, Math.floor(availableBottom - board.getBoundingClientRect().top - footerSpace)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(board.parentElement);
    if (main) observer.observe(main);
    if (footer) observer.observe(footer);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [selectedStage, analysisFooterRef]);
  useEffect(() => {
    const board = boardRef.current;
    const key = PROJECT_STAGES.some((stage) => stage.key === focusStage) ? focusStage : 'other';
    const column = focusStage && Array.from(board?.firstElementChild?.children || []).find((item) => item.dataset.stage === key);
    if (board) board.scrollTo({ left: column ? column.getBoundingClientRect().left - board.getBoundingClientRect().left + board.scrollLeft : 0 });
  }, [focusStage]);

  const moveProject = async (id, stage) => {
    const row = rows.find((item) => item.project.id === id);
    if (!row || row.stage === stage || savingRef.current || !onUpdateProjectStatus || !PROJECT_STAGES.some((item) => item.key === stage)) return;
    savingRef.current = true;
    setSavingId(id);
    try { await onUpdateProjectStatus(id, stage); }
    finally { savingRef.current = false; setSavingId(null); }
  };
  const endDrag = () => { setDraggedId(null); setDropStage(null); };

  return <div className="projects-monthly-kanban min-w-0" aria-label="Kanban dos projetos do mês">
    <div ref={boardRef} style={{ height: boardHeight }} className="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1" tabIndex={0} aria-label="Etapas dos projetos">
      <div className="flex h-full gap-6">
        {stages.map(({ key, label }) => {
          const columnRows = rows.filter((row) => key === 'other' ? !PROJECT_STAGES.some((stage) => stage.key === row.stage) : row.stage === key);
          const canDrop = key !== 'other' && draggedId && !savingId;
          return <section key={key} data-stage={key} aria-label={`${label}: ${columnRows.length} projetos`}
            className={`projects-kanban-col flex h-full w-80 min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border transition-colors ${dropStage === key ? 'is-drag-over ring-1 ring-primary/20' : ''}`}
            onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropStage(key); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropStage(null); }}
            onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData(DRAG_TYPE); if (canDrop && id === draggedId) void moveProject(id, key); endDrag(); }}>
            <button type="button" disabled={key === 'other'} aria-label={`Filtrar etapa ${label}`} aria-pressed={selectedStage === key} onClick={() => onSelectStage?.(key)}
              style={{ '--status-color': STAGE_COLORS[key] || '#64748b', backgroundColor: STAGE_COLORS[key] || '#64748b' }}
              className={`projects-kanban-col-header flex min-h-[44px] w-full shrink-0 items-center gap-2 px-3 py-2.5 text-left text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 ${selectedStage === key ? 'ring-2 ring-inset ring-white/50' : ''}`}>
              <h3 className="min-w-0 flex-1 text-sm font-medium">{label}</h3>
              <span className="projects-kanban-count rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-medium tabular-nums">{columnRows.length}</span>
            </button>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-2" tabIndex={0} aria-label={`Projetos em ${label}`}>
              {columnRows.length === 0 && <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground/60"><FolderOpen className="h-5 w-5" aria-hidden="true" /><p className="text-xs">Nenhum projeto</p></div>}
              {columnRows.map(({ project, client, progress, hasPlan, hasStrategy, hasDocument, stage, pending, plan, tasks, ownerName }) => <article key={project.id}
                aria-label={`Projeto ${project.name} · ${client?.empresa || 'Cliente não encontrado'}`}
                aria-busy={savingId === project.id}
                draggable={!pending && Boolean(onUpdateProjectStatus) && !savingId}
                onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, project.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(project.id); }}
                onDragEnd={endDrag}
                className={`projects-kanban-card group relative rounded-xl border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md ${draggedId === project.id ? 'opacity-40' : ''} ${savingId === project.id ? 'opacity-60' : ''}`}>
                <button type="button" onClick={() => pending ? onStartProject?.(client.id, project.mes_referencia) : onOpenProject(project.id)} disabled={pending && Boolean(startingClient)} aria-label={`${pending ? 'Iniciar plano' : 'Abrir projeto'} ${project.name} · ${client?.empresa || ''}`} className="block w-full rounded-t-xl p-3 pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="flex items-start gap-2.5">
                    <ProjectClientMark client={client} />
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words text-sm font-semibold leading-snug" title={client?.empresa} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{client?.empresa || 'Cliente não encontrado'}</strong>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground" title={project.name} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{project.name}</span>
                    </span>
                  </span>
                </button>
                <ProjectCardMenu project={project} client={client} stage={stage} pending={pending} hasDocument={hasDocument} savingId={savingId} onOpenProject={onOpenProject} onUpdateProjectStatus={onUpdateProjectStatus} onDismissPlan={onDismissPlan} onDeleteProject={onDeleteProject} onMarkConta={onMarkConta} moveProject={moveProject} />
                <div className="px-3 pb-3"><p className="mb-2 text-xs text-muted-foreground">{projectPeriodLabel(project)} · {ownerName || client?.responsavel || 'Sem responsável'}</p>
                  {pending ? <span className="text-xs text-muted-foreground">Aguardando início</span> : !hasPlan ? <span className="inline-flex rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">{hasStrategy ? 'Materiais do mês a definir' : 'Sem plano'}</span> : progress.total ? <div aria-label={`${progress.completed} de ${progress.total} materiais concluídos`}>
                    <div className="mb-1.5 flex items-center justify-between gap-1 text-xs text-muted-foreground"><span>{progress.completed}/{progress.total} concluídos</span><span className="font-medium tabular-nums">{progress.percentage}%</span></div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percentage}%` }} /></div>
                  </div> : <span className="text-xs text-muted-foreground">Materiais a definir</span>}
                  <div className="mt-2"><ProjectDeadlineLabel project={project} plan={plan} tasks={tasks} statusOptions={statusOptions} compact onDefineDates={!pending ? () => onDefineDates?.(project.id) : undefined} /></div>
                </div>
                <div className="border-t px-3 py-1.5">
                  <button type="button" disabled={pending && Boolean(startingClient)} className={`flex min-h-[28px] w-full items-center justify-between gap-1 rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hasPlan ? 'text-muted-foreground hover:text-primary' : 'text-primary'}`} onClick={() => pending ? onStartProject?.(client.id, project.mes_referencia) : onOpenProject(project.id, hasDocument ? 'view' : 'edit')}>
                    <span className="flex items-center gap-1.5">{hasDocument ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{pending ? startingClient === client.id ? 'Iniciando…' : 'Iniciar plano' : hasDocument ? 'Ver plano' : hasPlan ? 'Completar plano' : 'Montar plano'}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
              </article>)}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
