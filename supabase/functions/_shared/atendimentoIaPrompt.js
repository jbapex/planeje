/**
 * Monta o prompt dos agentes de IA do Atendimento da loja.
 * Usado pela função atendimento-ia (Deno) e testado em scripts/atendimentoIaPrompt.test.mjs.
 */

export const IA_TONS = {
  cordial: 'cordial e acolhedor, frases curtas, sem gírias',
  formal: 'formal e objetivo, tratando por "você" com cortesia',
  descontraido: 'leve e próximo, pode usar um emoji quando couber',
};

export const IA_MAX_BASE_CHARS = 24000;
export const IA_MAX_HISTORICO = 20;

export const IA_FUNIL_ACTION_JSON = '{"action":"transfer","reason":"qualificado"}';
export const IA_FUNIL_MARK_START = '<!--funil-ia-->';
export const IA_FUNIL_MARK_END = '<!--/funil-ia-->';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function emptyFollowup() {
  return { ativo: false, passos: [] };
}

/** Padrão desligado: o administrador liga e edita o texto. Não envia sozinho. */
export function defaultFollowupNoivas() {
  return {
    ativo: false,
    passos: [
      {
        horas: 4,
        mensagem:
          'Oi! Vi que você ficou na conversa. Quando puder, me conta o nome da loja e a cidade que eu te passo para o atendente da Ápice.',
      },
      {
        horas: 24,
        mensagem:
          'Passando só para lembrar: se ainda quiser conhecer os serviços da Ápice para a loja, é só responder aqui.',
      },
    ],
  };
}

export function clampFollowupHoras(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 4;
  const capped = Math.min(168, Math.max(0.25, n));
  return Math.round(capped * 4) / 4;
}

export function normalizeFollowup(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const passos = (Array.isArray(src.passos) ? src.passos : [])
    .map((p) => ({
      horas: clampFollowupHoras(p?.horas),
      mensagem: String(p?.mensagem || '').trim().slice(0, 500),
    }))
    .filter((p) => p.mensagem)
    .slice(0, 3);
  return {
    ativo: src.ativo === true && passos.length > 0,
    passos,
  };
}

export const IA_FUNCOES = ['qualificar', 'relatorios', 'suporte'];
export const IA_FUNCAO_DEFAULT = 'qualificar';

const IA_REGRAS_VOZ =
  'Se souber o nome do WhatsApp, cumprimente por ele e NÃO pergunte "como te chamar" — esse nome não é o da loja. A Ápice é agência de lojas de noivas e festas: o cliente é a loja, não a noiva. Uma pergunta por mensagem. Nunca invente nicho (noivas/festas), papel na loja nem que já sabem o serviço. Não ofereça ligação. Não repita pergunta já respondida.';

export function normalizeFuncao(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return IA_FUNCOES.includes(v) ? v : IA_FUNCAO_DEFAULT;
}

export function emptyFunil() {
  return {
    funcao: IA_FUNCAO_DEFAULT,
    perguntas: [],
    criterio: '',
    destino_tipo: 'proximo',
    destino_setor_id: null,
    mensagem_transicao: '',
    followup: emptyFollowup(),
  };
}

/** Padrão da Ápice: agência de lojas de noivas e festas (editável). Não é loja que vende vestido. */
export function defaultFunilNoivas() {
  return {
    funcao: 'qualificar',
    perguntas: [
      'Qual é o nome da loja?',
      'Em qual cidade a loja fica?',
      'O nicho é noivas, festas ou os dois?',
      'Já tem atendimento, WhatsApp ou tráfego rodando?',
      'O que busca agora: leads, Mini CRM ou anúncio?',
      'Quer conversar com um atendente da Ápice?',
    ],
    criterio: 'informou nome da loja (ou que é interessado no serviço), cidade e nicho (noivas, festas ou os dois)',
    destino_tipo: 'proximo',
    destino_setor_id: null,
    mensagem_transicao: 'Vou te passar para o atendente da Ápice agora. Ele segue com o que a loja precisa.',
    followup: defaultFollowupNoivas(),
  };
}

