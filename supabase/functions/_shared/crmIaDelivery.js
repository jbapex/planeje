import { escolherAgente } from './atendimentoIaPrompt.js';
import { decidirFollowupEnvio, patchAposFollowupEnviado } from './atendimentoIaFollowup.js';
import { generateCrmIaVoice } from './crmIaVoice.js';

async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error('crm_ia_delivery_database');
  return data;
}

// A thrown error or an unconfirmed transport result never authorizes an automatic retry.
async function deliver(send, payload) {
  try {
    const result = await send(payload);
    if (result?.ok === true) return { status: 'sent', messageId: result.messageId || null, error: null };
    return { status: result?.definitive === true ? 'failed' : 'uncertain', messageId: null, error: result?.definitive === true ? 'rejected' : 'transport_unconfirmed' };
  } catch {
    return { status: 'uncertain', messageId: null, error: 'transport_unconfirmed' };
  }
}

export async function dispatchCrmIaQueue({ db, send, generateVoice = generateCrmIaVoice, now = new Date().toISOString(), ids = null }) {
  const claimed = await rpc(db, 'crm_ia_delivery_claim', { p_now: now, p_ids: ids });
  const results = [];
  for (const row of claimed || []) {
    const claim = { p_id: row.id, p_claim_token: row.claim_token };
    try {
      let target = await rpc(db, 'crm_ia_delivery_recheck', claim);
      if (!target?.allowed) {
        results.push({ id: row.id, status: 'cancelled', reason: target?.reason || 'not_allowed' });
        continue;
      }
      let media = {};
      if (target.voice?.enabled === true) {
        const voice = await rpc(db, 'crm_ia_voice_begin', claim);
        if (voice?.allowed !== true) {
          results.push({ id: row.id, status: 'cancelled', reason: voice?.reason || 'voice_not_authorized' });
          continue;
        }
        let generated;
        try { generated = await generateVoice({ text: target.body, settings: voice.settings }); }
        catch { generated = { ok: false, error: 'voice_generation_failed' }; }
        const confirmed = await rpc(db, 'crm_ia_voice_complete', { ...claim,
          p_descriptor: generated?.ok === true ? generated.descriptor : null,
          p_error_code: generated?.ok === true ? null : generated?.error || 'voice_generation_failed' });
        if (!confirmed) {
          results.push({ id: row.id, status: 'cancelled', reason: 'voice_context_changed' });
          continue;
        }
        target = await rpc(db, 'crm_ia_delivery_recheck', claim);
        if (!target?.allowed) { results.push({ id: row.id, status: 'cancelled', reason: target?.reason || 'not_allowed' }); continue; }
        if (generated?.ok === true) media = generated.payload;
      }
      const receipt = await deliver(send, {
        origem: 'crm-ia', outbox_id: row.id, claim_token: row.claim_token,
        cliente_id: target.cliente_id, whatsapp_config_id: target.whatsapp_config_id,
        contact_id: target.contact_id, to: target.to, body: target.body, ...media,
      });
      const persisted = await rpc(db, 'crm_ia_delivery_finish', {
        ...claim, p_status: receipt.status, p_message_id: receipt.messageId, p_error_code: receipt.error,
      });
      results.push({ id: row.id, status: persisted ? receipt.status : 'uncertain', ...(target.voice?.enabled === true && { voice_status: target.voice_status }) });
    } catch {
      // A stale sending lease becomes uncertain in SQL; never reopen it after a receipt write fails.
      results.push({ id: row.id, status: 'uncertain', reason: 'delivery_state_unconfirmed' });
    }
  }
  return { processed: results.length, results };
}

export async function dispatchLegacyCrmIaQueue({ db, send, generateFollowup, now = new Date().toISOString() }) {
  await rpc(db, 'crm_ia_legacy_delivery_recover', {});
  const [reminders, followups] = await Promise.all([
    db.from('atendimento_conversa_planejamento').select('*').eq('status', 'pendente').eq('kind', 'lembrete_whatsapp').eq('delivery_state', 'pending')
      .lte('scheduled_at', now).order('scheduled_at').limit(25),
    db.from('cliente_atend_conversas').select('*').not('ia_followup_due_at', 'is', null).lte('ia_followup_due_at', now)
      .neq('status', 'finalizado').eq('ia_pausada', false).eq('ia_followup_delivery_state', 'pending').order('ia_followup_due_at').limit(20),
  ]);
  if (reminders.error || followups.error) throw new Error('crm_ia_delivery_database');
  const results = [];
  for (const [kind, rows] of [['reminder', reminders.data], ['followup', followups.data]]) {
    for (const row of rows || []) {
      if (kind === 'followup' && row.crm_ia_runtime?.active === true) {
        if (generateFollowup) {
          try {
            const generated = await generateFollowup(row);
            results.push({ id: row.id, kind, status: generated?.queued ? 'queued' : 'cancelled', reason: generated?.skipped || null });
          } catch { results.push({ id: row.id, kind, status: 'failed', reason: 'generation_unavailable' }); }
        }
        continue;
      }
      const expected = { updated_at: row.updated_at };
      let agent = null;
      if (kind === 'followup') {
        const agents = await db.from('cliente_atend_ia_agentes').select('id,nome,ativo,auto_responder,setor_ids,funil,updated_at')
          .eq('cliente_id', row.cliente_id).order('created_at');
        if (agents.error) throw new Error('crm_ia_delivery_database');
        agent = escolherAgente(agents.data || [], { setorId: row.setor_id || null, soAutoResponder: true });
        const decision = decidirFollowupEnvio({ clienteHabilitada: true, conversa: row, funil: agent?.funil, nowMs: new Date(now).getTime() });
        Object.assign(expected, { agent_id: agent?.id || null, agent_updated_at: agent?.updated_at || null, body: decision.ok ? decision.mensagem : '' });
      }
      const claim = await rpc(db, 'crm_ia_legacy_delivery_claim', { p_kind: kind, p_id: row.id, p_expected: expected, p_now: now });
      if (!claim?.claim_token) continue;
      const args = { p_kind: kind, p_id: row.id, p_claim_token: claim.claim_token };
      try {
        const target = await rpc(db, 'crm_ia_legacy_delivery_recheck', args);
        if (!target?.allowed) {
          results.push({ id: row.id, kind, status: 'cancelled', reason: target?.reason || 'not_allowed' });
          continue;
        }
        const payload = {
          origem: kind === 'followup' ? 'atendimento-ia' : 'atendimento-planejamento',
          cliente_id: target.cliente_id, whatsapp_config_id: target.whatsapp_config_id,
          to: target.to, body: target.body, claim_token: claim.claim_token,
          ...(kind === 'followup' ? { followup_conversation_id: row.id } : { planning_id: row.id, conversation_id: target.conversation_id }),
        };
        const receipt = await deliver(send, payload);
        const patch = kind === 'followup' && receipt.status === 'sent'
          ? patchAposFollowupEnviado({ funil: agent?.funil, passoEnviado: row.ia_followup_passo, nowIso: now }) : {};
        const persisted = await rpc(db, 'crm_ia_legacy_delivery_finish', {
          ...args, p_status: receipt.status, p_error_code: receipt.error, p_patch: patch,
        });
        results.push({ id: row.id, kind, status: persisted ? receipt.status : 'uncertain' });
      } catch {
        results.push({ id: row.id, kind, status: 'uncertain', reason: 'delivery_state_unconfirmed' });
      }
    }
  }
  return { processed: results.length, results };
}
