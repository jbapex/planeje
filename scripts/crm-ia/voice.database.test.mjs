import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { dispatchCrmIaQueue } from '../../supabase/functions/_shared/crmIaDelivery.js';
import { authorizeCrmIaServiceDelivery } from '../../supabase/functions/_shared/crmIaServiceDelivery.js';
import { crmIaMediaDescriptor } from '../../supabase/functions/_shared/crmIaMediaPayload.js';
import { processCrmIaAudioInput } from '../../supabase/functions/_shared/crmIaVoice.js';

const work = mkdtempSync('/tmp/crm-voice-db-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key, i) => [key, id([1,2,3,11,12,21,22,31][i])]));
const { admin, client, channel, contact } = context;
const quote = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
function run(binary, args, input) { const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 }); if (result.status !== 0) throw new Error(result.stderr || result.error?.message); return result.stdout.trim(); }
const sql = source => run('psql', ['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55495','-U','voice_qa','-d','postgres'], source);
const rpc = (name, args = {}) => JSON.parse(sql(`SET ROLE service_role; SELECT to_jsonb(public.${name}(${Object.entries(args).map(([key,value]) => `${key}=>${key === 'p_ids' && Array.isArray(value) ? `ARRAY[${value.map(quote).join(',')}]::uuid[]` : quote(value)}`).join(',')}));`));
const call = (action, payload, uid = admin) => JSON.parse(sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL test.uid='${uid}'; SELECT public.crm_ia_workspace('${action}','${client}',${quote(payload)}::jsonb); COMMIT;`));
const db = { async rpc(name, args) { try { return { data: rpc(name, args), error: null }; } catch (error) { return { data: null, error: { message: error.message } }; } }, from(table) {
  const filters = []; let fields = '*', ordering = '', maximum = '', single = false, insert, patch;
  const q = { select(value) { fields = value; return q; }, eq(key,value) { filters.push(`${key}=${quote(value)}`); return q; }, is(key) { filters.push(`${key} IS NULL`); return q; },
    in(key,values) { filters.push(`${key} IN (${values.map(quote).join(',')})`); return q; }, or(value) { filters.push('('+value.split(',').map(part=>{const [key,,...text]=part.split('.');return `${key}=${quote(text.join('.'))}`;}).join(' OR ')+')');return q; },
    order(key,options={}) { ordering=` ORDER BY ${key} ${options.ascending===false?'DESC':'ASC'}`;return q; }, limit(n) { maximum=` LIMIT ${n}`;return q; }, maybeSingle() { single=true;return q; }, insert(value) { insert=value;return q; }, update(value) { patch=value;return q; },
    then(resolve,reject) { try {
      const where=filters.length?' WHERE '+filters.join(' AND '):'';
      if(patch) { sql(`UPDATE ${table} SET ${Object.entries(patch).map(([key,value])=>`${key}=${quote(value)}`).join(',')}${where}`);return Promise.resolve({data:null,error:null}).then(resolve,reject); }
      if(insert) { sql(`INSERT INTO ${table}(${Object.keys(insert).join(',')}) VALUES(${Object.values(insert).map(quote).join(',')})`);return Promise.resolve({data:null,error:null}).then(resolve,reject); }
      const rows=JSON.parse(sql(`SELECT coalesce(json_agg(t),'[]') FROM(SELECT ${fields} FROM ${table}${where}${ordering}${maximum}) t`));
      return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject);
    } catch(error) { return Promise.reject(error).then(resolve,reject); } }
  }; return q;
} };

test('voz exige opt-in de gestão e snapshots reais antes do custo e do transporte', async () => {
  let started = false;
  try {
    run('initdb', ['-D',data,'-U','voice_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl', ['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55495 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']); started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
      ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,status text DEFAULT 'aguardando',fila_id uuid,assigned_to uuid,last_message_at timestamptz,last_customer_message_at timestamptz,awaiting_response_since timestamptz,unread_count integer DEFAULT 0,last_message_preview text,profile_pic_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql','20261111120001_crm_ia_internal_notifications.sql','20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql']) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    const pipeline = id(41), stage = id(51);
    sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
      INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({ attendance: { auto_send: true }, entry: { enabled: true, channels: [{ channel_id: channel, enabled: true, mode: 'all', pipeline_id: pipeline, stage_id: stage }] } })},'${admin}');`);
    const rules = { tipo: 'qualificacao', pipeline_id: pipeline, stage_ids: [stage] };
    let agent = call('save_agent', { nome: 'Voz sintética', auto_responder: true, funil: { crm_ia: rules } });
    assert.deepEqual(agent.funil.crm_ia.audio, { enabled: false, input_enabled: false, voice: 'alloy', speed: 1 });
    const settings = { enabled: true, input_enabled: false, voice: 'alloy', speed: 1 };
    for (const audio of [{ ...settings, voice: 'invented' }, { ...settings, speed: 4.01 }, { ...settings, enabled: 'true' }, { ...settings, model: 'other' }]) {
      assert.throws(() => call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules, audio } } }), /voz|áudio|audio/i);
    }
    assert.throws(() => call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules, audio: settings } } }, context.staff), /gestão|acesso|admin/i);
    agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules, audio: settings } } });
    assert.deepEqual(agent.funil.crm_ia.audio, settings);
    assert.equal(sql(`SELECT updated_at=${quote(agent.updated_at)}::timestamptz FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`), 't');
    assert.equal(agent.config_revision, sql(`SELECT revision FROM crm_ia_config WHERE cliente_id='${client}'`));
    assert.throws(() => call('save_agent', { id: agent.id, expected_updated_at: '2020-01-01', nome: 'stale' }), /alterad|versão/i);
    for (const name of ['crm_ia_workspace_pre_voice(text,uuid,jsonb)','crm_ia_voice_begin(uuid,uuid)','crm_ia_voice_complete(uuid,uuid,jsonb,text)','crm_ia_delivery_recheck_pre_voice(uuid,uuid)']) {
      assert.equal(sql(`SELECT has_function_privilege('authenticated','public.${name}','execute')`), 'f', name);
      assert.equal(sql(`SELECT has_function_privilege('anon','public.${name}','execute')`), 'f', name);
    }
    const prepare = key => {
      sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='em_atendimento',updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
      const state = rpc('crm_ia_agent_intake', { p_client: client, p_channel: channel, p_contact: contact, p_text: 'Olá' });
      const job = rpc('crm_ia_agent_begin', { p_client: client, p_channel: channel, p_contact: contact, p_lead: state.lead.id, p_agent: agent.id, p_mode: 'responder', p_message: key,
        p_expected: { config_revision: state.config.revision, lead_updated_at: state.lead.updated_at, conversation_updated_at: state.conversation.updated_at, agent_updated_at: sql(`SELECT updated_at FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`), actor_id: admin } });
      assert.equal(job.claimed, true);
      return rpc('crm_ia_apply_agent_action', { p_run: job.id, p_action: { type: 'answer' }, p_reply: 'Resposta confirmada', p_followup: {} }).outbox_id;
    };
    const media = { file: btoa('OggS fixture OpusHead audio'), media_type: 'ptt', mimetype: 'audio/ogg', doc_name: 'resposta.ogg', caption: 'Resposta confirmada' };
    const descriptor = await crmIaMediaDescriptor(media);
    const item = prepare('voice-1'); let ttsCalls = 0, sent;
    const batch = await dispatchCrmIaQueue({ db, ids: [item], generateVoice: async () => { ttsCalls++; return { ok: true, payload: media, descriptor }; }, send: async body => {
      sent = body; assert.equal((await authorizeCrmIaServiceDelivery(db, { ...body, file: btoa('wrong bytes') })).allowed, false);
      assert.equal((await authorizeCrmIaServiceDelivery(db, body)).allowed, true);
      assert.equal((await authorizeCrmIaServiceDelivery(db, body)).allowed, false, 'transport replay');
      return { ok: true, messageId: 'voice-receipt' };
    } });
    assert.equal(batch.results[0].status, 'sent'); assert.equal(ttsCalls, 1);
    assert.equal(sql(`SELECT media_descriptor='{}'::jsonb FROM crm_ia_outbox WHERE id='${item}'`), 't', 'cron media policy must remain intact');
    assert.equal(sql(`SELECT voice_status FROM crm_ia_outbox WHERE id='${item}'`), 'ready');
    assert.equal(sql(`SELECT descriptor ? 'file' FROM planeje_private.crm_ia_voice_deliveries WHERE outbox_id='${item}'`), 'f');
    assert.equal(rpc('crm_ia_voice_begin', { p_id: item, p_claim_token: sent.claim_token }).allowed, false, 'TTS replay after send');
    const visibleQueue = call('queue', {}).rows.find(row => row.id === item);
    assert.equal(visibleQueue.contact.nome, 'Contato fictício');
    assert.equal(visibleQueue.channel_name, 'Canal fictício');
    assert.equal(visibleQueue.voice_status, 'ready');
    sql(`INSERT INTO cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,body,message_id,sender_kind)
      VALUES('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Resposta confirmada','voice-receipt','automation');`);
    const voiceHistory = call('messages', { contact_id: contact, channel_id: channel }).rows.find(row => row.message_id === 'voice-receipt');
    assert.equal(voiceHistory.media_type, 'ptt');
    assert.equal(voiceHistory.voice_synthetic, true);
    assert.equal(JSON.stringify(voiceHistory).includes('descriptor'), false);
    const fallback = prepare('voice-no-key');
    const fallbackBatch = await dispatchCrmIaQueue({ db, ids: [fallback], generateVoice: async () => ({ ok: false, error: 'voice_unavailable' }), send: async body => {
      assert.equal(body.file, undefined); assert.equal((await authorizeCrmIaServiceDelivery(db, body)).allowed, true); return { ok: true };
    } });
    assert.equal(fallbackBatch.results[0].voice_status, 'text_fallback');
    assert.equal(sql(`SELECT voice_error_code FROM crm_ia_outbox WHERE id='${fallback}'`), 'voice_unavailable');
    const revoked = prepare('voice-pause'), [claim] = rpc('crm_ia_delivery_claim', { p_ids: [revoked] });
    assert.equal(rpc('crm_ia_voice_begin', { p_id: revoked, p_claim_token: claim.claim_token }).allowed, true);
    assert.equal(rpc('crm_ia_voice_begin', { p_id: revoked, p_claim_token: claim.claim_token }).allowed, false, 'generation replay');
    sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    assert.equal(rpc('crm_ia_voice_complete', { p_id: revoked, p_claim_token: claim.claim_token, p_descriptor: descriptor }).toString(), 'false');
    const actorRevoked = prepare('voice-actor');
    sql(`UPDATE profiles SET status='inactive' WHERE id='${admin}'`);
    let paid = false;
    await dispatchCrmIaQueue({ db, ids: [actorRevoked], generateVoice: async () => { paid = true; return { ok: true }; }, send: async () => assert.fail('revoked actor sent') });
    assert.equal(paid, false);
    sql(`UPDATE profiles SET status='active' WHERE id='${admin}'`);
    const optInForged = prepare('voice-forged');
    sql(`DELETE FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id='${agent.id}'`);
    await dispatchCrmIaQueue({ db, ids: [optInForged], generateVoice: async () => { paid = true; }, send: async () => assert.fail('unapproved flag sent') });
    assert.equal(paid, false, 'JSON alone cannot authorize TTS cost');
    agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules, audio: { ...settings, enabled: false, input_enabled: true } } } });
    const inbound = message => {
      sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='esperando',updated_at=clock_timestamp() WHERE contact_id='${contact}';
        INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,raw_payload,created_at)
          VALUES('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','[Áudio]','audio',${quote(message)},'{}',clock_timestamp());`);
      return { p_client: client, p_channel: channel, p_contact: contact, p_message: message };
    };
    const firstAudio = inbound('audio-1');
    assert.equal(rpc('crm_ia_audio_begin', { ...firstAudio, p_channel: context.hiddenChannel }).allowed, false);
    const audioJob = rpc('crm_ia_audio_begin', firstAudio), audioClaim = { p_id: audioJob.id, p_claim_token: audioJob.claim_token };
    assert.equal(audioJob.allowed, true); assert.equal(rpc('crm_ia_audio_begin', firstAudio).allowed, false, 'audio cost replay');
    assert.equal(rpc('crm_ia_audio_recheck', audioClaim).allowed, true);
    assert.equal(rpc('crm_ia_audio_complete', { ...audioClaim, p_transcript: 'Quero agendar amanhã.' }), true);
    assert.equal(rpc('crm_ia_audio_begin', firstAudio).transcript, 'Quero agendar amanhã.');
    assert.equal(sql("SELECT body FROM cliente_whatsapp_inbox WHERE message_id='audio-1'"), '[Áudio]');
    assert.equal(rpc('crm_ia_audio_context', { p_client: client, p_channel: channel, p_contact: contact })[0].transcript, 'Quero agendar amanhã.');
    const heard = call('messages', { contact_id: contact, channel_id: channel }).rows.find(row => row.message_id === 'audio-1');
    assert.deepEqual(heard.transcription, { status: 'ready', text: 'Quero agendar amanhã.' });
    const failedInput = inbound('audio-failed'), failedJob = rpc('crm_ia_audio_begin', failedInput), failedClaim = { p_id: failedJob.id, p_claim_token: failedJob.claim_token };
    assert.equal(rpc('crm_ia_audio_complete', { ...failedClaim, p_error_code: 'audio_unavailable' }), true);
    assert.equal(rpc('crm_ia_audio_begin', failedInput).status, 'failed', 'failed cache never bills again');
    const unheard = call('messages', { contact_id: contact, channel_id: channel }).rows.find(row => row.message_id === 'audio-failed');
    assert.deepEqual(unheard.transcription, { status: 'failed' });
    const changedInput = inbound('audio-pause'), changed = rpc('crm_ia_audio_begin', changedInput), changedClaim = { p_id: changed.id, p_claim_token: changed.claim_token };
    sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    assert.equal(rpc('crm_ia_audio_recheck', changedClaim).allowed, false);
    assert.equal(rpc('crm_ia_audio_complete', { ...changedClaim, p_transcript: 'Texto tardio' }), false);
    const olderInput = inbound('audio-old'), older = rpc('crm_ia_audio_begin', olderInput), olderClaim = { p_id: older.id, p_claim_token: older.claim_token };
    inbound('audio-new');
    assert.equal(rpc('crm_ia_audio_recheck', olderClaim).allowed, false, 'new inbound cancels audio cost');
    const moduleInput=inbound('audio-modules'), moduleJob=rpc('crm_ia_audio_begin',moduleInput), moduleClaim={p_id:moduleJob.id,p_claim_token:moduleJob.claim_token};
    assert.equal(moduleJob.allowed,true);
    sql(`INSERT INTO user_module_permissions(user_id,module_name,is_enabled) VALUES('${admin}','atendimento',false),('${admin}','rastreamento',false);`);
    assert.equal(rpc('crm_ia_audio_recheck',moduleClaim).allowed,false,'revoked attendance AND tracking must block download/model cost');
    assert.equal(rpc('crm_ia_audio_complete',{...moduleClaim,p_transcript:'Resultado após revogação'}),false);
    assert.equal(rpc('crm_ia_audio_begin',inbound('audio-modules-disabled')).allowed,false);
    sql(`DELETE FROM user_module_permissions WHERE user_id='${admin}' AND module_name IN ('atendimento','rastreamento');
      INSERT INTO module_settings(module_name,is_enabled) VALUES('atendimento',false),('rastreamento',false);`);
    assert.equal(rpc('crm_ia_audio_begin',inbound('audio-module-defaults')).allowed,false);
    sql(`INSERT INTO user_module_permissions(user_id,module_name,is_enabled) VALUES('${admin}','rastreamento',true);`);
    assert.equal(rpc('crm_ia_audio_begin',inbound('audio-module-override')).allowed,true,'per-user true must override global false');
    sql(`DELETE FROM user_module_permissions WHERE user_id='${admin}' AND module_name='rastreamento';DELETE FROM module_settings WHERE module_name IN ('atendimento','rastreamento');`);
    for (const name of ['crm_ia_audio_begin(uuid,uuid,uuid,text)','crm_ia_audio_recheck(uuid,uuid)','crm_ia_audio_complete(uuid,uuid,text,text)','crm_ia_audio_context(uuid,uuid,uuid)']) {
      assert.equal(sql(`SELECT has_function_privilege('authenticated','public.${name}','execute')`), 'f', name);
    }
    const output = join(work, 'runtime.mjs');
    await build({ entryPoints: ['supabase/functions/_shared/crmIaRuntime.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
    const { runCrmIaAgent } = await import(pathToFileURL(output));
    let asrCalls = 0, modelCalls = 0;
    const runInput = (message, noKey = false) => runCrmIaAgent({ db, clientId: client, channelId: channel, contactId: contact, messageId: message, mode: 'responder',
      processAudioInput: options => processCrmIaAudioInput({ ...options, apiKey: noKey ? '' : 'fixture', fetchImpl: async url => {
        if (url.endsWith('/message/download')) return Response.json({ base64: btoa('ID3'+'x'.repeat(80)) });
        assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');asrCalls++;
        return Response.json({ text: 'Minha cidade é Recife.' });
      } }), callModel: async (_model, messages) => { modelCalls++; assert.ok(messages.some(message => message.role === 'user' && message.content.includes('Minha cidade é Recife.'))); return { resposta: '{"text":"Qual é o melhor horário?","action":{"type":"answer"}}' }; } });
    inbound('runtime-audio');
    const runtimeAudio = await runInput('runtime-audio');
    assert.equal(runtimeAudio.queued, true);
    assert.equal(asrCalls, 1); assert.equal(modelCalls, 1);
    assert.equal((await runInput('runtime-audio')).outbox_id, runtimeAudio.outbox_id);
    assert.equal(asrCalls, 1); assert.equal(modelCalls, 1);
    inbound('runtime-no-key');
    const runtimeFallback = await runInput('runtime-no-key', true);
    assert.equal(runtimeFallback.queued, true);
    assert.match(sql(`SELECT body FROM crm_ia_outbox WHERE id='${runtimeFallback.outbox_id}'`), /não consegui entender.*áudio/i);
    assert.equal(modelCalls, 1, 'unheard audio must not produce an invented model response');
    assert.equal((await runInput('runtime-no-key', true)).outbox_id, runtimeFallback.outbox_id);
    assert.equal(modelCalls, 1, 'failed ASR replay must not duplicate fallback');
    const newContact=id(32), newJid='551188888888@s.whatsapp.net';
    sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${newContact}','${client}','${newJid}','551188888888','Contato de voz','${channel}');
      UPDATE crm_ia_config SET data=jsonb_set(data,'{entry,channels}',${quote([{ channel_id: channel, enabled: true, mode: 'phrase', phrase: 'orçamento', pipeline_id: pipeline, stage_id: stage }])}),revision=gen_random_uuid() WHERE cliente_id='${client}';
      INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,created_at) VALUES('${client}','${channel}','${newJid}','${newJid}','[Áudio]','ptt','audio-entry',clock_timestamp());`);
    const phraseJob=rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:newContact,p_message:'audio-entry'});
    assert.equal(phraseJob.allowed,true);assert.equal(sql(`SELECT count(*) FROM leads WHERE crm_ia_contact_id='${newContact}'`),'0','ASR preparation must not create a lead');
    assert.equal(rpc('crm_ia_audio_complete',{p_id:phraseJob.id,p_claim_token:phraseJob.claim_token,p_transcript:'Quero consultar horários.'}),true);
    assert.equal(rpc('crm_ia_agent_intake',{p_client:client,p_channel:channel,p_contact:newContact,p_text:'Quero consultar horários.'}).skipped,'entry_disabled');
    assert.equal(sql(`SELECT count(*) FROM leads WHERE crm_ia_contact_id='${newContact}'`),'0','unmatched audio phrase must not capture lead');
    const captured=rpc('crm_ia_agent_intake',{p_client:client,p_channel:channel,p_contact:newContact,p_text:'Gostaria de um orçamento.'});
    assert.ok(captured.lead?.id,'actual matching transcript may capture lead');
    const rejectedSources=[['purged',false,{},true],['group',true,{},false],['echo',false,{message:{fromMe:true}},false]];
    for(const [message,isGroup,raw,purged] of rejectedSources){
      sql(`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,raw_payload,is_group,media_purged_at,created_at)
        VALUES('${client}','${channel}','${newJid}','${newJid}','[Áudio]','audio',${quote(message)},${quote(raw)},${isGroup},${purged?'clock_timestamp()':'NULL'},clock_timestamp());`);
      assert.equal(rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:newContact,p_message:message}).allowed,false,message);
    }
  } finally {
    if (started) run('pg_ctl', ['-D',data,'-m','immediate','-w','stop']);
    rmSync(work, { recursive: true, force: true });
  }
});
