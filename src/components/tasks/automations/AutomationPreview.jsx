import React, { useState } from 'react';
import { checkTrigger, normalizeAutomationRow } from '@/lib/workflow';
import { actionConfigurationIssues } from '@/lib/operationalWorkflow';
import AutomationHelp from './AutomationHelp';

export default function AutomationPreview({ automations, functions, profiles, statusOptions, describeAction }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const matching = from && to && from !== to ? automations.map(normalizeAutomationRow).filter((row) => row.is_active && row.trigger_type === 'status_change' && checkTrigger(row, { old_status: from, new_status: to })) : [];
  const actions = matching.flatMap((row) => row.actions);
  const issues = actionConfigurationIssues(actions, { functions, profiles, statusOptions });
  const ownerRules = matching.filter((row) => row.actions.some((action) => ['set_assignee', 'remove_assignee', 'reassign_previous', 'assign_function', 'reassign_producer'].includes(action.type)));
  if (ownerRules.length > 1) issues.push('Mais de uma regra altera responsáveis nesta passagem. Confira todas antes de ativar uma nova regra.');
  if (matching.some((row) => row.actions.some((a) => a.type === 'reassign_previous') && row.actions.some((a) => a.type === 'remove_assignee' && !a.config?.assignee_ids?.length))) issues.push('Nesta configuração antiga, remover todos impede a ação “responsável anterior” da mesma regra.');
  return <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5" aria-label="Conferir passagem">
    <h3 className="font-semibold flex items-center gap-2">Conferir passagem<AutomationHelp label="Sobre a conferência">Esta consulta não altera tarefas. Todas as regras ativas que combinam com a passagem aparecem aqui. Regras que se sobrepõem podem alterar o mesmo destino; a consulta mostra as ações, sem presumir um único responsável final. O retorno ao produtor depende do registro de cada tarefa.</AutomationHelp></h3>
    <div className="grid grid-cols-2 gap-3">{[['De', from, setFrom], ['Para', to, setTo]].map(([label, value, setter]) => <label key={label} className="text-sm">{label}<select aria-label={`${label} na conferência`} value={value} onChange={(e) => setter(e.target.value)} className="mt-1 block w-full rounded-lg border border-border/80 bg-background p-2">
      <option value="">Selecione a etapa</option>{statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select></label>)}</div>
    {from && to && <>
      <p className="text-sm text-muted-foreground">{from === to ? 'Selecione etapas diferentes.' : matching.length ? `${matching.length} regra(s) ativa(s) nesta passagem.` : 'Nenhuma regra ativa nesta passagem.'}</p>
      {matching.map((row) => <div key={row.id} className="rounded bg-muted/50 p-3"><p className="text-sm font-semibold">{row.name}</p><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{row.actions.map((action, i) => <li key={i}>{describeAction(action)}</li>)}</ul></div>)}
      {issues.length > 0 && <ul role="status" className="space-y-1 text-sm text-amber-800 dark:text-amber-300">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </>}
  </section>;
}
