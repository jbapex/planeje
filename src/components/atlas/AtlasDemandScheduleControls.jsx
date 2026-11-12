import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
export default function AtlasDemandScheduleControls({ inputs, suggestion, value, team, pending, error, onRecalculate, onSave }) {
  const [inquiry, setInquiry] = useState(inputs.settings.inquiry_days);
  const [production, setProduction] = useState(inputs.settings.production_days);
  useEffect(() => { setInquiry(inputs.settings.inquiry_days); setProduction(inputs.settings.production_days); }, [inputs.settings.revision]);
  const manualPerson = value.assignee_id !== suggestion.assignee_id;
  const manualDate = value.due_date !== suggestion.due_date;
  const workload = (inputs.workloads || []).find(p => p.person_id === value.assignee_id);
  return <div className="atlas-demand-schedule" aria-label="Sugestões de responsável e prazo">
    <details className="atlas-demand-calculation"><summary>Cálculo e regras</summary><div className="atlas-demand-calculation-body">
    <p>{manualPerson && !suggestion.workflow_controlled ? 'Responsável ajustado por você.' : suggestion.assignment_reason}</p>
    {workload && <p>Fila da pessoa: {workload.open_tasks} aberta(s) · {workload.overdue_tasks} atrasada(s) · {workload.without_due} sem prazo.</p>}
    <p>{manualDate ? 'Prazo ajustado por você.' : suggestion.date_reason}</p>
    <p className="atlas-demand-muted">Dias úteis de segunda a sexta, no fuso de São Paulo, sem feriados cadastrados. A fila orienta a escolha da pessoa; o prazo estima a duração, sem calcular horas disponíveis.</p>
    <details className="atlas-demand-rules"><summary>Editar regras de prazo</summary><div className="atlas-demand-grid"><label>Apuração (dias úteis)<input className="atlas-demand-input" type="number" min="0" max="365" value={inquiry} onChange={e => setInquiry(e.target.value)} disabled={pending} /></label><label>Produção (dias úteis)<input className="atlas-demand-input" type="number" min="0" max="365" value={production} onChange={e => setProduction(e.target.value)} disabled={pending} /></label></div><p className="atlas-demand-muted">Usadas quando não há data informada nem duração completa no fluxo. Tarefas existentes mantêm seus prazos.</p><button type="button" className="atlas-demand-button" disabled={pending || inquiry === '' || production === '' || !Number.isInteger(Number(inquiry)) || !Number.isInteger(Number(production)) || Number(inquiry) < 0 || Number(production) < 0 || Number(inquiry) > 365 || Number(production) > 365} onClick={() => onSave(Number(inquiry), Number(production))}>Salvar regras e recalcular</button></details>
    </div></details>
    <button type="button" className="atlas-demand-recalculate" disabled={pending} onClick={onRecalculate}><RefreshCw size={12} aria-hidden="true" />{pending ? 'Calculando…' : 'Recalcular'}</button>
    {suggestion.workflow_controlled && <p>Responsáveis da entrada do fluxo: {suggestion.expected_assignee_ids.map(id => team.find(p => p.id === id)?.full_name || 'Indisponível').join(', ') || 'Configuração pendente'}. O fluxo mantém essa atribuição ao criar a tarefa.</p>}
    {suggestion.warnings.map(w => <p className="atlas-demand-warning" key={w}>{w}</p>)}
    {error && <p role="alert" className="atlas-demand-error">{error}</p>}
  </div>;
}
