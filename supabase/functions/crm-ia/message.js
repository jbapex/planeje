import { dispatchCrmIaQueue } from '../_shared/crmIaDelivery.js';
import { crmIaMediaDescriptor } from '../_shared/crmIaMediaPayload.js';
import { CRM_IA_VOICE_MODEL, CRM_IA_TTS_VOICES } from '../_shared/crmIaVoice.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;

export async function handleCrmIaMessage({ req, makeCaller, db, send, download, voiceAvailable = () => false, dispatch = dispatchCrmIaQueue }) {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return response({ error: 'Método não permitido.' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return response({ error: 'Entre novamente na sua conta.' }, 401);
  const body = await req.json().catch(() => null);
  const identifiers = body?.mode === 'capabilities' ? [body.cliente_id] : [body?.cliente_id, body?.contact_id, body?.channel_id];
  if (!body || !identifiers.every(value => typeof value === 'string' && uuid.test(value))) return response({ error: 'Revise o contato e canal.' }, 400);
  const caller = makeCaller(authorization);
  const session = await caller.auth.getUser();
  if (session.error || !session.data?.user?.id) return response({ error: 'Sessão inválida.' }, 401);
  if (body.mode === 'capabilities') {
    const access = await caller.rpc('crm_ia_workspace', { p_action: 'workspace', p_client_id: body.cliente_id, p_payload: {} });
    if (access.error || access.data?.client?.id !== body.cliente_id) return response({ error: 'Sem acesso a esta conta.' }, 403);
    const available = voiceAvailable() === true;
    return response({ audio: { available, input_available: available, model: CRM_IA_VOICE_MODEL, voices: CRM_IA_TTS_VOICES, max_bytes: 4194304 } });
  }
  if (body.mode === 'media_get') {
    if (typeof body.message_id !== 'string' || !body.message_id || body.message_id.length > 200 || !['image', 'video', 'audio', 'document'].includes(body.media_kind)) return response({ error: 'Arquivo inválido.' }, 400);
    const access = await caller.rpc('crm_ia_workspace', { p_action: 'authorize_media', p_client_id: body.cliente_id,
      p_payload: { contact_id: body.contact_id, channel_id: body.channel_id, message_id: body.message_id } });
    if (access.error || !access.data?.allowed) return response({ error: 'Arquivo indisponível neste contato e canal.' }, 403);
    try { return response(await download({ message_id: body.message_id, cliente_id: body.cliente_id, whatsapp_config_id: body.channel_id,
      chat_jid: access.data.chat_jid, media_kind: body.media_kind, generate_mp3: body.media_kind === 'audio' }, authorization)); }
    catch { return response({ error: 'Não foi possível carregar o arquivo.' }, 502); }
  }
  if (!uuid.test(body.request_id || '')) return response({ error: 'Identificador do envio inválido.' }, 400);
  let media = null;
  if (body.mode === 'media') {
    try { media = await crmIaMediaDescriptor(body); }
    catch (error) { return response({ error: error.message }, 400); }
  } else if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 4000) return response({ error: 'Escreva uma mensagem de até 4.000 caracteres.' }, 400);
  const preview = media ? media.caption || `[${media.media_type === 'image' ? 'Imagem' : media.media_type === 'audio' || media.media_type === 'ptt' ? 'Áudio' : 'Documento'}] ${media.file_name}` : body.body;
  const queued = await caller.rpc('crm_ia_workspace', { p_action: media ? 'prepare_media' : 'schedule_message', p_client_id: body.cliente_id, p_payload: {
    contact_id: body.contact_id, channel_id: body.channel_id, body: preview, request_id: body.request_id,
    ...(media ? { media_descriptor: media } : {}),
  } });
  if (queued.error || !queued.data?.id) return response({ error: queued.error?.message || 'Não foi possível reservar o envio.' }, queued.error?.code === '42501' ? 403 : 409);
  const item = queued.data;
  if (item.status !== 'pending') return response({ id: item.id, status: item.status }, item.status === 'sent' ? 200 : 202);
  try {
    const batch = await dispatch({ db, send: media ? payload => send({ ...payload, file: body.file, media_type: media.media_type,
      mimetype: media.mimetype, doc_name: media.file_name, caption: media.caption }) : send, ids: [item.id] });
    const status = batch.results.find(result => result.id === item.id)?.status || 'pending';
    return response({ id: item.id, status }, status === 'sent' ? 200 : 202);
  } catch {
    return response({ id: item.id, status: 'pending' }, 202);
  }
}
