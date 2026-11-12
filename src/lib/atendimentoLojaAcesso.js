/**
 * Atendimento da loja: níveis e permissões.
 * Inbox do login: página `atendimento` em Páginas Permitidas (padrão: só Ápice com
 * allowed_pages nulo). IA automática segue a lista Ápice / módulo, não o tick da página.
 * Espelhada em supabase/functions/_shared/atendimentoLojaAcesso.ts e nas funções SQL
 * cliente_atend_* — manter iguais.
 */

export const ATENDIMENTO_LOJA_CLIENTE_IDS = ['a2396b48-2d2f-4b4b-adfd-3a4043b320e6'];
export const ATENDIMENTO_PAGE_KEY = 'atendimento';

export const ATENDIMENTO_NIVEIS = ['admin', 'supervisor', 'atendente'];

export const ATENDIMENTO_NIVEL_LABEL = {
  admin: 'Administrador da loja',
  supervisor: 'Supervisor',
  atendente: 'Atendente',
};

export const ATENDIMENTO_NIVEL_DESCRICAO = {
  admin: 'Tudo: vê todas as conversas (inclusive privadas), usuários, setores, etiquetas, respostas e agentes de IA.',
  supervisor:
    'Vê todas as conversas não privadas, transfere e configura respostas rápidas, etiquetas e setores. Não mexe em usuários nem em IA.',
  atendente:
    'Vê só as conversas atribuídas a ele ou do seu setor, envia mensagem e nota. Sem configurações.',
};

const PERMISSOES = {
  admin: {
    verTodas: true,
    verPrivadas: true,
    enviar: true,
    transferir: true,
    configurarRespostas: true,
    configurarEtiquetas: true,
    configurarSetores: true,
    gerenciarUsuarios: true,
    configurarIA: true,
    usarIA: true,
  },
  supervisor: {
    verTodas: true,
    verPrivadas: false,
    enviar: true,
    transferir: true,
    configurarRespostas: true,
    configurarEtiquetas: true,
    configurarSetores: true,
    gerenciarUsuarios: false,
    configurarIA: false,
    usarIA: true,
  },
  atendente: {
    verTodas: false,
    verPrivadas: false,
    enviar: true,
    transferir: true,
    configurarRespostas: false,
    configurarEtiquetas: false,
    configurarSetores: false,
    gerenciarUsuarios: false,
    configurarIA: false,
    usarIA: true,
  },
};

const SEM_PERMISSAO = Object.freeze(
  Object.fromEntries(Object.keys(PERMISSOES.admin).map((key) => [key, false]))
);

/**
 * Sem override: só a lista padrão (Ápice). Com boolean, vale o gravado
 * (módulo legado ou página permitida já conferida).
 */
export function isAtendimentoLojaHabilitada(clienteId, enabledOverride) {
  const id = String(clienteId || '').trim().toLowerCase();
  if (!id) return false;
  if (typeof enabledOverride === 'boolean') return enabledOverride;
  return ATENDIMENTO_LOJA_CLIENTE_IDS.includes(id);
}

function allowedPagesHasKey(allowedPages, key) {
  if (!Array.isArray(allowedPages)) return false;
  return allowedPages.map((item) => String(item || '').trim()).includes(key);
}

/**
 * Login da loja vê/envia na inbox se a página Atendimento estiver na lista.
 * allowed_pages nulo: só Ápice (quem já via). Outra loja fica off até o tick.
 */
export function hasAtendimentoPagePermission(allowedPages, clienteId, enabledOverride) {
  if (typeof enabledOverride === 'boolean') return enabledOverride;
  if (allowedPagesHasKey(allowedPages, ATENDIMENTO_PAGE_KEY)) return true;
  if (allowedPages === null || allowedPages === undefined) {
    return isAtendimentoLojaHabilitada(clienteId);
  }
  return false;
}

/** Nível efetivo do membro (null se inativo, sem linha ou de outra loja). */
export function nivelEfetivo(membro, clienteId, options = {}) {
  const habilitada =
    typeof options.lojaHabilitada === 'boolean'
      ? options.lojaHabilitada
      : isAtendimentoLojaHabilitada(clienteId);
  if (!habilitada) return null;
  if (options.implicitAdmin) return 'admin';
  if (!membro || membro.ativo === false) return null;
  if (membro.cliente_id && String(membro.cliente_id) !== String(clienteId)) return null;
  return ATENDIMENTO_NIVEIS.includes(membro.nivel) ? membro.nivel : null;
}

