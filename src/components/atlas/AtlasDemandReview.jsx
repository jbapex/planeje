import React, { useRef, useState } from 'react';
import { demandRpc, loadAtlasDemandReview } from '@/lib/atlasDemands';
import { atlasTaskTitle } from '@/lib/atlasDemandPresentation';
import { calculateDemandSchedule } from '@/lib/atlasDemandSchedule';
import AtlasDemandScheduleControls from './AtlasDemandScheduleControls';
import './AtlasDemandCentral.css';

const date = value => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }) : 'A definir';
const Input = props => <input className="atlas-demand-input" {...props} />;
const Select = props => <select className="atlas-demand-input" {...props} />;
const Area = props => <textarea className="atlas-demand-input" {...props} />;
const Button = ({ primary, children, ...props }) => <button type="button" className={`atlas-demand-button ${primary ? 'is-primary' : ''}`} {...props}>{children}</button>;

export default function AtlasDemandReview({ demand, context: initialContext, busy, onApprove, onClose }) {
  const [context, setContext] = useState(initialContext);
  const [inputs, setInputs] = useState(initialContext.schedule);
  const [planningBusy, setPlanningBusy] = useState(false), [planningError, setPlanningError] = useState('');
  const planningLock = useRef(false);
  const pending = busy || planningBusy;
  const p = demand.proposal.task || {};
  const initial = { mode: p.existing_task_id ? 'link' : 'new', task_id: p.existing_task_id || '', title: atlasTaskTitle(context.client.name, p.title || demand.title), description: p.description || '', assignee_id: p.assignee_id || '', due_date: p.due_date || '', project_id: p.project_id || '', type: p.type || 'interno', confirmed: false };
  const [suggestion, setSuggestion] = useState(() => calculateDemandSchedule({ demand, context, inputs, draft: initial, providedDue: p.due_date || null }));
  const [value, setValue] = useState(() => ({ ...initial, ...(initial.mode === 'new' ? { assignee_id: suggestion.assignee_id, due_date: suggestion.due_date } : {}) }));
  const calculate = (fresh, draft, ctx = context) => {
    const next = calculateDemandSchedule({ demand, context: ctx, inputs: fresh, draft, chosenAssigneeId: draft.assignee_id !== suggestion.assignee_id ? draft.assignee_id : null, providedDue: draft.due_date !== suggestion.due_date ? draft.due_date || null : p.due_date || null });
    setSuggestion(next); setValue({ ...draft, assignee_id: next.assignee_id, due_date: next.due_date, confirmed: false });
  };
  const set = (key, text) => { if (value[key] === text) return; const next = { ...value, [key]: text }; if (key === 'type' && value.mode === 'new' || key === 'mode' && text === 'new') calculate(inputs, next); else setValue(key === 'confirmed' ? next : { ...next, confirmed: false }); };
  const reload = async (inquiry, production) => {
    if (planningLock.current) return; planningLock.current = true; setPlanningBusy(true); setPlanningError('');
    try {
      if (inquiry !== undefined) await demandRpc('atlas_demand_planning_save', { p_inquiry: inquiry, p_production: production, p_revision: inputs.settings.revision });
      const ctx = await loadAtlasDemandReview(demand);
      setInputs(ctx.schedule); setContext(ctx); calculate(ctx.schedule, value, ctx);
    } catch (error) { setPlanningError(error.message); }
    finally { planningLock.current = false; setPlanningBusy(false); }
  };
  const selected = context.tasks.find(t => t.id === value.task_id);
  const approve = e => { e.preventDefault(); if (pending || !value.confirmed || planningError) return; const title = value.mode === 'new' ? atlasTaskTitle(context.client.name, value.title) : value.title; setValue(v => ({ ...v, title })); onApprove({ ...value, title, id: demand.id, revision: demand.revision, task_hash: selected?.task_hash || null, ...(value.mode === 'new' ? { schedule_hash: inputs.basis_hash, expected_assignee_ids: suggestion.workflow_controlled ? suggestion.expected_assignee_ids : [value.assignee_id], operational_function_id: value.assignee_id === suggestion.assignee_id || suggestion.workflow_controlled ? suggestion.operational_function_id : null } : {}) }); };
  return <section className="atlas-demand-panel atlas-demand-review" aria-label="Revisar repasse"><div className="atlas-demand-header"><h3>Revisar repasse</h3><Button onClick={onClose} disabled={pending}>Voltar</Button></div><form onSubmit={approve} className="atlas-demand-form">
    <div className="atlas-demand-review-options"><label>Ação<Select value={value.mode} onChange={e => set('mode', e.target.value)} disabled={pending}><option value="new">Criar nova tarefa</option><option value="link">Vincular tarefa existente</option><option value="reassign">Transferir tarefa existente</option></Select></label>{value.mode === 'new' && <><label>Projeto<Select value={value.project_id} onChange={e => set('project_id', e.target.value)} disabled={pending}><option value="">Sem projeto</option>{context.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label><label>Tipo<Select value={value.type} onChange={e => set('type', e.target.value)} disabled={pending}>{[['interno', 'Interno / apuração'], ['paid_traffic', 'Tráfego'], ['onboarding', 'Onboarding'], ['video', 'Vídeo'], ['arte', 'Arte'], ['carrossel', 'Carrossel'], ['social_media', 'Social media'], ['post', 'Post']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label></>}</div>
    {value.mode !== 'new' && <label>Tarefa deste cliente<Select required value={value.task_id} onChange={e => set('task_id', e.target.value)} disabled={pending}><option value="">Selecione</option>{context.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></label>}
    {value.mode === 'new' && <label>Título da tarefa<Input required maxLength={180} value={value.title} onChange={e => set('title', e.target.value)} onBlur={() => set('title', atlasTaskTitle(context.client.name, value.title))} disabled={pending} /></label>}
    <label>Orientação que a equipe vai receber<Area required maxLength={8000} rows={3} value={value.description} onChange={e => set('description', e.target.value)} disabled={pending} /></label>
    <div className="atlas-demand-grid">{value.mode !== 'link' ? <label>Responsável<Select required value={value.assignee_id} onChange={e => set('assignee_id', e.target.value)} disabled={pending || suggestion.workflow_controlled}><option value="">Selecione</option>{context.team.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></label> : <p className="atlas-demand-muted">Responsáveis atuais: {(selected?.assignee_ids || []).map(id => context.team.find(p => p.id === id)?.full_name || 'Indisponível').join(', ') || 'Sem responsável'}</p>}
    {value.mode === 'new' ? <label>Prazo sugerido<Input type="date" value={value.due_date} onChange={e => set('due_date', e.target.value)} disabled={pending} /></label> : <p className="atlas-demand-muted">Prazo e fase permanecem os da tarefa: {date(selected?.due_date)} · {selected?.status || 'Selecione uma tarefa'}</p>}</div>
    {value.mode === 'new' && <AtlasDemandScheduleControls inputs={inputs} suggestion={suggestion} value={value} team={inputs.team || context.team} pending={pending} error={planningError} onRecalculate={() => reload()} onSave={reload} />}

    <div className="atlas-demand-review-footer"><label className="atlas-demand-check"><input type="checkbox" checked={value.confirmed} onChange={e => set('confirmed', e.target.checked)} disabled={pending} required />Revisei o contexto e autorizo este repasse para a equipe.</label>
    <button type="submit" className="atlas-demand-button is-primary" disabled={pending || !value.confirmed || Boolean(planningError) || (value.mode === 'new' && suggestion.workflow_controlled && !suggestion.expected_assignee_ids.length)}>Aprovar e encaminhar</button></div>
  </form></section>;
}

