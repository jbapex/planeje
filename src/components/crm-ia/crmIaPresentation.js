export const CRM_IA_SECTIONS = {
  painel: ['Painel', 'Sua operação comercial, do primeiro contato ao próximo compromisso.'],
  funil: ['Funil', 'Acompanhe oportunidades e avance com os critérios de cada etapa.'],
  leads: ['Leads', 'Contatos, responsáveis e histórico da conta selecionada.'],
  conversas: ['Conversas', 'O mesmo atendimento, com o cliente e o canal identificados.'],
  agentes: ['Agentes IA', 'Qualificação, follow-up e agendamentos no seu funil.'],
  agenda: ['Agenda', 'Disponibilidade e compromissos da equipe.'],
  disparos: ['Disparos', 'Campanhas por WhatsApp e disponibilidade da conexão.'],
  rastreabilidade: ['Rastreabilidade', 'Origem dos contatos, links e registros de conversão.'],
  modelos: ['Modelos', 'Reaproveite funis, bases e agentes sem levar dados de outra conta.'],
  configuracoes: ['Configurações', 'Prepare a operação e confira as regras de atendimento.'],
};
export const AGENT_TYPES = [['qualificacao', 'Qualificação', 'Entenda a necessidade e organize o próximo passo.'], ['followup', 'Follow-up', 'Retome o contato respeitando o silêncio e as regras.'], ['agendamento', 'Agendamentos', 'Ofereça horários disponíveis e confirme o compromisso.']];
export const QUEUE_STATUS = { pending: 'Agendada', sending: 'Em envio', sent: 'Enviada', failed: 'Falhou', cancelled: 'Cancelada', uncertain: 'Entrega incerta · conferir antes de repetir' };
export const calendarStatus = calendar => !calendar?.required ? null : calendar.state === 'ready' && calendar.verified === true ? 'Sincronizado com o Google Agenda.' : calendar.state === 'failed' ? 'Google Agenda: precisa de conferência.' : 'Aguardando confirmação do Google Agenda.';
export const attendanceName = value => ({ ai: 'IA', human: 'Humano', waiting: 'Aguardando pessoa', followup: 'Follow-up', resolved: 'Resolvida' }[value] || 'Sem classificação');
export const money = value => value == null || value === '' ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export const count = value => value == null ? 'Sem dados' : Number(value).toLocaleString('pt-BR');
export function dateTime(value, timeZone = 'America/Sao_Paulo') {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', ...(dateOnly ? {} : { timeStyle: 'short' }), timeZone: dateOnly ? 'UTC' : timeZone }).format(new Date(value));
}
export const lines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean);
export const named = value => value?.nome || value?.full_name || value?.name || value?.empresa || value?.id || 'Sem nome';
export const versionOf = value => value?.id ? { id: value.id, expected_updated_at: value.updated_at } : {};
export function leadPayload(draft, original) {
  if (!draft.nome?.trim() || !draft.whatsapp?.trim()) throw new Error('Informe o nome e o telefone do lead.');
  if (draft.valor !== '' && (!Number.isFinite(Number(draft.valor)) || Number(draft.valor) < 0)) throw new Error('Informe um valor válido.');
  return { ...versionOf(original), nome: draft.nome.trim(), whatsapp: draft.whatsapp.trim(), email: draft.email?.trim() || null,
    valor: draft.valor === '' ? null : Number(draft.valor), pipeline_id: draft.pipeline_id || null, stage_id: draft.stage_id || null,
    responsavel_id: draft.responsavel_id || null, origem: draft.origem?.trim() || null, observacoes: draft.observacoes || '', etiquetas: lines(draft.etiquetas), ...(draft.crm_ia_fields && { crm_ia_fields: draft.crm_ia_fields }),
    ...(Object.hasOwn(draft, 'profile') && { profile: draft.profile === null ? null : { agent_id: draft.profile.agent_id, id: draft.profile.id, agent_updated_at: draft.profile.agent_updated_at } }) };
}
export function dateRange(days = 30) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const start = new Date(today + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() - days + 1);
  return { since: start.toISOString().slice(0, 10), until: today };
}

export function parseCrmCsv(value) {
  const source = String(value).replace(/^\uFEFF/, '');
  if (new TextEncoder().encode(source).length > 5 * 1024 * 1024) throw new Error('O CSV deve ter até 5 MB.');
  let headerQuotes = false, commas = 0, semicolons = 0;
  for (const char of source) {
    if (char === '"') headerQuotes = !headerQuotes;
    if (!headerQuotes && /[\r\n]/.test(char)) break;
    if (!headerQuotes && char === ',') commas += 1;
    if (!headerQuotes && char === ';') semicolons += 1;
  }
  const separator = semicolons > commas ? ';' : ',';
  const records = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishRow = () => {
    row.push(cell.trim());
    if (row.some(item => item !== '')) records.push(row);
    if (records.length > 1001) throw new Error('Importe até 1.000 leads por lote.');
    row = []; cell = ''; closed = false;
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === separator) { row.push(cell.trim()); cell = ''; closed = false; }
    else if (char === '\n' || char === '\r') { finishRow(); if (char === '\r' && source[index + 1] === '\n') index += 1; }
    else if (char === '"' && !cell.trim() && !closed) quoted = true;
    else if (closed && char.trim()) throw new Error('Há conteúdo inválido depois das aspas do CSV.');
    else cell += char;
  }
  if (quoted) throw new Error('O CSV contém aspas não fechadas.');
  if (cell || row.length) finishRow();
  const headers = records.shift();
  if (!headers?.length || !records.length) throw new Error('Informe o cabeçalho e ao menos uma linha de lead.');
  if (records.some(item => item.length !== headers.length)) throw new Error('As linhas do CSV precisam ter o mesmo número de colunas do cabeçalho.');
  return { headers, rows: records };
}
