import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';
import { messagePreviewForReply } from '@/lib/atendimentoMessageUtils';
import {
  handlePossibleSessionError,
  SessionExpiredError,
} from '@/lib/authSessionToast';

async function getAccessTokenForFunctions() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session?.access_token) {
      throw new SessionExpiredError();
    }
    session = refreshed.session;
  }
  return session.access_token;
}

function unwrapInvokePayload(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    payload.body &&
    typeof payload.body === 'object' &&
    !Array.isArray(payload.body)
  ) {
    return payload.body;
  }
  return payload ?? {};
}

export async function invokeUazapiSendMessage(payload) {
  const requestBody = unwrapInvokePayload(payload);
  let accessToken;
  try {
    accessToken = await getAccessTokenForFunctions();
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      handlePossibleSessionError(err.message);
    }
    throw err;
  }

  const result = await invokeEdgeFunction('uazapi-send-message', requestBody, accessToken);

  if (result.error) {
    const detail = result.error.message || (await parseFunctionInvokeError(result.error, result.data));
    if (handlePossibleSessionError(detail)) {
      throw new SessionExpiredError(detail);
    }
  }

  return result;
}

export async function parseFunctionInvokeError(error, data) {
  if (data?.error) return String(data.error);
  if (!error) return 'Erro desconhecido.';
  let detail = error.message || 'Erro na edge function.';
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      const parsed = await ctx.json();
      if (parsed?.error) detail = String(parsed.error);
    } else if (typeof ctx?.body === 'string') {
      const parsed = JSON.parse(ctx.body);
      if (parsed?.error) detail = String(parsed.error);
    }
  } catch {
    // mantém message padrão
  }
  return detail;
}

export async function sendMessageReaction({ message, conversation, clienteId, emoji }) {
  if (!message?.id || !conversation?.chat_jid || !clienteId) {
    throw new Error('Mensagem ou conversa inválida para reação.');
  }
  const { data, error } = await invokeUazapiSendMessage({
    body: {
      action: 'react',
      message_id: message.uazapiMessageId || '',
      message_row_id: message.id,
      emoji: emoji || '👍',
      to: conversation.chat_jid,
      cliente_id: clienteId,
      whatsapp_config_id: conversation.whatsapp_config_id,
      conversation_id: conversation.id,
    },
  });
  if (error) {
    throw new Error(await parseFunctionInvokeError(error, data));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function forwardMessageToConversation({
  sourceMessage,
  targetConversation,
  clienteId,
}) {
  if (!sourceMessage || !targetConversation?.chat_jid || !clienteId) {
    throw new Error('Selecione uma conversa de destino.');
  }
  const { data, error } = await invokeUazapiSendMessage({
    body: {
      action: 'forward',
      to: targetConversation.chat_jid,
      conversation_id: targetConversation.id,
      cliente_id: clienteId,
      whatsapp_config_id: targetConversation.whatsapp_config_id,
      source_message_id: sourceMessage.uazapiMessageId || undefined,
      source_message_row_id: sourceMessage.id,
      source_kind: sourceMessage.kind || 'text',
      source_body: sourceMessage.body || messagePreviewForReply(sourceMessage),
      source_caption: sourceMessage.media?.caption || undefined,
      source_media_type:
        sourceMessage.kind === 'sticker'
          ? 'sticker'
          : sourceMessage.kind === 'audio'
            ? 'audio'
            : sourceMessage.kind || undefined,
    },
  });
  if (error) {
    throw new Error(await parseFunctionInvokeError(error, data));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deleteMessageForEveryone({ message, conversation, clienteId }) {
  if (!message?.id || !conversation?.chat_jid || !clienteId) {
    throw new Error('Mensagem ou conversa inválida.');
  }
  const { data, error } = await invokeUazapiSendMessage({
    body: {
      action: 'delete',
      message_id: message.uazapiMessageId || '',
      message_row_id: message.id,
      message_direction: message.direction || 'out',
      to: conversation.chat_jid,
      cliente_id: clienteId,
      whatsapp_config_id: conversation.whatsapp_config_id,
      conversation_id: conversation.id,
    },
  });
  if (error) {
    throw new Error(await parseFunctionInvokeError(error, data));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function syncMessageAckStatuses({ conversation, clienteId, messageRowIds }) {
  if (!conversation?.id || !clienteId) return { updated: 0 };
  const body = {
    action: 'sync_ack',
    cliente_id: clienteId,
    conversation_id: conversation.id,
    whatsapp_config_id: conversation.whatsapp_config_id,
  };
  if (messageRowIds?.length) body.message_row_ids = messageRowIds;
  const { data, error } = await invokeUazapiSendMessage({ body });
  if (error) {
    throw new Error(await parseFunctionInvokeError(error, data));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function buildReplyTarget(message) {
  if (!message) return null;
  return {
    id: message.id,
    uazapiMessageId: message.uazapiMessageId,
    senderName: message.direction === 'out' ? 'Você' : message.senderName || 'Contato',
    preview: messagePreviewForReply(message),
  };
}