export function defaultFunilRelatorios() {
  return {
    funcao: 'relatorios',
    perguntas: [
      'Qual é o nome da loja?',
      'Qual campanha ou período você quer conferir?',
      'Precisa de métricas, do que já foi entregue ou das próximas ações?',
      'Quer que eu passe para o atendente da Ápice seguir com o relatório?',
    ],
    criterio: 'informou o nome da loja e o que precisa (métricas, entregas ou próximas ações)',
    destino_tipo: 'proximo',
    destino_setor_id: null,
    mensagem_transicao: 'Vou te passar para o atendente da Ápice agora. Ele segue com o relatório e as próximas ações da loja.',
    followup: defaultFollowupNoivas(),
  };
}

export function defaultFunilSuporte() {
  return {
    funcao: 'suporte',
    perguntas: [
      'Qual é o nome da loja?',
      'O pedido é briefing, ajuste de campanha ou alinhamento com o time?',
      'O que a loja precisa agora, em uma frase?',
      'Quer conversar com o atendente da Ápice para alinhar?',
    ],
    criterio: 'informou o nome da loja e o que precisa (briefing, ajuste ou alinhamento)',
    destino_tipo: 'proximo',
    destino_setor_id: null,
    mensagem_transicao: 'Vou te passar para o atendente da Ápice agora. Ele alinha com o time o que a loja pediu.',
    followup: defaultFollowupNoivas(),
  };
}

export function defaultFunilPorFuncao(funcao) {
  const f = normalizeFuncao(funcao);
  if (f === 'relatorios') return defaultFunilRelatorios();
  if (f === 'suporte') return defaultFunilSuporte();
  return defaultFunilNoivas();
}

export const IA_OBJETIVO_NOIVAS = 'Qualificar a loja (noivas/festas) ou o interessado no serviço da agência e passar para o atendente da Ápice';
export const IA_OBJETIVO_RELATORIOS =
  'Informar a loja cliente sobre métricas, entregas e próximas ações e, quando precisar, passar para o atendente da Ápice';
export const IA_OBJETIVO_SUPORTE =
  'Atender a loja cliente em contas ativas, coletar briefing e alinhar com o time, passando para o atendente da Ápice quando precisar';
export const IA_INSTRUCOES_NOIVAS = `${IA_REGRAS_VOZ} Se pedirem serviços, duas frases e uma pergunta. Qualifique e passe para o atendente da Ápice. Não venda vestido, prova nem espaço.`;
export const IA_INSTRUCOES_RELATORIOS = `${IA_REGRAS_VOZ} Fale de métricas, entregas e próximas ações da loja já cliente. Nunca invente número. Se não souber, passe para o atendente da Ápice. Não venda vestido, prova nem espaço.`;
export const IA_INSTRUCOES_SUPORTE = `${IA_REGRAS_VOZ} Atenda a loja cliente: briefing, ajuste e alinhamento com o time. Passe para o atendente da Ápice quando o pedido estiver claro. Não venda vestido, prova nem espaço.`;

export const IA_FUNCAO_CARDS = [
  {
    key: 'qualificar',
    title: 'Qualificar a loja',
    badge: 'Popular',
    hint: 'Apresenta os serviços da agência, cases de sucesso e qualifica a loja ou o interessado para o atendente da Ápice.',
    ideal: 'Agência de lojas de noivas e festas em captação.',
  },
  {
    key: 'relatorios',
    title: 'Relatórios & Resultados',
    hint: 'Informa a loja cliente sobre métricas da campanha, entregas realizadas e próximas ações.',
    ideal: 'Lojas já clientes da Ápice, em gestão contínua.',
  },
  {
    key: 'suporte',
    title: 'Suporte a Clientes',
    hint: 'Atende solicitações da loja cliente, coleta briefings e alinha expectativas com o time.',
    ideal: 'Lojas com operação ativa de contas na Ápice.',
  },
];

export function objetivoPorFuncao(funcao) {
  const f = normalizeFuncao(funcao);
  if (f === 'relatorios') return IA_OBJETIVO_RELATORIOS;
  if (f === 'suporte') return IA_OBJETIVO_SUPORTE;
  return IA_OBJETIVO_NOIVAS;
}

