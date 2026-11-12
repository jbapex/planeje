import { versionOf } from './crmIaPresentation.js';

export const LEAD_COLUMNS = [['lead', 'Lead'], ['attendance', 'Situação'], ['stage', 'Etapa'], ['pipeline', 'Funil'], ['origin', 'Origem'], ['entry', 'Entrada'], ['email', 'Email'], ['tags', 'Tags'], ['profile', 'Perfil'], ['value', 'Valor'], ['owner', 'Responsável'], ['id', 'ID']];
export const DEFAULT_LEAD_COLUMNS = LEAD_COLUMNS.map(([key]) => key);
export const profileKey = profile => profile?.agent_id && profile?.id ? `${profile.agent_id}:${profile.id}` : '';
export const publishedLeadProfiles = (workspace, pipelineId) => (workspace.lead_profiles || []).filter(item => !item.historical && (item.pipeline_id || null) === (pipelineId || null));

export function leadColumnKeys(value) {
  return Array.isArray(value) ? DEFAULT_LEAD_COLUMNS.filter(key => key === 'lead' || value.includes(key)) : [...DEFAULT_LEAD_COLUMNS];
}
export function leadColumnStorageKey(personId, clientId) {
  return personId && clientId ? `crm-ia:lead-columns:v1:${encodeURIComponent(personId)}:${encodeURIComponent(clientId)}` : null;
}
export function readLeadColumns(key) {
  try { return leadColumnKeys(key ? JSON.parse(localStorage.getItem(key)) : null); }
  catch { return [...DEFAULT_LEAD_COLUMNS]; }
}
export function storeLeadColumns(key, columns) {
  if (key) { try { localStorage.setItem(key, JSON.stringify(leadColumnKeys(columns))); } catch { /* Visual preferences remain usable when browser storage is unavailable. */ } }
}

export function moveLeadPayload(lead, targetId, stages, reason = '') {
  if (!lead?.id || !lead.updated_at) throw new Error('Atualize o lead antes de mover.');
  const target = stages.find(item => item.id === targetId && item.pipeline_id === lead.pipeline_id);
  if (!target || target.id === lead.stage_id) throw new Error('Escolha outra etapa de destino neste funil.');
  const current = stages.find(item => item.id === lead.stage_id);
  if (current?.etapas_permitidas?.length && !current.etapas_permitidas.includes(targetId)) throw new Error('A etapa atual não permite este avanço.');
  if (['ganho', 'perdido'].includes(target.tipo) && !reason.trim()) throw new Error('Informe o motivo para concluir esta oportunidade.');
  return { ...versionOf(lead), from_stage_id: lead.stage_id || null, stage_id: targetId, reason: reason.trim() };
}
