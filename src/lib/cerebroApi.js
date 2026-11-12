import { supabase } from '@/lib/customSupabaseClient';
import {
  AGENTES,
  DEFAULT_SETTINGS,
  confirmMemory,
  correctMemory,
  montarAvisoCaixa,
  normalizeText,
  notaParaFonte,
  parseItensNota,
  revokeMemory,
  runMission,
} from '@/lib/cerebroCore';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function tabelaAusente(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /schema cache|does not exist|could not find the table/i.test(msg);
}

function isUuid(value) {
  return UUID.test(String(value || ''));
}

export function actorDe(user, profile, clientesPermitidos) {
  const papel = profile?.role || 'colaborador';
  const areas = ['equipe'];
  if (papel === 'admin' || papel === 'superadmin') areas.push('financeiro', 'rh');
  return {
    id: user.id,
    papel,
    areas,
    clientesPermitidos: papel === 'admin' || papel === 'superadmin' ? null : (clientesPermitidos || []),
  };
}

async function clientesDoColaborador(userId) {
  const ids = new Set();
  const tarefas = await supabase.from('tarefas').select('client_id').contains('assignee_ids', [userId]).limit(500);
  if (!tarefas.error) {
    for (const row of tarefas.data || []) if (row.client_id) ids.add(row.client_id);
  }
  const responsavel = await supabase.from('clientes').select('id').eq('responsavel', userId).limit(200);
  if (!responsavel.error) {
    for (const row of responsavel.data || []) ids.add(row.id);
  }
  return [...ids];
}

export async function carregarBase(user, profile) {
  const settingsRes = await supabase.from('brain_settings').select('*').eq('id', 'jbapex').maybeSingle();
  if (tabelaAusente(settingsRes.error)) {
    return {
      disponivel: false,
      settings: { ...DEFAULT_SETTINGS },
      agentes: AGENTES,
      clientes: [],
      memorias: [],
      historico: [],
      acoes: [],
    };
  }
  if (settingsRes.error) throw settingsRes.error;

  const papel = profile?.role;
  const permitidos = papel === 'colaborador' ? await clientesDoColaborador(user.id) : null;
  let clientesQuery = supabase.from('clientes').select('id, empresa').order('empresa').limit(300);
  if (permitidos) {
    if (!permitidos.length) {
      return {
        disponivel: true,
        settings: settingsRes.data || { ...DEFAULT_SETTINGS },
        agentes: AGENTES,
        clientes: [],
        memorias: [],
        historico: [],
        acoes: [],
        permitidos,
      };
    }
    clientesQuery = clientesQuery.in('id', permitidos);
  }

  const [agentesRes, clientesRes, memoriasRes, historicoRes, acoesRes] = await Promise.all([
    supabase.from('brain_agents').select('*').order('id'),
    clientesQuery,
    supabase.from('brain_memories').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('brain_runs').select('id, pergunta, estado, agentes, cliente_id, etapas, proximo_passo, resultado, fontes, created_at, instrucao_ignorada').order('created_at', { ascending: false }).limit(40),
    supabase.from('brain_actions').select('id, run_id, dedupe_key, estado, versao_esperada, argumentos, justificativa, fonte, pendencias, precisa_decisao, caixa_thread_id, executor_agente_id, autorizador_id, ferramenta').order('created_at', { ascending: false }).limit(200),
  ]);
  for (const res of [agentesRes, clientesRes, memoriasRes, historicoRes, acoesRes]) {
    if (res.error && !tabelaAusente(res.error)) throw res.error;
  }

  return {
    disponivel: true,
    settings: settingsRes.data || { ...DEFAULT_SETTINGS },
    agentes: agentesRes.data?.length ? agentesRes.data : AGENTES,
    clientes: clientesRes.data || [],
    memorias: memoriasRes.data || [],
    historico: historicoRes.data || [],
    acoes: acoesRes.data || [],
    permitidos,
  };
}

function tituloMaterial(material) {
  return material?.descricao || material?.titulo || material?.nome || material?.tema || material?.formato || 'Material sem título';
}

