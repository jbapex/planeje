import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import { stageAtlasAttachments, uploadAtlasAttachments } from '@/lib/atlasAttachments';

export class AtlasApiError extends Error {
  constructor(message, { code, status, data } = {}) {
    super(message);
    this.name = 'AtlasApiError';
    this.code = code || 'ATLAS_REQUEST_FAILED';
    this.status = status;
    this.data = data;
  }
}

async function invokeAtlas(action, payload = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new AtlasApiError('Sua sessão expirou. Entre novamente para conversar com o Atlas.', { code: 'ATLAS_UNAUTHENTICATED', status: 401 });
  }
  // The server validates identity and ownership. No owner identifiers or AI keys live here.
  let response;
  try {
    response = await invokeEdgeFunction('atlas-chat', { ...payload, action }, sessionData.session.access_token);
  } catch {
    throw new AtlasApiError('Não foi possível confirmar a resposta do Atlas. Seu pedido continua aqui; tente consultar novamente.', { code: 'ATLAS_NETWORK_ERROR' });
  }
  const { data, error } = response;
  // A terminal run is a valid response, including when the model failed.
  if (['chat', 'automation_run'].includes(action) && data?.run_id && ['failed', 'processing'].includes(data.status)) return data;
  if (error || data?.ok === false) {
    throw new AtlasApiError(data?.error || error?.message || 'Não foi possível concluir esta ação.', { code: data?.code, status: error?.status, data });
  }
  if (!data || typeof data !== 'object') throw new AtlasApiError('O Atlas retornou uma resposta incompleta. Tente novamente.');
  return data;
}

export function createAtlasRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const bootstrapAtlas = ({ executor = false, clientId = null } = {}) => invokeAtlas('bootstrap', executor ? { executor: true, client_id: clientId || null } : {});
export const loadAtlasHistory = (conversationId, { executor = false } = {}) => invokeAtlas('history', { conversation_id: conversationId, ...(executor && { executor: true }) });
export const loadAtlasProgress = (requestId, { executor = false } = {}) => invokeAtlas('progress', { request_id: requestId, ...(executor && { executor: true }) });
export const sendAtlasMessage = (payload) => invokeAtlas('chat', payload);
export const loadAtlasAutomation = ({ id, app, clientId = null }) => invokeAtlas('automation_snapshot', { executor: true, id, app, client_id: clientId });
export const runAtlasAutomation = (payload) => invokeAtlas('automation_run', payload);
export async function uploadAtlasMessageAttachments({ files, requestId, conversationId, clientId }) {
  const manifest = await stageAtlasAttachments(supabase, { files, requestId, conversationId, clientId });
  return uploadAtlasAttachments(supabase.storage, { files, manifest });
}
export const respondAtlasInteraction = (payload) => invokeAtlas('executor_decide', payload);
export const reconcileAtlasInteraction = (id) => invokeAtlas('executor_reconcile', { id });
export const saveAtlasMemory = ({ content, clientId = null, replacesId = null }) => invokeAtlas('save_memory', { content, client_id: clientId, confirmed: true, replaces_id: replacesId });
export const revokeAtlasMemory = (memoryId) => invokeAtlas('revoke_memory', { memory_id: memoryId });
export const setAtlasMemoryTeamScope = (memoryId,shared) => invokeAtlas('memory_team_scope',{memory_id:memoryId,shared});

export async function connectAtlasVoice({ sdp, clientId }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) throw new AtlasApiError('Entre novamente para conversar por voz.', { code: 'UNAUTHENTICATED' });
  const { data, error } = await invokeEdgeFunction('atlas-voice', { sdp, client_id: clientId || null }, sessionData.session.access_token);
  if (error || data?.ok === false || !data?.sdp) throw new AtlasApiError(data?.error || error?.message || 'A conexão de voz não foi confirmada.', { code: data?.code });
  return data;
}

export const loadAtlasInbox = () => invokeAtlas('inbox');
export const markAtlasInbox = (id, archive = false) => invokeAtlas('mark_inbox', { id, archive });
export const cancelAtlasJob = (id) => invokeAtlas('cancel_job', { id });
export const setAtlasPreferences = (preferences) => invokeAtlas('preferences', preferences);

export async function invokeAtlasOffice(action = 'snapshot', payload = {}) {
  const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
  if(sessionError||!sessionData?.session?.access_token)throw new AtlasApiError('Sua sessão expirou.',{code:'ATLAS_UNAUTHENTICATED',status:401});
  let response;
  try {response=await invokeEdgeFunction('atlas-office',{...payload,action},sessionData.session.access_token);}
  catch {throw new AtlasApiError('Não foi possível confirmar a resposta. Atualize o escritório antes de repetir a decisão.',{code:'OFFICE_NETWORK_ERROR'});}
  if(response.error||response.data?.ok===false)throw new AtlasApiError(response.data?.error||'O escritório não respondeu.',{code:response.data?.code,status:response.error?.status});
  if(!response.data?.ok)throw new AtlasApiError('Resposta incompleta do escritório.',{code:'OFFICE_FAILED'});
  return response.data;
}
