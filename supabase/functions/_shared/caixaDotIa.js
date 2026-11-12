/**
 * Prompt e ferramentas só leitura do Dot (Caixa).
 * Usado pela edge caixa-dot-ia e testado em scripts/caixaDotIa.test.mjs.
 */

export const DOT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ver_cliente',
      description:
        'Lê o cadastro resumido de um cliente da agência (empresa, etapa, nicho). Só leitura.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { type: 'string', description: 'UUID do cliente, se conhecido' },
          busca: { type: 'string', description: 'Nome da empresa para buscar' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_minhas_tarefas',
      description:
        'Lista tarefas abertas do colaborador dono do tópico (responsável ou criador). Só leitura.',
      parameters: {
        type: 'object',
        properties: {
          limite: { type: 'integer', description: 'Máximo de linhas (padrão 12, máx 25)' },
        },
      },
    },
  },
];

export function buildDotSystemPrompt({ ownerName, thread, contextoBase }) {
  const nome = String(ownerName || 'colaborador').trim() || 'colaborador';
  const titulo = String(thread?.title || 'Sem título').trim();
  const kind = String(thread?.kind || 'conversa');
  const href = thread?.href ? String(thread.href) : '';
  const clienteId = thread?.cliente_id ? String(thread.cliente_id) : '';
  const taskId = thread?.task_id ? String(thread.task_id) : '';

  return [
    'Você é o Dot, assistente interno da agência no Planeje (Minha caixa).',
    `Você fala com ${nome}. Responda em português do Brasil, curto e direto.`,
    'Não invente dados. Se não souber, diga o que falta e peça confirmação.',
    'Não envie WhatsApp, não dispare CAPI, não altere tarefas sozinho.',
    'Tarefas continua sendo o motor de execução: você só orienta e aponta links internos (#/...).',
    'Use as ferramentas só leitura quando precisar de cliente ou tarefas do colaborador.',
    '',
    'Tópico atual:',
    `- título: ${titulo}`,
    `- tipo: ${kind}`,
    clienteId ? `- cliente_id: ${clienteId}` : '- cliente_id: (nenhum)',
    taskId ? `- task_id: ${taskId}` : '- task_id: (nenhum)',
    href ? `- link: ${href}` : '- link: (nenhum)',
    '',
    'Contexto já carregado:',
    String(contextoBase || '(vazio)').slice(0, 4000),
  ].join('\n');
}

export function historicoParaMensagens(messages, { max = 24 } = {}) {
  const rows = Array.isArray(messages) ? messages.slice(-max) : [];
  return rows
    .map((m) => {
      const role = m?.role;
      const body = String(m?.body || '').trim();
      if (!body) return null;
      if (role === 'user') return { role: 'user', content: body };
      if (role === 'dot') return { role: 'assistant', content: body };
      if (role === 'system') return { role: 'user', content: `[Sistema] ${body}` };
      return null;
    })
    .filter(Boolean);
}

export function parseToolCallArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const text = String(raw || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function sanitizeDotReply(text) {
  const clean = String(text || '')
    .replace(/\u0000/g, '')
    .trim();
  if (!clean) return '';
  return clean.slice(0, 4000);
}

export function formatClienteResumo(row) {
  if (!row) return 'Cliente não encontrado.';
  const parts = [
    `empresa: ${row.empresa || '—'}`,
    row.etapa ? `etapa: ${row.etapa}` : null,
    row.nicho ? `nicho: ${row.nicho}` : null,
    row.id ? `id: ${row.id}` : null,
  ].filter(Boolean);
  return parts.join(' | ');
}

export function formatTarefasResumo(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 'Nenhuma tarefa aberta encontrada.';
  return list
    .map((t, i) => {
      const titulo = String(t.title || 'Sem título').slice(0, 80);
      const status = t.status || '—';
      const due = t.due_date ? String(t.due_date).slice(0, 10) : 'sem prazo';
      const empresa = t.clientes?.empresa || t.empresa || '';
      return `${i + 1}. ${titulo} · ${status} · ${due}${empresa ? ` · ${empresa}` : ''} · id ${t.id}`;
    })
    .join('\n');
}
