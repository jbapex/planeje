import { supabase } from '@/lib/customSupabaseClient';
import { buildConversasUrl } from '@/lib/conversasRoutes';

export const CAIXA_FILAS = {
  PEDIDOS_INTERNOS: 'pedidos_internos',
  CLIENTE_SEM_RESPOSTA: 'cliente_sem_resposta',
  RESPONDIDO_HOJE: 'respondido_hoje',
};

export const CAIXA_ACOES = {
  ESTOU_NISSO: 'estou_nisso',
  FEITO: 'feito',
  NAO_E_COMIGO: 'nao_e_comigo',
  ARQUIVAR: 'arquivar',
};

export const EMPTY_CAIXA = {
  pessoa_id: null,
  badge_total: 0,
  contagem: {
    pedidos_internos: 0,
    cliente_sem_resposta: 0,
    respondido_hoje: 0,
  },
  itens: [],
};

export async function listarMinhaCaixa(pessoaId) {
  if (!pessoaId) return EMPTY_CAIXA;

  const { data, error } = await supabase.rpc('listar_pendencias_caixa', {
    p_pessoa_id: pessoaId,
  });

  if (error) throw error;
  return {
    ...EMPTY_CAIXA,
    ...(data || {}),
    contagem: { ...EMPTY_CAIXA.contagem, ...(data?.contagem || {}) },
    itens: Array.isArray(data?.itens) ? data.itens : [],
  };
}

export async function agirNaPendencia(id, acao) {
  const { data, error } = await supabase.rpc('agir_pendencia_caixa', {
    p_id: id,
    p_acao: acao,
  });
  if (error) throw error;
  return data;
}

export function hrefDaPendencia(item) {
  if (item?.origem === 'comentario' && item.task_id) {
    return `/tasks/list/${item.task_id}`;
  }
  if (item?.origem === 'conversa' && item.chat_jid) {
    return buildConversasUrl({
      statusTab: item.conversation_status || 'em_atendimento',
      chatJid: item.chat_jid,
      clienteId: item.cliente_id,
    });
  }
  return '/caixa';
}

