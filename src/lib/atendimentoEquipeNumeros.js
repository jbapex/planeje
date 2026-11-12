import { digitsOnly, normalizeWhatsappPhone } from './atendimentoGrupoIdentidade.js';

const table = 'atendimento_grupo_remetente_interno';
const columns = 'id,profile_id,phone,updated_at';

export function normalizeAtendimentoTeamPhone(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const explicitCountry = input.startsWith('+');
  const phone = explicitCountry ? digitsOnly(input) : normalizeWhatsappPhone(input);
  const valid = explicitCountry ? /^[1-9]\d{7,14}$/.test(phone) : /^[1-9]\d{11,12}$/.test(phone);
  if (!valid || !/^\+?[\d\s().-]+$/.test(input)) {
    throw new Error('Informe o WhatsApp com DDD ou com o DDI precedido de +.');
  }
  return phone;
}

export async function loadAtendimentoTeamPhone(db, profileId) {
  if (!profileId) throw new Error('Selecione uma pessoa da equipe.');
  const { data, error } = await db.from(table).select(columns).is('cliente_id', null).eq('profile_id', profileId).maybeSingle();
  if (error || data && data.profile_id !== profileId) throw new Error('Não foi possível consultar o WhatsApp da pessoa.');
  return data;
}

export async function saveAtendimentoTeamPhone(db, person, existing, value) {
  if (!person?.id || existing?.profile_id && existing.profile_id !== person.id) {
    throw new Error('O cadastro de WhatsApp pertence a outra pessoa.');
  }
  const phone = normalizeAtendimentoTeamPhone(value);
  if (!phone && !existing) return null;
  const label = person.full_name?.trim() || 'Equipe';
  const payload = { profile_id: person.id, label, phone, name_match: label.split(/\s+/)[0].toLowerCase(),
    sender_jid: `${phone}@s.whatsapp.net` };
  let response;
  if (existing) {
    let query = (phone ? db.from(table).update(payload) : db.from(table).delete())
      .is('cliente_id', null).eq('id', existing.id).eq('updated_at', existing.updated_at);
    query = existing.profile_id ? query.eq('profile_id', existing.profile_id) : query.is('profile_id', null);
    query = existing.phone === null ? query.is('phone', null) : query.eq('phone', existing.phone);
    response = await query.select(columns).maybeSingle();
  } else {
    response = await db.from(table).insert({ ...payload, cliente_id: null, notes: 'Equipe da agência nos grupos' })
      .select(columns).maybeSingle();
    if (response.error?.code === '23505') {
      // Só adota o número digitado quando o cadastro global legado ainda não tem titular.
      response = await db.from(table).update(payload).is('cliente_id', null)
        .eq('phone', phone).is('profile_id', null).select(columns).maybeSingle();
      if (!response.error && !response.data) throw new Error('Este WhatsApp ou perfil já está vinculado. Atualize o cadastro.');
    }
  }
  if (response.error?.code === '23505') throw new Error('Este WhatsApp ou perfil já está vinculado. Atualize o cadastro.');
  if (response.error) throw new Error('Não foi possível salvar o WhatsApp da pessoa.');
  if (!response.data || (phone ? response.data.profile_id !== person.id || response.data.phone !== phone
    : response.data.id !== existing.id)) {
    throw new Error('O cadastro mudou ou o acesso foi revogado. Atualize antes de tentar de novo.');
  }
  return phone ? response.data : null;
}
