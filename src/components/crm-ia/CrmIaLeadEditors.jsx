import React, { useState } from 'react';
import { CrmIaEditor, CrmIaField } from './CrmIaPrimitives';
import { leadPayload } from './crmIaPresentation';
import { moveLeadPayload, profileKey, publishedLeadProfiles } from './crmIaLeadModel';

const blankOption = label => ({ value: '', label });

export function CrmIaLeadEditor({ row = {}, workspace, mutate, onClose }) {
  const [draft, setDraft] = useState(() => ({ nome: '', whatsapp: '', email: '', valor: '', origem: '', observacoes: '', ...row, etiquetas: (row.etiquetas || []).join('\n') }));
  const [chosenProfile, setChosenProfile] = useState(() => profileKey(row.crm_ia_profile));
  const update = (key, value) => setDraft(old => ({ ...old, [key]: value, ...(key === 'pipeline_id' && { stage_id: '' }) }));
  const target = workspace.stages.find(stage => stage.id === draft.stage_id);
  const reasonRequired = target && ['ganho', 'perdido'].includes(target.tipo) && row.stage_id !== draft.stage_id;
  const profiles = publishedLeadProfiles(workspace, draft.pipeline_id);
  const historical = row.crm_ia_profile && !profiles.some(item => profileKey(item) === profileKey(row.crm_ia_profile));
  return <CrmIaEditor title={row.id ? 'Editar lead' : 'Novo lead'} onClose={onClose} onSave={() => {
    if (row.id && (draft.pipeline_id || null) !== (row.pipeline_id || null) && (!target || target.pipeline_id !== draft.pipeline_id)) throw new Error('Escolha uma etapa do funil de destino para transferir o lead.');
    if (reasonRequired && !draft.reason?.trim()) throw new Error('Informe o motivo para concluir esta oportunidade.');
    if (Object.hasOwn(draft, 'profile') && draft.profile !== null && !profiles.some(item => profileKey(item) === profileKey(draft.profile) && item.agent_updated_at === draft.profile?.agent_updated_at)) throw new Error('O perfil mudou. Atualize o lead antes de atribuir.');
    return mutate('save_lead', { ...leadPayload(draft, row), ...(reasonRequired && { reason: draft.reason.trim() }) });
  }}><div className="crm-ia-form-grid">
    <CrmIaField label="Nome" value={draft.nome} onChange={value => update('nome', value)} required maxLength={200} /><CrmIaField label="Telefone" type="tel" value={draft.whatsapp} onChange={value => update('whatsapp', value)} required />
    <CrmIaField label="Email" type="email" value={draft.email} onChange={value => update('email', value)} /><CrmIaField label="Valor" type="number" min="0" step="0.01" value={draft.valor} onChange={value => update('valor', value)} />
    <CrmIaField label="Funil do lead" value={draft.pipeline_id} onChange={value => update('pipeline_id', value)} options={[blankOption('Selecione'), ...workspace.pipelines]} /><CrmIaField label="Etapa do lead" value={draft.stage_id} onChange={value => update('stage_id', value)} options={[blankOption('Selecione'), ...workspace.stages.filter(stage => stage.pipeline_id === draft.pipeline_id)]} />
    <CrmIaField label="Responsável pelo lead" value={draft.responsavel_id} onChange={value => update('responsavel_id', value)} options={[blankOption('Sem responsável'), ...workspace.people]} /><CrmIaField label="Origem do lead" value={draft.origem} onChange={value => update('origem', value)} />
    <CrmIaField label="Perfil atribuído" value={chosenProfile} onChange={value => { const found = profiles.find(item => profileKey(item) === value); setChosenProfile(value); update('profile', value ? found : null); }} options={[blankOption('Sem perfil'), ...(historical ? [{ value: profileKey(row.crm_ia_profile), label: `${row.crm_ia_profile.nome} (histórico preservado)`, disabled: true }] : []), ...profiles.map(item => ({ value: profileKey(item), label: item.nome }))]} />
    <CrmIaField label="Etiquetas, uma por linha" type="textarea" value={draft.etiquetas} onChange={value => update('etiquetas', value)} /><CrmIaField label="Observações" type="textarea" value={draft.observacoes} onChange={value => update('observacoes', value)} />
    {reasonRequired && <CrmIaField label="Motivo da etapa" type="textarea" value={draft.reason} onChange={value => update('reason', value)} required />}
    {(workspace.config.data.custom_fields?.fields || []).filter(field => field.active !== false).map(field => <CrmIaField key={field.key} label={field.name} type={field.type === 'select' ? 'text' : field.type} value={draft.crm_ia_fields?.[field.key]} options={field.type === 'select' ? [blankOption('Selecione'), ...(field.options || []).map(value => ({ value, label: value }))] : undefined} onChange={value => setDraft(old => ({ ...old, crm_ia_fields: { ...old.crm_ia_fields, [field.key]: field.type === 'number' ? value === '' ? null : Number(value) : value } }))} />)}
  </div></CrmIaEditor>;
}

export function CrmIaMoveEditor({ row, workspace, mutate, initialTarget = '', onClose }) {
  const [target, setTarget] = useState(initialTarget);
  const [reason, setReason] = useState('');
  return <CrmIaEditor title="Mover etapa" onClose={onClose} onSave={() => mutate('move_lead', moveLeadPayload(row, target, workspace.stages, reason))} saveLabel="Confirmar e mover"><CrmIaField label="Etapa de destino" value={target} onChange={setTarget} required options={[blankOption('Selecione a etapa'), ...workspace.stages.filter(item => item.pipeline_id === row.pipeline_id && item.id !== row.stage_id)]} /><CrmIaField label="Motivo" type="textarea" value={reason} onChange={setReason} /><p className="crm-ia-muted">As restrições e ações obrigatórias do funil serão conferidas antes da gravação. Um conflito conserva esta revisão.</p></CrmIaEditor>;
}

