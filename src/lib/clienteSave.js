import { supabase } from '@/lib/customSupabaseClient';
import { normalizeUf } from '@/lib/brasilUfs';
import { formatCnpjCpf } from '@/lib/cnpjCpf';

const NEW_CLIENT_DOCUMENT =
  '<p>Este é o documento do seu novo cliente. Adicione aqui senhas, links importantes, e-mails e qualquer outra informação relevante.</p>';

export const CLIENT_TRAFFIC_GOAL_FIELDS = ['objetivo_meta', 'meta_custo_mensagem', 'meta_custo_compra', 'roas_alvo', 'limite_meta'];

function missingColumnFromError(error) {
  const msg = String(error?.message || error?.details || '');
  const match =
    msg.match(/column (?:[\w]+\.)?(\w+) does not exist/i) ||
    msg.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || null;
}

async function persistCliente(payload, { isNew, id }) {
  const data = { ...payload };
  const dropped = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = isNew
      ? await supabase.from('clientes').insert(data).select('id').single()
      : await supabase.from('clientes').update(data).eq('id', id);
    if (!result.error) return { data: result.data, error: null, dropped };
    const column = missingColumnFromError(result.error);
    if (!column || !Object.prototype.hasOwnProperty.call(data, column)) {
      return { data: null, error: result.error, dropped };
    }
    delete data[column];
    dropped.push(column);
  }
  return { data: null, error: { message: 'Não foi possível salvar o cliente.' }, dropped };
}

export async function saveClienteForm({ clientData, isNew, editingClient, userId, trafficGoalsOnly = false, csGroupDraft, csDraftId }) {
  if (csGroupDraft && (!isNew || trafficGoalsOnly)) {
    return { data: null, error: { message: 'Abra um novo cadastro a partir do grupo.' }, dropped: [], savedId: null };
  }
  if (trafficGoalsOnly) {
    const savedId = editingClient?.id;
    if (isNew || !savedId) {
      return { data: null, error: { message: 'Selecione um cliente cadastrado para salvar as metas.' }, dropped: [], savedId: null };
    }
    const changes = Object.fromEntries(CLIENT_TRAFFIC_GOAL_FIELDS
      .filter((field) => clientData[field] !== undefined &&
        String(clientData[field] ?? '') !== String(editingClient[field] ?? ''))
      .map((field) => [field, clientData[field] === '' ? null : clientData[field]]));
    if (!Object.keys(changes).length) return { data: null, error: null, dropped: [], savedId };

    const invalidAmount = Object.entries(changes).some(([field, value]) => {
      if (field === 'objetivo_meta' || value === null) return false;
      const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      return !Number.isFinite(amount) || amount < 0;
    });
    if (invalidAmount) {
      return { data: null, error: { message: 'Informe um número finito maior ou igual a zero em cada meta.' }, dropped: [], savedId };
    }

    const { data, error } = await supabase.from('clientes').update(changes).eq('id', savedId).select('id').single();
    return { data, error, dropped: [], savedId };
  }

  const dataToSave = {
    ...clientData,
    owner_id: userId,
    vencimento: clientData.vencimento || null,
    inicio_na_base: clientData.inicio_na_base || null,
    cobranca_parcelada: Boolean(clientData.cobranca_parcelada),
    postagem_do_cliente: Boolean(clientData.postagem_do_cliente),
    dia_cobranca: (() => {
      const n = Number(clientData.dia_cobranca);
      if (!Number.isInteger(n) || n < 1 || n > 28) return null;
      return n;
    })(),
    dia_cobranca_2: (() => {
      if (!clientData.cobranca_parcelada) return null;
      const n = Number(clientData.dia_cobranca_2);
      if (!Number.isInteger(n) || n < 1 || n > 28) return null;
      return n;
    })(),
    valor: clientData.valor || null,
    objetivo_meta: clientData.objetivo_meta || null,
    meta_custo_mensagem: clientData.meta_custo_mensagem || null,
    meta_custo_compra: clientData.meta_custo_compra || null,
    roas_alvo: clientData.roas_alvo || null,
    email: String(clientData.email || '').trim() || null,
    telefone: String(clientData.telefone || '').trim() || null,
    estado: normalizeUf(clientData.estado) || null,
    cidade: String(clientData.cidade || '').trim() || null,
  };
  const cnpj = formatCnpjCpf(clientData.cnpj_cpf);
  if (cnpj) dataToSave.cnpj_cpf = cnpj;
  else delete dataToSave.cnpj_cpf;
  delete dataToSave.meta_resumo;
  if (editingClient?.entregaveis?.meta_resumo) {
    dataToSave.entregaveis = {
      ...(dataToSave.entregaveis || {}),
      meta_resumo: dataToSave.entregaveis?.meta_resumo || editingClient.entregaveis.meta_resumo,
    };
  }
  if (isNew) dataToSave.client_document = NEW_CLIENT_DOCUMENT;

  if (csGroupDraft) {
    const { id, group } = csGroupDraft;
    const { data, error } = await supabase.rpc('cs_ia_create_client_for_group', {
      p_client_id: id, p_conversation_id: group.id, p_wa_client_id: group.wa_cliente_id,
      p_channel_id: group.whatsapp_config_id, p_group_jid: group.chat_jid, p_client: dataToSave,
    });
    if (!error && data?.id === id && Array.isArray(data.dropped)) return { data, error: null, dropped: data.dropped, savedId: id };
    const messages = {
      42501: 'O acesso ao grupo ou ao cadastro mudou. Volte a Grupos e confira o canal.',
      55000: 'O grupo está arquivado. Restaure o grupo no CS antes de criar o cliente.',
      40001: 'O vínculo mudou. Volte a Grupos e confira a conversa.',
      22023: 'Confira o nome, o tipo de serviço e os entregáveis do cliente.',
    };
    const message = error?.code === '23505' && /grupo já está vinculado/i.test(error.message || '')
      ? 'Este grupo já está vinculado a outro cliente.' : messages[error?.code] || 'Não foi possível confirmar o cadastro. Tente novamente.';
    return { data: null, error: { message }, dropped: [], savedId: null };
  }

  if (isNew && csDraftId) dataToSave.id = csDraftId;
  const result = await persistCliente(dataToSave, { isNew, id: editingClient?.id });
  if (isNew && csDraftId && result.error?.code === '23505') {
    const { data, error } = await supabase.from('clientes').select('id,etapa').eq('id', csDraftId).eq('owner_id', userId).maybeSingle();
    if (!error && data?.id === csDraftId) {
      return { data, error: null, dropped: [], savedId: data.id, savedStage: data.etapa, replayed: true };
    }
  }
  return { ...result, savedId: result.data?.id || editingClient?.id || null };
}

export function saveClienteToast({ isNew, error, dropped }) {
  if (error) {
    return {
      title: isNew ? 'Erro ao criar cliente' : 'Erro ao atualizar cliente',
      description: error.message,
      variant: 'destructive',
    };
  }
  return {
    title: isNew ? 'Cliente criado com sucesso!' : 'Cliente atualizado com sucesso!',
    description: dropped.includes('cnpj_cpf')
      ? 'Cidade e os demais campos gravaram. Para o CNPJ/CPF persistir, rode no SQL Editor: ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cnpj_cpf text;'
      : undefined,
  };
}