export function permissoesDoNivel(nivel) {
  return PERMISSOES[nivel] || SEM_PERMISSAO;
}

export function podeAbrirConfiguracao(nivel) {
  const p = permissoesDoNivel(nivel);
  return p.gerenciarUsuarios || p.configurarRespostas || p.configurarIA;
}

/**
 * Mesma regra de cliente_atend_pode_ver_contato_de: admin vê tudo; supervisor tudo menos
 * privada de outro; atendente só atribuída a ele ou do seu setor (não privada).
 */
export function podeVerConversa({ nivel, userId, conversa, setorIds = [] } = {}) {
  if (!nivel) return false;
  if (nivel === 'admin') return true;
  const assigned = conversa?.assigned_to || null;
  if (nivel === 'supervisor') {
    return !(conversa?.privado && assigned !== userId);
  }
  if (!conversa) return false;
  if (assigned && assigned === userId) return true;
  if (conversa.privado) return false;
  return Boolean(conversa.setor_id) && (setorIds || []).includes(conversa.setor_id);
}

/**
 * Envio pelo cliente da loja com a página Atendimento (texto e mídia). Ações
 * (reagir, encaminhar, apagar, sync) continuam só da equipe. O cliente_id vem
 * do perfil no servidor; destino precisa ser contato da mesma loja.
 */
export function canClienteSendAtendimento({
  role,
  profileClienteId,
  targetClienteId,
  membro,
  isAction = false,
  lojaHabilitada,
  implicitAdmin = false,
  allowedPages,
} = {}) {
  if (role !== 'cliente') return false;
  if (isAction) return false;
  const profileId = String(profileClienteId || '').trim();
  const targetId = String(targetClienteId || '').trim();
  if (!profileId || !targetId || profileId !== targetId) return false;
  const paginaOk = hasAtendimentoPagePermission(allowedPages, profileId, lojaHabilitada);
  const nivel = nivelEfetivo(membro, profileId, { lojaHabilitada: paginaOk, implicitAdmin });
  return Boolean(nivel) && permissoesDoNivel(nivel).enviar;
}

/**
 * Caixas como no Umbler Talk: Esperando = conversa aberta cuja última mensagem é do contato
 * (ou marcada à mão); Entrada = aberta e já respondida pela loja; as duas podem valer juntas.
 * Finalizada sai das duas; mensagem nova do contato depois de finalizar reabre.
 */
export function caixasDaConversa({ conversa, lastInboundAt, lastOutboundAt } = {}) {
  const inbound = lastInboundAt ? new Date(lastInboundAt).getTime() : 0;
  const outbound = lastOutboundAt ? new Date(lastOutboundAt).getTime() : 0;
  const statusAt = conversa?.status_at ? new Date(conversa.status_at).getTime() : 0;
  const reaberta = Boolean(inbound && inbound > statusAt);
  if (conversa?.status === 'finalizado' && !reaberta) {
    return { entrada: false, esperando: false, finalizados: true, reaberta: false };
  }
  const respondida = Boolean(outbound);
  const aguardando = Boolean(inbound && inbound > outbound);
  const marcada = conversa?.status === 'esperando' && !(outbound && outbound > statusAt);
  return {
    entrada: respondida,
    esperando: aguardando || marcada || !respondida,
    finalizados: false,
    reaberta: conversa?.status === 'finalizado' && reaberta,
  };
}

/** Caixa principal (a mais urgente) para rótulos e testes. */
export function caixaDaConversa(args = {}) {
  const caixas = caixasDaConversa(args);
  if (caixas.finalizados) return 'finalizados';
  if (caixas.esperando) return 'esperando';
  return 'entrada';
}

export function normalizeAtalho(value) {
  return String(value || '')
    .trim()
    .replace(/^\//, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);
}

/** Texto do compositor começando com /atalho → termo buscado (sem a barra). */
export function atalhoDigitado(text) {
  const match = /^\/([a-z0-9_-]*)$/i.exec(String(text || ''));
  return match ? match[1].toLowerCase() : null;
}