async function montarSnapshot({ user, profile, clienteId, nota, permitidos, memorias, acoes }) {
  let tarefasQuery = supabase
    .from('tarefas')
    .select('id, title, status, client_id, assignee_ids, due_date, project_id, plan_material_id, created_at')
    .order('created_at', { ascending: false })
    .limit(400);
  if (clienteId) tarefasQuery = tarefasQuery.eq('client_id', clienteId);

  const statusRes = await supabase.from('task_statuses').select('value, label, is_terminal');
  const tarefasRes = await tarefasQuery;
  if (tarefasRes.error) throw tarefasRes.error;
  const statusMap = new Map((statusRes.data || []).map((row) => [row.value, row]));
  const tarefas = (tarefasRes.data || []).map((task) => {
    const status = statusMap.get(task.status);
    return {
      ...task,
      status_label: status?.label || task.status,
      is_terminal: Boolean(status?.is_terminal),
    };
  });

  if (clienteId && tarefas.length) {
    const comments = await supabase
      .from('task_comments')
      .select('id, task_id, content, created_at')
      .in('task_id', tarefas.map((task) => task.id))
      .order('created_at', { ascending: false })
      .limit(150);
    if (!comments.error) {
      for (const comment of comments.data || []) {
        const match = String(comment.content || '').match(/^(bloqueio|impedimento)\s*:\s*(.+)$/i);
        if (!match) continue;
        const task = tarefas.find((item) => item.id === comment.task_id);
        if (!task || task.bloqueio) continue;
        task.bloqueio = match[2].trim();
        task.bloqueio_fonte = { tipo: 'comentario', id: comment.id, titulo: 'Comentário da tarefa' };
      }
    }
  }

  const pessoasIds = [...new Set(tarefas.flatMap((task) => task.assignee_ids || []).filter(Boolean))];
  let pessoas = [];
  if (pessoasIds.length) {
    const pessoasRes = await supabase.from('profiles').select('id, full_name').in('id', pessoasIds);
    if (!pessoasRes.error) {
      pessoas = (pessoasRes.data || []).map((pessoa) => ({ id: pessoa.id, nome: pessoa.full_name }));
    }
  }

  const fontes = [];
  const materiais = [];
  if (nota?.trim() && clienteId) {
    fontes.push(notaParaFonte({
      texto: nota,
      clienteId,
      titulo: 'Nota desta consulta',
      consultadoEm: new Date().toISOString(),
    }));
  }

  if (clienteId) {
    const reunioes = await supabase
      .from('cliente_reunioes')
      .select('id, titulo, cliente_id, updated_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(8);
    if (!reunioes.error && reunioes.data?.length) {
      const falas = await supabase
        .from('cliente_reuniao_falas')
        .select('reuniao_id, nome, texto, ordem')
        .in('reuniao_id', reunioes.data.map((row) => row.id))
        .order('ordem');
      const porReuniao = new Map();
      for (const fala of falas.error ? [] : (falas.data || [])) {
        const lista = porReuniao.get(fala.reuniao_id) || [];
        lista.push(`${fala.nome}: ${fala.texto}`);
        porReuniao.set(fala.reuniao_id, lista);
      }
      for (const reuniao of reunioes.data) {
        const texto = (porReuniao.get(reuniao.id) || []).join('\n');
        fontes.push({
          id: reuniao.id,
          tipo: 'reuniao',
          cliente_id: reuniao.cliente_id,
          titulo: reuniao.titulo,
          texto,
          itens: parseItensNota(texto),
          consultado_em: reuniao.updated_at,
          versao: reuniao.updated_at,
        });
      }
    }

    const projetos = await supabase.from('projetos').select('id, name, client_id').eq('client_id', clienteId).limit(30);
    const projetoIds = (projetos.data || []).map((row) => row.id);
    if (!projetos.error && projetoIds.length) {
      const planos = await supabase.from('campaign_plans').select('id, project_id, materiais').in('project_id', projetoIds);
      if (!planos.error) {
        const nomes = new Map((projetos.data || []).map((row) => [row.id, row.name]));
        for (const plano of planos.data || []) {
          const rows = Array.isArray(plano.materiais) ? plano.materiais : [];
          for (const material of rows) {
            if (!material || typeof material !== 'object') continue;
            materiais.push({
              id: material.id,
              cliente_id: clienteId,
              titulo: tituloMaterial(material),
              projeto: nomes.get(plano.project_id) || 'Plano',
              versao: plano.id,
            });
          }
        }
      }
    }
  }

  return {
    clientes: clienteId ? [{ id: clienteId }] : [],
    fontes,
    tarefas,
    pessoas,
    materiais,
    memorias: memorias || [],
    acoesAnteriores: acoes || [],
    permitidos,
  };
}

export async function consultarCerebro({ user, profile, clienteId, pergunta, nota, base }) {
  const actor = actorDe(user, profile, base?.permitidos);
  const bruto = await montarSnapshot({
    user,
    profile,
    clienteId,
    nota,
    permitidos: base?.permitidos,
    memorias: base?.memorias,
    acoes: base?.acoes,
  });
  if (clienteId) {
    const cliente = (base?.clientes || []).find((item) => item.id === clienteId);
    bruto.clientes = [{ id: clienteId, empresa: cliente?.empresa || 'Cliente' }];
  } else {
    bruto.clientes = base?.clientes || [];
  }
  const mission = runMission({
    pergunta,
    clienteId: clienteId || null,
    now: new Date().toISOString(),
    settings: base?.settings || DEFAULT_SETTINGS,
    actor,
    snapshot: bruto,
  });

  if (!base?.disponivel || mission.estado === 'inativo') {
    return { mission, gravado: false, runId: null };
  }

  const runInsert = await supabase.from('brain_runs').insert({
    solicitante_id: user.id,
    cliente_id: isUuid(mission.clienteId) ? mission.clienteId : null,
    pergunta,
    agentes: mission.agentes,
    estado: mission.estado,
    gatilho: 'chat',
    etapas: mission.etapas,
    consumo: { etapas: mission.etapas, modelo: 'registros' },
    resultado: mission.resposta,
    fontes: mission.resposta?.fontes || [],
    proximo_passo: mission.resposta?.proximoPasso || null,
    instrucao_ignorada: mission.instrucaoIgnorada,
    concluido_em: new Date().toISOString(),
  }).select('id').single();
  if (runInsert.error) throw runInsert.error;
  const runId = runInsert.data.id;

  for (const anterior of mission.invalidar || []) {
    if (!isUuid(anterior.id)) continue;
    const invalidada = await supabase.from('brain_actions').update({ estado: 'invalidada' }).eq('id', anterior.id).eq('estado', 'proposta');
    if (invalidada.error) throw invalidada.error;
  }

  const salvas = [];
  for (const proposta of mission.propostas || []) {
    const insert = await supabase.from('brain_actions').insert({
      run_id: runId,
      agente_id: proposta.agente_id,
      ferramenta: proposta.ferramenta,
      argumentos: proposta.argumentos,
      alvo_tipo: proposta.alvo_tipo,
      alvo_id: proposta.alvo_id,
      autorizador_id: null,
      executor_agente_id: proposta.executor_agente_id,
      versao_esperada: proposta.versao_esperada,
      dedupe_key: proposta.dedupe_key,
      estado: proposta.estado === 'proposta' ? 'proposta' : 'falhou',
      justificativa: proposta.justificativa,
      pendencias: proposta.pendencias || [],
      fonte: proposta.fonte,
      precisa_decisao: proposta.precisa_decisao,
    }).select('id, dedupe_key, caixa_thread_id').single();
    if (insert.error) {
      if (String(insert.error.code) === '23505') continue;
      throw insert.error;
    }
    salvas.push({ ...proposta, id: insert.data.id });
  }

  for (const item of mission.alinhamentos || []) {
    if (!isUuid(item.fonte?.cliente_id || mission.clienteId)) continue;
    const cliente = item.fonte?.cliente_id || mission.clienteId;
    const insert = await supabase.from('brain_alignment_items').insert({
      run_id: runId,
      cliente_id: cliente,
      fonte_tipo: item.fonte?.tipo || 'nota',
      fonte_id: String(item.fonte?.id || 'nota'),
      fonte_titulo: item.fonte?.titulo || null,
      texto: item.texto,
      texto_norm: normalizeText(item.texto),
      classe: item.classe,
      tarefa_id: isUuid(item.tarefa_id) ? item.tarefa_id : null,
      estado: item.estado === 'duplicado' ? 'duplicado' : item.estado,
      confianca: item.confianca === 'duvidosa' ? 'duvidosa' : 'alta',
    });
    if (insert.error && String(insert.error.code) !== '23505') throw insert.error;
  }

  return { mission: { ...mission, propostas: salvas }, gravado: true, runId };
}

export async function salvarMemoria({ user, profile, memorias, draft }) {
  const actor = actorDe(user, profile, null);
  const resultado = confirmMemory(memorias, draft, actor);
  if (!resultado.ok) return resultado;
  const row = resultado.criada;
  if (resultado.conflito === false && row.substitui_id && isUuid(row.substitui_id)) {
    const update = await supabase.from('brain_memories').update({ estado: 'substituida' }).eq('id', row.substitui_id);
    if (update.error) throw update.error;
  }
  const insert = await supabase.from('brain_memories').insert({
    tipo: row.tipo,
    escopo: row.escopo,
    cliente_id: isUuid(row.cliente_id) ? row.cliente_id : null,
    agente_id: row.agente_id,
    owner_user_id: isUuid(row.owner_user_id) ? row.owner_user_id : null,
    conteudo: row.conteudo,
    resumo: row.resumo,
    fonte: row.fonte,
    visibilidade: row.visibilidade,
    valido_de: row.valido_de,
    valido_ate: row.valido_ate,
    versao: row.versao,
    substitui_id: isUuid(row.substitui_id) ? row.substitui_id : null,
    estado: row.estado,
    autor_id: user.id,
    validador_id: user.id,
    chave: row.chave,
  }).select('*').single();
  if (insert.error) throw insert.error;
  return { ...resultado, criada: insert.data };
}

export async function corrigirMemoria({ user, profile, memorias, memoriaId, correcao }) {
  const actor = actorDe(user, profile, null);
  const resultado = correctMemory(memorias, memoriaId, correcao, actor);
  if (!resultado.ok) return resultado;
  const update = await supabase.from('brain_memories').update({ estado: 'substituida' }).eq('id', memoriaId);
  if (update.error) throw update.error;
  const row = resultado.nova;
  const insert = await supabase.from('brain_memories').insert({
    tipo: row.tipo,
    escopo: row.escopo,
    cliente_id: row.cliente_id,
    agente_id: row.agente_id,
    owner_user_id: row.owner_user_id,
    conteudo: row.conteudo,
    resumo: row.resumo,
    fonte: row.fonte,
    visibilidade: row.visibilidade,
    versao: row.versao,
    substitui_id: memoriaId,
    estado: 'vigente',
    autor_id: user.id,
    validador_id: user.id,
    chave: row.chave,
  }).select('*').single();
  if (insert.error) throw insert.error;
  const feedback = await supabase.from('brain_feedback').insert({
    memoria_id: memoriaId,
    memoria_proposta_id: insert.data.id,
    usuario_id: user.id,
    correcao: resultado.feedback.correcao,
    motivo: resultado.feedback.motivo,
  });
  if (feedback.error) throw feedback.error;
  return { ...resultado, nova: insert.data };
}

export async function revogarMemoria({ user, profile, memorias, memoriaId, motivo }) {
  const actor = actorDe(user, profile, null);
  const resultado = revokeMemory(memorias, memoriaId, actor, motivo);
  if (!resultado.ok) return resultado;
  const update = await supabase.from('brain_memories').update({ estado: 'revogada' }).eq('id', memoriaId);
  if (update.error) throw update.error;
  await supabase.from('brain_feedback').insert({
    memoria_id: memoriaId,
    usuario_id: user.id,
    correcao: 'Revogada',
    motivo,
  });
  return resultado;
}

export async function salvarPiloto({ user, ativo, pilotoClienteIds }) {
  const settings = await supabase.from('brain_settings').update({
    ativo: Boolean(ativo),
    piloto_cliente_ids: pilotoClienteIds || [],
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', 'jbapex').select('*').single();
  if (settings.error) throw settings.error;
  const agentes = await supabase.from('brain_agents').update({
    ativo: Boolean(ativo),
    updated_at: new Date().toISOString(),
  }).in('id', ['central', 'clientes', 'operacao']);
  if (agentes.error) throw agentes.error;
  return settings.data;
}

export async function enviarDecisaoParaCaixa({ user, profile, proposta, runId, ownerId }) {
  if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
    return { ok: false, erro: 'A decisão fica no histórico. Um admin envia o aviso para a Minha caixa.' };
  }
  const aviso = montarAvisoCaixa({
    proposta,
    ownerId: ownerId || user.id,
    runId,
  });
  if (!aviso) return { ok: false, erro: 'Esta proposta não pede decisão.' };
  if (aviso.jaExiste) return { ok: true, id: aviso.id, jaExiste: true };
  if (aviso.erro) return { ok: false, erro: aviso.erro };
  const thread = await supabase.from('caixa_dot_threads').insert(aviso.row).select('id').single();
  if (thread.error) throw thread.error;
  const message = await supabase.from('caixa_dot_messages').insert({
    thread_id: thread.data.id,
    role: 'system',
    body: aviso.message.body,
    created_by_id: user.id,
  });
  if (message.error) throw message.error;
  if (isUuid(proposta.id)) {
    await supabase.from('brain_actions').update({ caixa_thread_id: thread.data.id }).eq('id', proposta.id);
  }
  return { ok: true, id: thread.data.id };
}
