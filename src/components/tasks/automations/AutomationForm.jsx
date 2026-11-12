import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { actionConfigurationIssues, activeStaff, uniqueIds } from '@/lib/operationalWorkflow';
import AutomationHelp from '@/components/tasks/automations/AutomationHelp';
import { X, ArrowLeft, ArrowRight, Plus, Trash2, Bot } from 'lucide-react';

const triggerTypes = [
  { value: 'status_change', label: 'Alterações de status' },
  { value: 'task_created', label: 'Tarefa criada' },
  { value: 'due_date_arrived', label: 'Data de vencimento chega' },
];
const actionTypes = [
  { value: 'change_status', label: 'Mudar o status' },
  { value: 'set_assignee', label: 'Adicionar responsável' },
  { value: 'remove_assignee', label: 'Remover responsável' },
  { value: 'assign_function', label: 'Encaminhar para uma função' },
  { value: 'reassign_producer', label: 'Devolver a quem produziu' },
  { value: 'reassign_previous', label: 'Retornar pelo histórico de status' },
  { value: 'change_priority', label: 'Alterar prioridade' },
  { value: 'set_demand_control', label: 'Definir dados da demanda' },
  { value: 'increment_review_round', label: 'Somar uma rodada de revisão' },
  { value: 'move_task', label: 'Mover para...' },
];
const futureActionLabels = {
  create_subtask: 'Criar uma subtarefa',
  notify_user: 'Notificar usuário',
  add_comment: 'Adicionar comentário',
};
const priorityOptions = [
  { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' }, { value: 'urgent', label: 'Urgente' },
];
const moveOptions = [{ value: 'social_media_completed', label: 'Redes Sociais (Concluído)' }];
const demandTypeOptions = [
  { value: 'planned', label: 'Planejada' }, { value: 'correction', label: 'Correção' },
  { value: 'change', label: 'Alteração' }, { value: 'extra', label: 'Extra' },
  { value: 'urgency', label: 'Urgência' },
];
const demandOriginOptions = [
  { value: 'plan', label: 'Plano mensal' }, { value: 'client', label: 'Cliente' },
  { value: 'internal', label: 'Interno' },
];
const actionLabel = type => actionTypes.find(action => action.value === type)?.label ||
  futureActionLabels[type] || (type === 'move_task_to_social_media' ? 'Mover para Redes Sociais' : 'Ação existente indisponível');
const statusValues = value => (Array.isArray(value) ? value : value ? [value] : [])
  .map(item => typeof item === 'object' ? item.value : item);
let nextActionId = 0;
const prepareAction = action => ({
  ...action,
  config: action.type === 'assign_function'
    ? { ...action.config, mode: action.config?.mode || 'replace' }
    : { ...action.config },
  _formId: ++nextActionId,
});
const renderStatusOption = status => ({
  value: status.value,
  label: status.label,
  content: <span className="flex items-center gap-2">
    <span className={`h-3 w-3 rounded-full ${status.color?.startsWith('#') ? '' : status.color || ''}`} style={status.color?.startsWith('#') ? { backgroundColor: status.color } : undefined} />
    <span>{status.label}</span>
  </span>,
});

export default function AutomationForm({ statusOptions = [], users = [], operationalFunctions = [], operationalUnavailable = '', onSave, onCancel, automation }) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('status_change');
  const [triggerConfig, setTriggerConfig] = useState({ from_status: [], to_status: [] });
  const [actions, setActions] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState([]);
  const submittingRef = useRef(false);
  const originalActionsRef = useRef(new Map());
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    setName(automation?.name || 'Nova Automação');
    setTriggerType(automation?.trigger_type || 'status_change');
    setTriggerConfig({ from_status: [], to_status: [], ...automation?.trigger_config });
    const prepared = (automation?.actions || [{ type: 'change_status', config: {} }]).map(prepareAction);
    originalActionsRef.current = new Map(prepared.map(action => [action._formId, action.type]));
    setActions(prepared);
    setSubmitErrors([]);
  }, [automation]);

  const personLabel = id => {
    const profile = users.find(person => person.id === id);
    if (!profile) return 'Pessoa indisponível';
    return `${profile.full_name || 'Pessoa sem nome'}${activeStaff(profile) ? '' : ' (indisponível)'}`;
  };
  const userOptions = users.map(person => ({ value: person.id, label: personLabel(person.id) }));
  const selectedPeople = ids => uniqueIds(ids).map(id =>
    userOptions.find(option => option.value === id) || { value: id, label: 'Pessoa indisponível' });
  const peopleOptions = ids => [...userOptions, ...selectedPeople(ids).filter(option => !users.some(person => person.id === option.value))];
  const selectedStatuses = values => statusValues(values).map(value =>
    renderStatusOption(statusOptions.find(status => status.value === value) || { value, label: 'Etapa indisponível' }));
  const allStatusOptions = values => [...statusOptions.map(renderStatusOption),
    ...selectedStatuses(values).filter(option => !statusOptions.some(status => status.value === option.value))];
  const functionOccupants = fn => {
    const ids = uniqueIds(fn?.assignee_ids);
    return ids.length ? ids.map(personLabel).join(', ') : 'Sem responsáveis';
  };
  const functionOptions = selectedId => {
    const options = operationalFunctions.map(fn => ({
      value: fn.id,
      label: `${fn.name}${fn.is_active ? '' : ' (inativa)'}`,
      occupants: functionOccupants(fn),
    }));
    if (selectedId && !options.some(option => option.value === selectedId)) {
      options.push({ value: selectedId, label: operationalUnavailable ? 'Função ainda não consultada' : 'Função indisponível', occupants: operationalUnavailable || 'Confira a configuração das funções.' });
    }
    return options;
  };

  const updateAction = (id, patch) => setActions(current => current.map(action => action._formId === id ? { ...action, ...patch } : action));
  const updateConfig = (id, field, value) => setActions(current => current.map(action => action._formId === id
    ? { ...action, config: { ...action.config, [field]: value } } : action));
  const changeActionType = (id, type) => {
    const config = type === 'assign_function' ? { function_id: '', mode: 'replace' }
      : ['set_assignee', 'remove_assignee'].includes(type) ? { assignee_ids: [] } : {};
    updateAction(id, { type, config });
  };

  const handleSubmit = async event => {
    event?.preventDefault();
    if (submittingRef.current) return;
    const cleanedActions = actions.map(({ _formId, ...action }) => ({
      ...action,
      config: ['set_assignee', 'remove_assignee'].includes(action.type)
        ? { ...action.config, assignee_ids: uniqueIds(action.config?.assignee_ids) }
        : action.type === 'assign_function' ? { ...action.config, mode: action.config?.mode || 'replace' } : { ...action.config },
    }));
    const errors = [];
    const validStatus = value => statusOptions.some(status => status.value === value);
    if (!name.trim()) errors.push('Dê um nome à automação.');
    if (!triggerTypes.some(trigger => trigger.value === triggerType)) errors.push('Selecione quando a automação deve acontecer.');
    if (!cleanedActions.length) errors.push('Adicione pelo menos uma ação.');
    if (triggerType === 'status_change') {
      const from = statusValues(triggerConfig.from_status);
      const to = statusValues(triggerConfig.to_status);
      if (!to.length) errors.push('Selecione pelo menos um status de destino.');
      if ([...from, ...to].some(value => !validStatus(value))) errors.push('Há uma etapa indisponível no gatilho. Confira os status selecionados.');
    }
    cleanedActions.forEach((action, index) => {
      const config = action.config || {};
      const prefix = `Ação ${index + 1}: `;
      if (action.type === 'change_status' && !validStatus(config.status)) errors.push(prefix + 'selecione o status de destino.');
      if (action.type === 'reassign_previous' && !validStatus(config.from_status)) errors.push(prefix + 'selecione o status usado no retorno.');
      if (action.type === 'set_assignee' && !uniqueIds(config.assignee_ids).length) errors.push(prefix + 'selecione quem recebe a tarefa.');
      if (action.type === 'change_priority' && !priorityOptions.some(option => option.value === config.priority)) errors.push(prefix + 'selecione a prioridade.');
      if (action.type === 'set_demand_control') {
        if (!demandTypeOptions.some(option => option.value === config.demand_type)) errors.push(prefix + 'selecione o tipo da demanda.');
        if (config.demand_origin && !demandOriginOptions.some(option => option.value === config.demand_origin)) errors.push(prefix + 'selecione uma origem válida.');
        if (config.sla_days !== '' && config.sla_days != null && (!Number.isInteger(Number(config.sla_days)) || Number(config.sla_days) < 0 || Number(config.sla_days) > 365)) errors.push(prefix + 'informe um SLA entre 0 e 365 dias úteis.');
      }
      if (['move_task', 'move_task_to_social_media'].includes(action.type)) {
        const legacyDefault = originalActionsRef.current.get(actions[index]._formId) === action.type && !config.destination;
        if (!legacyDefault && !moveOptions.some(option => option.value === config.destination)) errors.push(prefix + 'selecione o destino da tarefa.');
      }
      if (!actionTypes.some(option => option.value === action.type) && originalActionsRef.current.get(actions[index]._formId) !== action.type) {
        errors.push(prefix + 'selecione uma ação disponível.');
      }
    });
    if (operationalUnavailable && cleanedActions.some(action => ['assign_function', 'reassign_producer'].includes(action.type))) {
      errors.push(`${operationalUnavailable} Consulte as funções novamente antes de salvar ações por função ou retorno ao produtor.`);
    }
    errors.push(...actionConfigurationIssues(
      cleanedActions.filter(action => action.type !== 'assign_function' || !operationalUnavailable),
      { functions: operationalFunctions, profiles: users, statusOptions },
    ));
    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length) {
      setSubmitErrors(uniqueErrors);
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitErrors([]);
    try {
      const automationData = { name: name.trim(), trigger_type: triggerType, trigger_config: triggerConfig, actions: cleanedActions };
      let error;
      if (automation) {
        ({ error } = await supabase.from('task_automations').update(automationData).eq('id', automation.id).select('id').single());
      } else {
        if (!user?.id) throw new Error('Sua sessão não está disponível. Entre novamente para salvar.');
        ({ error } = await supabase.from('task_automations').insert({ ...automationData, owner_id: user.id }).select('id').single());
      }
      if (error) throw error;
      toast({ title: `Automação ${automation ? 'atualizada' : 'criada'} com sucesso!` });
      onSave();
    } catch (error) {
      const message = error?.message || 'Não foi possível salvar. Seus dados foram mantidos; tente novamente.';
      setSubmitErrors([message]);
      toast({ title: 'Não foi possível salvar a automação', description: message, variant: 'destructive' });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const renderStatusSelect = (value, onChange, placeholder = 'Selecione o status') => (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="bg-white dark:bg-gray-800"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{allStatusOptions(value).map(option => <SelectItem key={option.value} value={option.value}>{option.content}</SelectItem>)}</SelectContent>
    </Select>
  );

  const renderTriggerConfig = () => triggerType === 'status_change' ? (
    <>
      <div>
        <div className="flex items-center gap-1"><Label>De</Label><AutomationHelp>Deixe vazio para aceitar qualquer status de origem. Os valores existentes são preservados até você alterá-los.</AutomationHelp></div>
        <MultiSelect options={allStatusOptions(triggerConfig.from_status)} value={selectedStatuses(triggerConfig.from_status)} onChange={value => setTriggerConfig(current => ({ ...current, from_status: value.map(option => option.value) }))} placeholder="Qualquer status" />
      </div>
      <div>
        <Label>Para</Label>
        <MultiSelect options={allStatusOptions(triggerConfig.to_status)} value={selectedStatuses(triggerConfig.to_status)} onChange={value => setTriggerConfig(current => ({ ...current, to_status: value.map(option => option.value) }))} placeholder="Selecione um ou mais status" />
      </div>
    </>
  ) : <div className="flex items-center gap-1 text-sm text-muted-foreground">
    <span>Sem configuração adicional</span>
    <AutomationHelp>{triggerType === 'task_created' ? 'Esta regra é avaliada quando o sistema aciona o evento de criação da tarefa.' : 'Este evento depende da verificação de vencimentos existente no sistema; não cria um novo agendador.'}</AutomationHelp>
  </div>;

  const renderActionConfig = action => {
    const config = action.config || {};
    const change = (field, value) => updateConfig(action._formId, field, value);
    switch (action.type) {
      case 'change_status':
        return <div><Label>Mover para</Label>{renderStatusSelect(config.status, value => change('status', value))}</div>;
      case 'set_assignee':
      case 'remove_assignee':
        return <div>
          <div className="flex items-center gap-1"><Label>{action.type === 'set_assignee' ? 'Adicionar pessoas' : 'Remover pessoas'}</Label>
            <AutomationHelp>{action.type === 'set_assignee' ? 'Acrescenta as pessoas escolhidas sem remover quem já está na tarefa. Referências sem perfil continuam visíveis para conferência.' : 'Uma seleção vazia remove todos os responsáveis. Para remover somente algumas pessoas, selecione-as aqui.'}</AutomationHelp>
          </div>
          <MultiSelect options={peopleOptions(config.assignee_ids)} value={selectedPeople(config.assignee_ids)} onChange={value => change('assignee_ids', value.map(option => option.value))} placeholder={action.type === 'set_assignee' ? 'Selecione quem recebe' : 'Vazio: remover todos'} />
        </div>;
      case 'assign_function': {
        const selected = operationalFunctions.find(fn => fn.id === config.function_id);
        return <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1"><Label>Função</Label><AutomationHelp>A regra usa quem estiver vinculado a essa função no momento da execução. As funções e seus integrantes são gerenciados fora deste formulário. Uma função inativa, vazia ou com pessoa indisponível precisa ser conferida antes de salvar.</AutomationHelp></div>
            {operationalUnavailable && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{operationalUnavailable}</p>}
            <Select value={config.function_id || ''} onValueChange={value => change('function_id', value)}>
              <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>{functionOptions(config.function_id).map(option => <SelectItem key={option.value} value={option.value}>
                <span className="flex flex-col"><span>{option.label}</span><span className="text-xs text-muted-foreground">{option.occupants}</span></span>
              </SelectItem>)}</SelectContent>
            </Select>
            {selected && <p className="mt-1 text-xs text-muted-foreground">Recebem hoje: {functionOccupants(selected)}</p>}
          </div>
          <div>
            <div className="flex items-center gap-1"><Label>Responsáveis da tarefa</Label><AutomationHelp>Substituir remove os responsáveis atuais e coloca os integrantes da função. Adicionar mantém os atuais e acrescenta os integrantes da função, sem repetir pessoas.</AutomationHelp></div>
            <Select value={config.mode || 'replace'} onValueChange={value => change('mode', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="replace">Substituir pelos integrantes da função</SelectItem><SelectItem value="add">Adicionar integrantes da função</SelectItem></SelectContent>
            </Select>
          </div>
        </div>;
      }
      case 'reassign_producer':
        return <div>
          <div className="flex items-center gap-1"><Label>Etapa de produção</Label><AutomationHelp>Retorna às pessoas registradas na saída mais recente desta etapa de produção. O histórico anterior é preservado. Se não houver registro ou houver uma pessoa indisponível, a automação informa a pendência, sem escolher outra pessoa por conta própria.</AutomationHelp></div>
          <Select value={config.production_status || ''} onValueChange={value => change('production_status', value)}>
            <SelectTrigger><SelectValue placeholder="Selecione a etapa de produção" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__last_workflow_production__">Última produção do fluxo</SelectItem>
              {(statusOptions || []).map(status => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>;
      case 'reassign_previous':
        return <div>
          <div className="flex items-center gap-1"><Label>Buscar responsável do status</Label><AutomationHelp>Mantém o retorno legado: procura o último registro do status selecionado no histórico. Não significa a pessoa da etapa imediatamente anterior. Essa ação não foi convertida automaticamente em retorno ao produtor.</AutomationHelp></div>
          {renderStatusSelect(config.from_status, value => change('from_status', value))}
        </div>;
      case 'change_priority':
        return <div><Label>Prioridade</Label><Select value={config.priority || ''} onValueChange={value => change('priority', value)}>
          <SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
          <SelectContent>{priorityOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select></div>;
      case 'set_demand_control':
        return <div className="space-y-3">
          <div><div className="flex items-center gap-1"><Label>Tipo da demanda</Label><AutomationHelp>Quando esta regra executar, a tarefa será classificada automaticamente.</AutomationHelp></div><Select value={config.demand_type || ''} onValueChange={value => change('demand_type', value)}><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger><SelectContent>{demandTypeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Origem (opcional)</Label><Select value={config.demand_origin || ''} onValueChange={value => change('demand_origin', value)}><SelectTrigger><SelectValue placeholder="Manter a origem atual" /></SelectTrigger><SelectContent>{demandOriginOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>SLA em dias úteis (opcional)</Label><Input type="number" min="0" max="365" value={config.sla_days ?? ''} onChange={event => change('sla_days', event.target.value === '' ? '' : Number(event.target.value))} placeholder="Manter o SLA atual" /></div>
        </div>;
      case 'increment_review_round':
        return <div className="flex items-center gap-1 text-sm text-muted-foreground"><span>A rodada será somada automaticamente.</span><AutomationHelp>Use esta ação na regra que devolve a tarefa para alteração.</AutomationHelp></div>;
      case 'move_task':
      case 'move_task_to_social_media':
        return <div>
          <div className="flex items-center gap-1"><Label>Destino</Label><AutomationHelp>Move a mesma tarefa para Redes Sociais (Concluído), preservando seu identificador. Essa transferência interna não publica conteúdo na Meta.</AutomationHelp></div>
          <Select value={config.destination || (originalActionsRef.current.get(action._formId) === action.type ? 'social_media_completed' : '')} onValueChange={value => change('destination', value)}>
            <SelectTrigger><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
            <SelectContent>{moveOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>;
      default:
        return <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>Ação existente preservada</span><AutomationHelp>{futureActionLabels[action.type] ? 'Ação ainda não executada pelo motor. A configuração existente será preservada ao salvar; essa ação não é oferecida para novas regras.' : 'Este tipo não está disponível no editor. A configuração existente será preservada, sem prometer uma execução que o editor não conhece.'}</AutomationHelp>
        </div>;
    }
  };

  // These are render functions, not component types recreated on every keystroke.
  const renderTriggerCard = () => <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm space-y-4">
    <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-500" /><h3 className="font-semibold">Quando</h3></div>
    <Select value={triggerType} onValueChange={setTriggerType}>
      <SelectTrigger><SelectValue placeholder="Selecione o gatilho" /></SelectTrigger>
      <SelectContent>{triggerTypes.map(trigger => <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>)}</SelectContent>
    </Select>
    {renderTriggerConfig()}
  </div>;
  const renderActionCard = action => {
    const options = actionTypes.some(option => option.value === action.type) ? actionTypes
      : [...actionTypes, { value: action.type, label: actionLabel(action.type) }];
    return <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md space-y-4">
      <div className="flex items-start gap-2">
        <Select value={action.type} onValueChange={value => changeActionType(action._formId, value)}>
          <SelectTrigger><SelectValue placeholder="Selecione a ação" /></SelectTrigger>
          <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" aria-label="Remover ação" onClick={() => setActions(current => current.filter(item => item._formId !== action._formId))}><Trash2 className="h-4 w-4 text-red-500" /></Button>
      </div>
      {renderActionConfig(action)}
    </div>;
  };

  return <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 z-50 flex flex-col">
    <header className="flex items-center gap-3 p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
      <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={isSubmitting} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button>
      <Label htmlFor="automation-name" className="sr-only">Nome da automação</Label>
      <Input id="automation-name" form="automation-form" value={name} onChange={event => setName(event.target.value)} disabled={isSubmitting} placeholder="Nome da automação" className="text-lg font-semibold" />
      <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={isSubmitting} aria-label="Fechar"><X className="h-5 w-5" /></Button>
    </header>
    <main className="flex-grow overflow-y-auto p-4 sm:p-8">
      {operationalUnavailable && <div className="max-w-4xl mx-auto mb-4 flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
        <span>Funções não consultadas</span><AutomationHelp>{operationalUnavailable} Você pode editar regras por pessoa. Para usar funções ou retorno ao produtor, volte à lista e tente consultar a configuração novamente. Esta falha de consulta não significa que uma função ou pessoa foi removida.</AutomationHelp>
      </div>}
      <form id="automation-form" onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <fieldset disabled={isSubmitting} className="flex flex-col md:flex-row items-stretch md:items-start gap-6">
          <div className="min-w-0 flex-1">{renderTriggerCard()}</div>
          <ArrowRight className="hidden md:block mt-16 shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm space-y-4">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-500" /><h3 className="font-semibold">Ações</h3><AutomationHelp>As ações continuam usando as automações existentes. Confira também outras regras que correspondam à mesma passagem; mais de uma regra pode executar.</AutomationHelp></div>
            {actions.map(action => <div key={action._formId}>{renderActionCard(action)}</div>)}
            <Button type="button" variant="outline" className="w-full" onClick={() => setActions(current => [...current, prepareAction({ type: 'change_status', config: {} })])}><Plus className="mr-2 h-4 w-4" />Adicionar ação</Button>
          </div>
        </fieldset>
      </form>
    </main>
    <footer className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
      {submitErrors.length > 0 && <div role="alert" className="max-h-36 overflow-y-auto text-sm text-red-600 dark:text-red-400"><ul className="list-disc pl-5">{submitErrors.map(message => <li key={message}>{message}</li>)}</ul></div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{triggerTypes.find(trigger => trigger.value === triggerType)?.label || 'Gatilho indisponível'} → {actions.map(action => actionLabel(action.type)).join(' → ')}</p>
        <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button><Button type="submit" form="automation-form" disabled={isSubmitting}>{isSubmitting ? 'Salvando…' : 'Salvar'}</Button></div>
      </div>
    </footer>
  </div>;
}