export function instrucoesPorFuncao(funcao) {
  const f = normalizeFuncao(funcao);
  if (f === 'relatorios') return IA_INSTRUCOES_RELATORIOS;
  if (f === 'suporte') return IA_INSTRUCOES_SUPORTE;
  return IA_INSTRUCOES_NOIVAS;
}

export function funcaoFunilLabel(funil) {
  const f = normalizeFunil(funil).funcao;
  if (f === 'relatorios') return 'Relatórios';
  if (f === 'suporte') return 'Suporte';
  return 'Qualificar';
}

/**
 * Troca a função do agente. Agente novo: objetivo, instruções e perguntas/criterio/transição do modelo.
 * Agente já gravado: só o card e o objetivo — as perguntas salvas ficam.
 */
export function aplicarFuncaoNoAgente(agente, funcao) {
  const next = normalizeFuncao(funcao);
  const atual = normalizeFunil(agente?.funil);
  if (agente?.id) {
    return {
      ...agente,
      objetivo: objetivoPorFuncao(next),
      funil: { ...atual, funcao: next },
    };
  }
  const tpl = defaultFunilPorFuncao(next);
  return {
    ...agente,
    objetivo: objetivoPorFuncao(next),
    instrucoes: instrucoesPorFuncao(next),
    funil: {
      ...atual,
      funcao: next,
      perguntas: tpl.perguntas,
      criterio: tpl.criterio,
      mensagem_transicao: tpl.mensagem_transicao,
    },
  };
}

