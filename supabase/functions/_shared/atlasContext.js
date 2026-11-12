import { AtlasError, memoriesForScope } from './atlasCore.js';

const text = (value, max = 1000) => (typeof value === 'string' ? value : JSON.stringify(value ?? '')).replace(/<[^>]*>/g, '').slice(0, max);

/** caller MUST be the JWT-scoped client, never a service-role client. */
export function createAtlasContextReader(caller, { ownerId, clientId, memories, activeClientIds = null }) {
  const query = async (q, signal) => {
    const { data, error } = await (signal ? q.abortSignal(signal) : q);
    if (error) throw new AtlasError('CONTEXT_UNAVAILABLE', 'Uma fonte do Planeje não pôde ser consultada. Atlas não vai tratá-la como vazia.', 502);
    return data || [];
  };
  const result = (section, rows, limit, extra = {}) => ({ section, scope: clientId || 'geral', queried_at: new Date().toISOString(), limit,
    limited_sample: true, note: 'Amostra limitada de registros visíveis ao usuário; não representa inventário completo.', records: rows, ...extra });
  const getTasks = async (signal) => {
    const statuses = await query(caller.from('task_statuses').select('value,label,is_terminal').limit(100), signal);
    const terminal = statuses.filter((s) => s.is_terminal === true).map((s) => s.value);
    const fields = 'id,title,status,client_id,assignee_ids,due_date,stage_due_at,production_delivered_at,post_date,project_id,plan_material_id,created_at';
    let open = caller.from('tarefas').select(fields).order('due_date', { ascending: true, nullsFirst: false }).limit(40);
    if (clientId) open = open.eq('client_id', clientId);
    else if(activeClientIds) open = open.in('client_id',activeClientIds);
    for (const status of terminal) open = open.neq('status', status);
    let closed = caller.from('tarefas').select(fields).order('created_at', { ascending: false }).limit(10);
    if (clientId) closed = closed.eq('client_id', clientId);
    else if(activeClientIds) closed = closed.in('client_id',activeClientIds);
    const [openRows, recentClosed] = await Promise.all([query(open, signal), terminal.length ? query(closed.in('status', terminal), signal) : Promise.resolve([])]);
    const rows = [...openRows, ...recentClosed];
    const peopleIds = [...new Set(rows.flatMap((r) => r.assignee_ids || []))].slice(0, 100);
    const people = peopleIds.length ? await query(caller.from('profiles').select('id,full_name').in('id', peopleIds).limit(100), signal) : [];
    let comments = [];
    if (clientId && rows.length) comments = await query(caller.from('task_comments').select('id,task_id,content,created_at').in('task_id', rows.map((r) => r.id)).order('created_at', { ascending: false }).limit(60), signal);
    return rows.map((r) => ({ ...r, title: text(r.title, 200), status_definition: statuses.find((s) => s.value === r.status) || null,
      people: people.filter((p) => r.assignee_ids?.includes(p.id)),
      explicit_blocks_consulted: Boolean(clientId),
      explicit_blocks: comments.filter((c) => c.task_id === r.id && /^(bloqueio|impedimento)\s*:/i.test(c.content || '')).map((c) => ({ id: c.id, content: text(c.content, 500), created_at: c.created_at })),
      source: { table: 'tarefas', id: r.id } }));
  };
  return async (section, { clientId: requestedClient, signal } = {}) => {
    if (requestedClient !== clientId) throw new AtlasError('SCOPE_CONFLICT', 'A ferramenta tentou mudar o escopo da conversa.', 403);
    if (section === 'memories') return result(section, memoriesForScope(memories, ownerId, clientId).map((m) => ({ id: m.id, content: m.content, client_id: m.client_id, version: m.version, source: m.source, learning_kind: m.learning_kind, evidence: m.evidence, source_quote: m.source_quote, created_at: m.created_at })), 60);
    if (section === 'tasks' || section === 'overview') return result(section, await getTasks(signal), 50, {
      selection: 'Até 40 tarefas não terminais por prazo e até 10 concluídas mais recentes. Status terminal usa a configuração do Planeje. Sem essa configuração, a amostra não separa conclusão.',
      blocks_note: clientId ? 'Comentários limitados a 60 registros recentes da amostra; apenas Bloqueio:/Impedimento: explícitos.' : 'Comentários de bloqueio não são consultados na visão geral; selecione um cliente para investigá-los.',
    });
    if (!clientId) return { section, available: false, reason: 'Selecione um cliente para consultar esta fonte detalhada. Nenhum cliente foi inferido.' };
    if (section === 'client') {
      const rows = await query(caller.from('clientes').select('id,empresa,nicho,etapa').eq('id', clientId).limit(1), signal);
      return result(section, rows.map((r) => ({ ...r, source: { table: 'clientes', id: r.id } })), 1);
    }
    if (section === 'documents') {
      const rows = await query(caller.from('client_documents').select('id,client_id,title,content').eq('client_id', clientId).order('id').limit(6), signal);
      return result(section, rows.map((r) => ({ id: r.id, title: text(r.title, 180), content: text(r.content, 1600), content_excerpt: true, source: { table: 'client_documents', id: r.id } })), 6);
    }
    if (section === 'meetings') {
      const meetings = await query(caller.from('cliente_reunioes').select('id,cliente_id,titulo,created_at').eq('cliente_id', clientId).order('created_at', { ascending: false }).limit(4), signal);
      const speech = meetings.length ? await query(caller.from('cliente_reuniao_falas').select('reuniao_id,nome,texto,ordem').in('reuniao_id', meetings.map((m) => m.id)).order('ordem').limit(45), signal) : [];
      return result(section, meetings.map((m) => ({ ...m, source: { table: 'cliente_reunioes', id: m.id },
        excerpt: speech.filter((s) => s.reuniao_id === m.id).map((s) => ({ name: text(s.nome, 80), text: text(s.texto, 400) })), transcript_limited: true })), 4);
    }
    if (section === 'plans') {
      const projects = await query(caller.from('projetos').select('id,name,client_id,status').eq('client_id', clientId).order('created_at', { ascending: false }).limit(6), signal);
      const plans = projects.length ? await query(caller.from('campaign_plans').select('id,project_id,materiais').in('project_id', projects.map((p) => p.id)).limit(6), signal) : [];
      return result(section, projects.map((p) => ({ ...p, source: { table: 'projetos', id: p.id },
        plans: plans.filter((x) => x.project_id === p.id).map((x) => ({ id: x.id, materials_excerpt: text(x.materiais, 1500) })) })), 6);
    }
    throw new AtlasError('TOOL_DENIED', 'Fonte não permitida nesta consulta.', 403);
  };
}
