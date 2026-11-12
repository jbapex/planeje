import React, { useState, useEffect } from 'react';
    import { Save, FolderKanban, User, UserCircle } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Label } from '@/components/ui/label';
    import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSessionFormState } from '@/hooks/useSessionFormState';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { parseMesReferenciaLocal } from '@/lib/mesReferencia';
import { useProjectPlanningSettings } from '@/hooks/useProjectPlanningSettings';
import { PROJECT_DEADLINE_FIELDS, previousMonthDeadlines, projectDeadlinesError } from '@/lib/projectPlanningWorkflow';
import { Switch } from '@/components/ui/switch';
import { projectPeriod, projectPeriodError } from '@/lib/projectPeriod';

const PROJECT_STATUS_ITEMS = [
  { value: 'a_fazer', label: 'A fazer' },
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'aprovacao', label: 'Reunião / Aprovação' },
  { value: 'execucao', label: 'Execução' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'pausado', label: 'Pausado' },
];

const ProjectForm = ({ project, clients, users = [], onSave, onClose, defaultClientId, defaultYear, defaultMonth }) => {
  const isNew = !project;
  const isMonthlyCreation = isNew && defaultYear != null && defaultMonth != null;
  const formKey = `project_period_v2_${project?.id || 'new'}_${defaultClientId || ''}_${defaultYear ?? ''}_${defaultMonth ?? ''}`;
  const { user } = useAuth();
  const planning = useProjectPlanningSettings();
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState(null);
  
  // Meses em português
  const months = [
    { value: '0', label: 'Janeiro' },
    { value: '1', label: 'Fevereiro' },
    { value: '2', label: 'Março' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Maio' },
    { value: '5', label: 'Junho' },
    { value: '6', label: 'Julho' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Setembro' },
    { value: '9', label: 'Outubro' },
    { value: '10', label: 'Novembro' },
    { value: '11', label: 'Dezembro' },
  ];

  const generatedPlanName = (data) => {
    const startName = months[Number(data.month)]?.label.toLowerCase();
    const start = `${data.year}-${String(Number(data.month) + 1).padStart(2, '0')}`;
    if (!data.end_month || data.end_month === start) return `Plano de ${startName} de ${data.year}`;
    const endName = months[Number(data.end_month.slice(5, 7)) - 1]?.label.toLowerCase();
    const endYear = data.end_month.slice(0, 4);
    return endYear === String(data.year)
      ? `Plano de ${startName} a ${endName} de ${data.year}`
      : `Plano de ${startName} de ${data.year} a ${endName} de ${endYear}`;
  };

  // Estado inicial baseado no projeto ou vazio
  const getInitialData = () => {
    const now = new Date();
    if (project) {
      const projectDate = project.mes_referencia ? parseMesReferenciaLocal(project.mes_referencia) : null;
      const ref = projectDate && !Number.isNaN(projectDate.getTime()) ? projectDate : now;
      return {
        name: project.name || '',
        client_id: project.client_id || '',
        owner_id: project.owner_id || user?.id || '',
        month: ref.getMonth().toString(),
        year: ref.getFullYear().toString(),
        mes_referencia: project.mes_referencia ? ref.toISOString() : now.toISOString(),
        end_month: projectPeriod(project).end || `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`,
        status: project.status || 'planejamento',
        workflow_managed: Boolean(project.workflow_managed),
        ...Object.fromEntries(PROJECT_DEADLINE_FIELDS.map(({ key }) => [key, project[key] || ''])),
      };
    }
    const defMonth =
      defaultMonth !== undefined && defaultMonth !== null && defaultMonth !== ''
        ? parseInt(String(defaultMonth), 10)
        : now.getMonth();
    const defYear =
      defaultYear !== undefined && defaultYear !== null && defaultYear !== ''
        ? parseInt(String(defaultYear), 10)
        : now.getFullYear();
    const refDate = new Date(defYear, defMonth, 1);
    return {
      name: isMonthlyCreation ? `Plano de ${months[defMonth]?.label.toLowerCase()} de ${defYear}` : '',
      client_id: defaultClientId || '',
      owner_id: user?.id || '',
      month: String(defMonth),
      year: String(defYear),
      mes_referencia: refDate.toISOString(),
      end_month: `${defYear}-${String(defMonth + 1).padStart(2, '0')}`,
      status: 'planejamento',
      workflow_managed: true,
    };
  };

  // Hook que persiste estado em sessionStorage
  const [formData, setFormData, clearFormData] = useSessionFormState(formKey, getInitialData());

  // Atualiza quando projeto muda (mas preserva estado salvo se existir)
  useEffect(() => {
    const saved = sessionStorage.getItem(`form_state_${formKey}`);
    if (!saved && project) {
      // Só atualiza se não tiver estado salvo
      const initial = getInitialData();
      setFormData(initial);
    }
  }, [project?.id]); // Só quando ID do projeto muda

  // Atualiza mes_referencia quando mês ou ano mudam
  useEffect(() => {
    if (formData.month && formData.year) {
      const date = new Date(parseInt(formData.year), parseInt(formData.month), 1);
      const newMesReferencia = date.toISOString();
      setFormData(prev => {
        // Só atualiza se for diferente para evitar loop
        if (prev.mes_referencia !== newMesReferencia) {
          return { ...prev, mes_referencia: newMesReferencia };
        }
        return prev;
      });
    }
  }, [formData.month, formData.year, setFormData]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = field === 'start_month' ? { ...prev, year: value.slice(0, 4), month: String(Number(value.slice(5, 7)) - 1) } : { ...prev, [field]: value };
      if (['month', 'year', 'start_month'].includes(field)) {
        const start = `${next.year}-${String(Number(next.month) + 1).padStart(2, '0')}`;
        const oldStart = `${prev.year}-${String(Number(prev.month) + 1).padStart(2, '0')}`;
        if (!prev.end_month || prev.end_month === oldStart || prev.end_month < start) next.end_month = start;
      }
      if (isMonthlyCreation && ['month', 'year', 'start_month', 'end_month'].includes(field) && prev.name === generatedPlanName(prev)) {
        next.name = generatedPlanName(next);
      }
      return next;
    });
  };

  // Verifica se deve mostrar o campo de cliente
  const showClientField = !defaultClientId || project;
  const manageDates = formData.workflow_managed ?? Boolean(project?.workflow_managed || isNew);
  const automaticDates = previousMonthDeadlines(Number(formData.year), Number(formData.month), planning.settings);
  const deadlines = Object.fromEntries(PROJECT_DEADLINE_FIELDS.map(({ key }) => [key, formData[key] || automaticDates[key]]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.client_id || !formData.name) {
      setValidationError('Cliente e nome do projeto são obrigatórios.');
      return;
    }
    const periodFailure = projectPeriodError(`${formData.year}-${String(Number(formData.month) + 1).padStart(2, '0')}`, formData.end_month);
    if (periodFailure) { setValidationError(periodFailure); return; }
    if (manageDates) {
      const failure = projectDeadlinesError(deadlines);
      if (failure) { setValidationError(failure); return; }
    }
    
    const dataToSave = {
      name: formData.name,
      client_id: formData.client_id,
      owner_id: formData.owner_id || user?.id,
      mes_referencia: `${formData.year}-${String(Number(formData.month) + 1).padStart(2, '0')}-01`,
      mes_fim: `${formData.end_month}-01`,
      status: formData.status,
      workflow_managed: manageDates,
      ...(manageDates ? deadlines : {}),
    };
    
    // Limpa o estado salvo após salvar com sucesso
    setSaving(true); setValidationError(null);
    try { const saved = await onSave(dataToSave, isNew); if (saved !== false) clearFormData(); }
    catch (failure) { setValidationError(failure.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isMonthlyCreation ? 'Novo plano' : isNew ? 'Novo Projeto' : 'Editar Projeto'}</DialogTitle>
          {isMonthlyCreation && !showClientField && <DialogDescription>{clients.find((client) => client.id === defaultClientId)?.empresa}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {showClientField && (
            <div className="space-y-2">
              <Label htmlFor="client_id"><User className="inline-block mr-2 h-4 w-4" />Cliente</Label>
              <Select value={formData.client_id} onValueChange={(v) => handleChange('client_id', v)} required>
                <SelectTrigger id="client_id"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name"><FolderKanban className="inline-block mr-2 h-4 w-4" />{isMonthlyCreation ? 'Nome do plano' : 'Título do Projeto'}</Label>
            <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="project-start-month">Mês inicial</Label><Input id="project-start-month" type="month" value={`${formData.year}-${String(Number(formData.month) + 1).padStart(2, '0')}`} onChange={(event) => { if (event.target.value) handleChange('start_month', event.target.value); }} required /></div>
            <div className="space-y-2"><Label htmlFor="project-end-month">Mês final</Label><Input id="project-end-month" type="month" value={formData.end_month || ''} min={`${formData.year}-${String(Number(formData.month) + 1).padStart(2, '0')}`} onChange={(event) => handleChange('end_month', event.target.value)} required /></div>
          </div>
          <p className="text-xs text-muted-foreground">Para um plano mensal, escolha o mesmo mês nos dois campos. A preparação começa antes do mês inicial.</p>
          <div className="space-y-2">
            <Label htmlFor="owner_id"><UserCircle className="inline-block mr-2 h-4 w-4" />Responsável pelo projeto</Label>
            <Select value={formData.owner_id || 'unassigned'} onValueChange={(v) => handleChange('owner_id', v === 'unassigned' ? '' : v)}>
              <SelectTrigger id="owner_id">
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent>
                {users && users.length > 0 ? (
                  <>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={u.avatar_url} />
                            <AvatarFallback>{u.full_name ? u.full_name.charAt(0).toUpperCase() : '?'}</AvatarFallback>
                          </Avatar>
                          <span>{u.full_name || 'Sem nome'}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="loading" disabled>Carregando usuários...</SelectItem>
                )}
              </SelectContent>
            </Select>
            {users && users.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Nenhum usuário encontrado no sistema</p>
            )}
          </div>
          {!isMonthlyCreation && <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_ITEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}
          <details className="rounded-xl border p-3" open={undefined}>
            <summary className="cursor-pointer text-sm font-medium">Personalizar prazos <span className="font-normal text-muted-foreground">(automáticos)</span></summary>
            <div className="mt-3 space-y-3">
              {!project?.workflow_managed && !isNew && <div className="flex items-center justify-between gap-3"><Label htmlFor="project-manage-deadlines">Definir prazos para este projeto</Label><Switch id="project-manage-deadlines" checked={manageDates} onCheckedChange={(value) => handleChange('workflow_managed', value)} /></div>}
              {manageDates && <><p className="text-xs text-muted-foreground">O mês indica quando os conteúdos serão usados. Os prazos podem ficar no mês anterior.</p><div className="grid grid-cols-2 gap-3">{PROJECT_DEADLINE_FIELDS.map(({ key, label }) => <div className="space-y-1.5" key={key}><Label htmlFor={`project-${key}`}>{label}</Label><Input id={`project-${key}`} type="date" value={deadlines[key]} onChange={(event) => handleChange(key, event.target.value)} disabled={saving} /></div>)}</div></>}
              {!manageDates && <p className="text-xs text-muted-foreground">Este projeto mantém seu histórico. Ative para definir as datas.</p>}
            </div>
          </details>
          {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit} disabled={saving || (isNew && planning.loading)}><Save size={16} className="mr-2" />{saving ? 'Salvando…' : isMonthlyCreation ? 'Criar e escrever plano' : isNew ? 'Adicionar Projeto' : 'Salvar Alterações'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectForm;