/** Normaliza o funil gravado no agente (jsonb). Sem coluna SQL: funcao vive dentro do funil. */
export function normalizeFunil(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const perguntas = (Array.isArray(src.perguntas) ? src.perguntas : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((p) => p.slice(0, 240));
  const destino_tipo = src.destino_tipo === 'setor' ? 'setor' : 'proximo';
  const sid = String(src.destino_setor_id || '').trim();
  return {
    funcao: normalizeFuncao(src.funcao),
    perguntas,
    criterio: String(src.criterio || '').trim().slice(0, 500),
    destino_tipo,
    destino_setor_id: destino_tipo === 'setor' && UUID_RE.test(sid) ? sid : null,
    mensagem_transicao: String(src.mensagem_transicao || '').trim().slice(0, 500),
    followup: normalizeFollowup(src.followup),
  };
}

export function funilTemEtapas(funil) {
  const f = normalizeFunil(funil);
  return f.perguntas.length > 0 || Boolean(f.criterio);
}

export function destinoFunilLabel(funil, setores = []) {
  const f = normalizeFunil(funil);
  if (f.destino_tipo === 'setor' && f.destino_setor_id) {
    const s = (setores || []).find((x) => x.id === f.destino_setor_id);
    return s?.nome ? `o setor ${s.nome}` : 'o setor escolhido';
  }
  return 'o próximo atendente';
}

export function funilPromptBlock(funil, { setorNome } = {}) {
  const f = normalizeFunil(funil);
  if (!funilTemEtapas(f)) return '';
  const dest =
    f.destino_tipo === 'setor'
      ? setorNome
        ? `o setor ${setorNome} (atendente da Ápice)`
        : 'o setor do atendente da Ápice'
      : 'o próximo atendente da Ápice';
  const perguntas = f.perguntas.length
    ? f.perguntas.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : '(pergunte o necessário para o critério abaixo)';
  const transicao = f.mensagem_transicao || `Vou te passar para ${dest} agora.`;
  const comum = [
    'A Ápice é agência de lojas de noivas e festas. O contato pode ser dono de loja ou interessado no serviço da agência. Não atenda como loja que vende vestido, como e-commerce genérico nem como suporte técnico. Quem assume depois de qualificar é o atendente da Ápice (nunca "suporte").',
    'Como conversar (obrigatório): uma pergunta por mensagem; leia o histórico e NÃO repita o que já foi dito; o nome do WhatsApp NÃO é o nome da loja; nunca invente nicho (noivas/festas), cargo na loja ou que a pessoa já tem "loja de festas"; não ofereça ligação, call, Meet ou telefone salvo se as instruções pedirem; se pedirem os serviços, no máximo duas frases e uma pergunta — não despeje catálogo.',
    'Etapas do atendimento (obrigatório):',
  ];
  const fechar = [
    `2) No mesmo turno em que o critério fechar, PARE. Não ofereça prova de vestido. Avise que vai passar para ${dest}. Pode usar esta ideia: ${transicao}`,
    'Na última linha da sua resposta, sozinha, escreva exatamente:',
    IA_FUNIL_ACTION_JSON,
  ];
  if (f.funcao === 'relatorios') {
    return [
      ...comum,
      '1) Informe a loja já cliente sobre métricas, entregas e próximas ações. O roteiro abaixo é só ajuda. Pergunte só o que ainda falta, na ordem, uma de cada vez. Nunca invente número de campanha, investimento, alcance ou resultado. Se não tiver o dado, diga que o atendente da Ápice explica. Não abra Mini CRM paralelo nem invente status de lead.',
      perguntas,
      f.criterio
        ? `Está pronto para passar quando: ${f.criterio}`
        : 'Está pronto para passar quando o nome da loja e o que precisa (métricas, entregas ou próximas ações) estiverem claros.',
      'Nunca invente produto, vestido, prova ou espaço. Nunca atrase a transferência esperando extra.',
      ...fechar,
      'Se ainda faltar o nome da loja ou o que precisa no relatório, continue perguntando e NÃO escreva essa linha JSON. Nunca invente que passou se o critério não fechou.',
    ].join('\n');
  }
  if (f.funcao === 'suporte') {
    return [
      ...comum,
      '1) Atenda a loja cliente (conta ativa): colete briefing e alinhe com o time. O roteiro abaixo é só ajuda. Pergunte só o que ainda falta, na ordem, uma de cada vez. Não invente nicho, vestido, prova nem produto. Não ofereça ligação.',
      perguntas,
      f.criterio
        ? `Está pronto para passar quando: ${f.criterio}`
        : 'Está pronto para passar quando o nome da loja e o pedido (briefing, ajuste ou alinhamento) estiverem claros.',
      'Nunca invente produto, vestido, prova ou espaço. Nunca atrase a transferência esperando extra.',
      ...fechar,
      'Se ainda faltar o nome da loja ou o que a loja precisa, continue perguntando e NÃO escreva essa linha JSON. Nunca invente que passou se o critério não fechou.',
    ].join('\n');
  }
  return [
    ...comum,
    '1) Qualificar a loja ou o interessado. O roteiro abaixo é só ajuda. Pergunte só o que ainda falta, na ordem, uma de cada vez. Se já disseram nome da loja (ou que quer o serviço), cidade e nicho (noivas, festas ou os dois) — mesmo na primeira mensagem — o critério JÁ fechou: não peça confirmação e não faça a próxima pergunta.',
    perguntas,
    f.criterio
      ? `Está qualificado quando: ${f.criterio}`
      : 'Está qualificado quando nome da loja (ou interesse no serviço), cidade e nicho (noivas/festas) estiverem claros.',
    'Atendimento/WhatsApp/tráfego e o que busca (leads, Mini CRM, anúncio) são extras. Pode citar um deles só se o critério ainda não fechou. Nunca invente produto, vestido, prova ou espaço. Nunca atrase a transferência esperando extra.',
    ...fechar,
    'Se ainda faltar nome da loja (ou o interesse), cidade ou nicho, continue perguntando e NÃO escreva essa linha JSON. Nunca invente que passou se o critério não fechou.',
  ].join('\n');
}

export function stripFunilInstrucoes(texto) {
  const raw = String(texto || '');
  const start = raw.indexOf(IA_FUNIL_MARK_START);
  const end = raw.indexOf(IA_FUNIL_MARK_END);
  if (start >= 0 && end > start) {
    return `${raw.slice(0, start)}${raw.slice(end + IA_FUNIL_MARK_END.length)}`.trim();
  }
  return raw.trim();
}

/** Espelha o funil nas instruções para a função atendimento-ia atual (ela ainda lê só instrucoes). */
export function withFunilInstrucoes(instrucoes, funil, opts = {}) {
  const base = stripFunilInstrucoes(instrucoes);
  const block = funilPromptBlock(funil, opts);
  if (!block) return base;
  return `${base}\n\n${IA_FUNIL_MARK_START}\n${block}\n${IA_FUNIL_MARK_END}`.trim();
}

/** Tira o JSON de ação do texto visível. Sugerir e a área de teste usam o restante. */
export function parseIaAction(texto) {
  const raw = String(texto || '');
  const patterns = [
    /\{\s*"action"\s*:\s*"([^"]+)"\s*,\s*"reason"\s*:\s*"([^"]*)"\s*\}/g,
    /\{\s*"reason"\s*:\s*"([^"]*)"\s*,\s*"action"\s*:\s*"([^"]+)"\s*\}/g,
  ];
  let last = null;
  let swapped = false;
  for (const re of patterns) {
    let match;
    while ((match = re.exec(raw))) {
      last = match;
      swapped = re === patterns[1];
    }
    if (last) break;
  }
  if (!last) return { texto: raw.trim(), action: null, reason: '' };
  const action = String(swapped ? last[2] : last[1] || '').trim();
  const reason = String(swapped ? last[1] : last[2] || '').trim();
  const textoLimpo = `${raw.slice(0, last.index)}${raw.slice(last.index + last[0].length)}`
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { texto: textoLimpo, action, reason };
}

/**
 * Decisão determinística do funil (sem chamar a IA): incompleto continua perguntando;
 * com respostas suficientes ou JSON de transfer, passa para o atendente.
 */
export function proximaAcaoFunil(funil, mensagens = []) {
  const f = normalizeFunil(funil);
  const lista = Array.isArray(mensagens) ? mensagens : [];
  const lastAssist = [...lista].reverse().find((m) => m?.role === 'assistant');
  if (lastAssist) {
    const parsed = parseIaAction(lastAssist.content);
    if (parsed.action === 'transfer') {
      return {
        etapa: 'aguardando_atendente',
        action: 'transfer',
        reason: parsed.reason || 'qualificado',
        proximaPergunta: null,
      };
    }
  }
  if (!funilTemEtapas(f)) {
    return { etapa: 'livre', action: 'continuar', reason: '', proximaPergunta: null };
  }
  const userTurns = lista.filter((m) => m?.role === 'user' && String(m.content || '').trim());
  const textoUser = userTurns.map((m) => String(m.content || '')).join(' ').toLowerCase();
  if (f.funcao === 'qualificar') {
    const temLoja = /loja|atelier|ateliê|interessad/.test(textoUser);
    const temCidade = /\bem\s+[a-záéíóúãõâêôç]{3,}/i.test(textoUser) || /cidade/.test(textoUser);
    const temNicho = /noivas?|festas?|os dois/.test(textoUser);
    if (temLoja && temCidade && temNicho) {
      return { etapa: 'aguardando_atendente', action: 'transfer', reason: 'qualificado', proximaPergunta: null };
    }
  }
  const precisa = f.perguntas.length > 0 ? Math.min(f.perguntas.length, 3) : 1;
  if (userTurns.length < precisa) {
    return {
      etapa: 'qualificando',
      action: 'perguntar',
      reason: '',
      proximaPergunta: f.perguntas[Math.min(userTurns.length, Math.max(f.perguntas.length - 1, 0))] || null,
    };
  }
  return { etapa: 'aguardando_atendente', action: 'transfer', reason: 'qualificado', proximaPergunta: null };
}

export function buildSystemPrompt({ agente, bases = [], lojaNome = '', contatoNome = '', setorNome = '' } = {}) {
  const tom = IA_TONS[agente?.tom] || IA_TONS.cordial;
  const funil = normalizeFunil(agente?.funil);
  const instrucoes = stripFunilInstrucoes(agente?.instrucoes);
  const partes = [
    `Você é ${agente?.nome || 'o assistente'} e atende pelo WhatsApp em nome da agência ${lojaNome || 'Ápice'}.`,
    agente?.objetivo ? `Objetivo: ${agente.objetivo}` : 'Objetivo: qualificar a loja ou o interessado no serviço da agência e passar para o atendente da Ápice.',
    `Tom: ${tom}. Responda em português do Brasil, em até 3 parágrafos curtos, como mensagem de WhatsApp de agência de lojas de noivas e festas. Prefira 1 parágrafo e uma pergunta.`,
    'Use só as informações da agência abaixo e da conversa. Se não souber (preço, prazo, o que o Planeje cobre), diga que o atendente da Ápice explica; nunca invente vestido, prova, espaço nem produto.',
    'Não peça dados sensíveis (senha, cartão). Não prometa desconto nem condição que não esteja nas informações. Não ofereça ligação, call ou telefone.',
    contatoNome
      ? `O contato já se chama ${contatoNome} no WhatsApp. Cumprimente por esse nome e NÃO pergunte como te chamar. Esse nome NÃO é o nome da loja.`
      : 'Se o contato ainda não disse o nome, pode perguntar. Não invente um nome.',
    instrucoes ? `Instruções da loja:\n${instrucoes}` : '',
    funilPromptBlock(funil, { setorNome }),
  ];
  let restante = IA_MAX_BASE_CHARS;
  const blocos = [];
  for (const base of bases) {
    const texto = String(base?.conteudo || '').trim();
    if (!texto || restante <= 0) continue;
    const corte = texto.slice(0, restante);
    restante -= corte.length;
    blocos.push(`### ${base.nome || 'Base'}\n${corte}`);
  }
  if (blocos.length) partes.push(`Informações da loja:\n${blocos.join('\n\n')}`);
  return partes.filter(Boolean).join('\n\n');
}

/** Saída da loja com *Atendente:* não é fala da IA. */
export function textoEnviadoParaHistorico(texto) {
  const raw = String(texto || '').trim();
  const m = raw.match(/^\*([^*]{1,40}):\*?\s*([\s\S]*)$/);
  if (m) {
    const corpo = String(m[2] || '').trim();
    return corpo ? `(O atendente da loja escreveu) ${corpo}` : '(O atendente da loja escreveu)';
  }
  return raw;
}

/** Linhas de inbox (contato) e enviados (loja) → mensagens do chat, em ordem, últimas N. */
export function historicoParaMensagens({ inboxRows = [], sentRows = [], limite = IA_MAX_HISTORICO } = {}) {
  const itens = [];
  for (const row of inboxRows) {
    const texto = String(row?.body || '').trim();
    if (!texto) continue;
    itens.push({ role: 'user', content: texto, at: row.msg_timestamp || row.created_at || '' });
  }
  for (const row of sentRows) {
    const texto = textoEnviadoParaHistorico(row?.body);
    if (!texto) continue;
    itens.push({ role: 'assistant', content: texto, at: row.created_at || '' });
  }
  itens.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return itens.slice(-limite).map(({ role, content }) => ({ role, content }));
}

/** Mensagens da área de teste: só user/assistant, texto limitado, últimas N. */
export function mensagensDeTeste(lista = [], limite = IA_MAX_HISTORICO) {
  return (Array.isArray(lista) ? lista : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && String(m?.content || '').trim())
    .slice(-limite)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
}

/** Escolhe o agente: o pedido (se ativo), senão o ativo do setor da conversa, senão o primeiro ativo. */
export function escolherAgente(agentes = [], { agenteId = null, setorId = null, soAutoResponder = false } = {}) {
  const ativos = agentes.filter((a) => a?.ativo && (!soAutoResponder || a.auto_responder === true));
  if (agenteId) return ativos.find((a) => a.id === agenteId) || null;
  if (setorId) {
    const doSetor = ativos.find((a) => (a.setor_ids || []).includes(setorId));
    if (doSetor) return doSetor;
  }
  return ativos.find((a) => !(a.setor_ids || []).length) || ativos[0] || null;
}
