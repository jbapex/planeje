import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { squadNativeDatabaseFixture,nativeIds as ids } from './squad-native-database-fixture.mjs';
const params = enabled => ({ p_client_id:ids.client,p_conversation_id:ids.group,p_enabled:enabled });
const config = db => JSON.parse(db.sql(`SELECT to_jsonb(c) FROM private.cs_ia_reading_config c WHERE client_id='${ids.client}'`));
const runAsync = (db,input) => new Promise((resolve,reject) => {
  const child = spawn('psql',db.psql,{ env:db.env });let output = '',error = '';
  child.stdout.on('data',data => { output += data; });child.stderr.on('data',data => { error += data; });
  child.on('error',reject);child.on('close',code => code ? reject(Error(error)) : resolve(output.trim()));child.stdin.end(input);
});

test('dispatcher CS altera serviços nativos de vínculo e consentimento no PostgreSQL isolado',async t => {
  const db = squadNativeDatabaseFixture();
  try {
    db.start();
    await t.test('leitura real é criada após aprovação e recusa preserva o registro',() => {
      const before = db.snapshot(),payload = { p_client_id:ids.client,p_conversation_id:ids.group,p_enabled:true,p_include_audio:false,p_transcribe_audio:false };
      const rejected = db.store('configure_reading',payload,before);assert.equal(db.decide(rejected,'reject').state,'rejected');
      assert.equal(db.sql('SELECT count(*) FROM private.cs_ia_reading_config'),'0');
      const item = db.store('configure_reading',payload,before),done = db.decide(item);
      assert.equal(done.state,'completed');assert.equal(done.result.enabled,true);
      assert.equal(db.sql(`SELECT enabled AND owner_id='${ids.owner}' AND conversation_id='${ids.group}' FROM private.cs_ia_reading_config WHERE client_id='${ids.client}'`),'t');
    });
    await t.test('cinco RPCs e serviços privados são exatamente os corpos nativos das migrations atuais',() => {
      const sources = [
        ['20261109100351_cs_ia_inventory_group_members.sql','public.cs_ia_set_group_binding','uuid,uuid,uuid,uuid,text,text'],
        ['20261109051632_cs_ia_conversation_readings.sql','public.cs_ia_reading_settings','uuid,boolean,boolean,uuid,boolean'],
        ['20261109150722_cs_ia_channel_reading.sql','private.cs_ia_set_reading','uuid,boolean,boolean,uuid,boolean'],
        ['20261109070655_cs_ia_whatsapp_task_start.sql','public.cs_ia_task_move_options','uuid,uuid,boolean'],
        ['20261109152645_cs_ia_task_controls.sql','private.cs_ia_task_move_options','uuid,uuid,boolean'],
        ['20261109154825_cs_ia_whatsapp_task_creation.sql','public.cs_ia_task_creation_options','uuid,uuid,boolean'],
        ['20261109160256_cs_ia_whatsapp_task_context.sql','private.cs_ia_task_auto_options','uuid,uuid,boolean,boolean'],
        ['20261109160256_cs_ia_whatsapp_task_context.sql','public.cs_ia_task_context_options','uuid,uuid,boolean'],
      ];
      for (const [file,name,signature] of sources) {
        const source = readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'),start = source.indexOf(`FUNCTION ${name}(`),body = source.slice(source.indexOf('AS $$',start) + 5,source.indexOf('$$;',start));
        const actual = JSON.parse(db.sql(`SELECT to_jsonb(p.prosrc) FROM pg_proc p WHERE p.oid='${name}(${signature})'::regprocedure`));assert.equal(actual,body,name);
      }
    });
    await t.test('movimentação, criação e contexto gravam marcos nativos e retornam recibos reais',() => {
      for (const [action,column] of [['configure_task_moves','task_moves_since'],['configure_task_creation','task_create_since'],['configure_task_context','task_context_since']]) {
        const item = db.store(action,params(true),db.snapshot()),done = db.decide(item);
        assert.equal(done.state,'completed',action);assert.equal(done.result.enabled,true,action);assert.ok(config(db)[column],action);
        assert.deepEqual(db.decide(item).result,done.result,action);
      }
      assert.equal(config(db).task_moves_revision,config(db).revision);
    });
    await t.test('snapshot atual não altera marcos nem expõe configuração privada ou texto das conversas',() => {
      db.sql(`INSERT INTO public.cliente_whatsapp_inbox(id,conversation_id,cliente_id,whatsapp_config_id,created_at,type,body,sender_jid,msg_timestamp)
        VALUES('00000000-0000-4000-8000-000000009001','${ids.group}','${ids.tenant}','${ids.channel}',clock_timestamp(),'text','TEXTO_FICTICIO_NAO_EXPOR','5511999999999@s.whatsapp.net',clock_timestamp())`);
      const before = config(db),first = db.snapshot(),second = db.snapshot();assert.deepEqual(first,second);assert.deepEqual(config(db),before);
      assert.equal(first.reading.conversation_id,ids.group);assert.equal(first.reading.enabled,true);assert.equal(typeof first.version,'string');
      assert.doesNotMatch(JSON.stringify(first),/TEXTO_FICTICIO_NAO_EXPOR|5511999999999|executor_revision|task_create_since|enabled_at|owner_id/);
      assert.throws(() => db.user('SELECT * FROM private.cs_ia_reading_config'),/42501/);
    });
    await t.test('ABA real de cada consentimento conserva flags visíveis e invalida revisão anterior',() => {
      for (const [action,rpc,key] of [['configure_task_moves','cs_ia_task_move_options','task_moves'],['configure_task_creation','cs_ia_task_creation_options','task_creation'],['configure_task_context','cs_ia_task_context_options','task_context']]) {
        const before = db.snapshot(),stale = db.store(action,params(false),before);
        db.user(`SELECT public.${rpc}('${ids.client}','${ids.group}',false);SELECT public.${rpc}('${ids.client}','${ids.group}',true)`);
        const after = db.snapshot();assert.deepEqual(after[key],before[key]);assert.notEqual(after.version,before.version);
        assert.equal(db.decide(stale).state,'conflict');assert.equal(db.snapshot()[key].enabled,true);
      }
    });
    await t.test('revogar leitura dispara limpeza nativa de criação/contexto e exige fotografia nova para reativar',() => {
      const before = db.snapshot(),pause = db.store('configure_reading',{ ...params(false),p_include_audio:false,p_transcribe_audio:false },before);
      assert.equal(db.decide(pause).state,'completed');const paused = config(db);
      assert.equal(paused.enabled,false);assert.equal(paused.task_create_since,null);assert.equal(paused.task_context_since,null);assert.equal(db.snapshot().task_moves.enabled,false);
      const resume = db.store('configure_reading',{ ...params(true),p_include_audio:false,p_transcribe_audio:false },before);
      assert.equal(db.decide(resume).state,'conflict');assert.equal(config(db).enabled,false);
      assert.equal(db.decide(db.store('configure_reading',{ ...params(true),p_include_audio:false,p_transcribe_audio:false },db.snapshot())).state,'completed');
    });
    await t.test('cliente divergente, grupo diferente e canal revogado não alteram consentimento',() => {
      const before = config(db);
      assert.throws(() => db.store('configure_task_moves',{ ...params(true),p_client_id:ids.tenant },db.snapshot()),/22023/);
      const wrongGroup = db.store('configure_task_moves',{ ...params(true),p_conversation_id:ids.secondGroup },db.snapshot());
      assert.throws(() => db.decide(wrongGroup),/42501/);assert.deepEqual(config(db),before);
      const item = db.store('configure_reading',{ ...params(true),p_include_audio:true,p_transcribe_audio:false },db.snapshot());
      db.sql(`INSERT INTO public.atendimento_usuario_acesso(user_id,cliente_id,whatsapp_config_id) VALUES('${ids.owner}','${ids.tenant}','${ids.otherChannel}')`);
      assert.throws(() => db.decide(item),/42501/);assert.deepEqual(config(db),before);
      db.sql(`DELETE FROM public.atendimento_usuario_acesso WHERE user_id='${ids.owner}'`);
    });
    await t.test('módulo revogado durante espera no lock nativo é revalidado antes de gravar',async () => {
      const before = config(db),item = db.store('configure_task_context',params(true),db.snapshot());
      const holder = spawn('psql',db.psql,{ env:db.env });let output = '',error = '';
      holder.stdout.on('data',chunk => { output += chunk; });holder.stderr.on('data',chunk => { error += chunk; });
      const holderDone = new Promise((resolve,reject) => holder.on('close',code => code ? reject(Error(error)) : resolve()));
      holder.stdin.write("BEGIN;LOCK TABLE private.cs_ia_reading_config IN ACCESS EXCLUSIVE MODE;SELECT 'NATIVE_LOCK_READY';\n");
      let pending;
      try {
        for (let attempt = 0;attempt < 50 && !output.includes('NATIVE_LOCK_READY');attempt++) await delay(20);
        assert.match(output,/NATIVE_LOCK_READY/);
        pending = runAsync(db,db.userSql(db.decisionStatement(item)));pending.catch(() => {});
        let waiting = false;
        for (let attempt = 0;attempt < 50 && !waiting;attempt++) {
          waiting = db.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%atlas_executor_decide%')") === 't';
          if (!waiting) await delay(20);
        }
        assert.equal(waiting,true);db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.owner}','clients',false)`);
        holder.stdin.end('COMMIT;\n');await holderDone;await assert.rejects(pending,/42501/);
      } finally {
        if (holder.stdin.writable) holder.stdin.end('ROLLBACK;\n');await holderDone;
        db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.owner}' AND module_name='clients'`);
      }
      assert.deepEqual(config(db),before);assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${item.id}'`),'proposed');
    });
    await t.test('vínculo nativo muda cadastro e relação, invalida leitura antiga e respeita versão',() => {
      const version = JSON.parse(db.user(`SELECT public.cs_ia_group_binding('${ids.client}')`)).version;
      const payload = { p_client_id:ids.client,p_conversation_id:ids.secondGroup,p_wa_client_id:ids.tenant,p_channel_id:ids.channel,p_group_jid:'segundo-ficticio@g.us',p_version:version };
      const stale = db.store('set_group_binding',{ ...payload,p_version:'versao-velha' });assert.equal(db.decide(stale).state,'conflict');
      const item = db.store('set_group_binding',payload),done = db.decide(item);assert.equal(done.state,'completed');assert.equal(done.result,true);
      assert.equal(db.sql(`SELECT conversation_id FROM public.cliente_whatsapp_grupo WHERE cliente_id='${ids.client}'`),ids.secondGroup);
      assert.equal(db.sql(`SELECT entregaveis#>>'{whatsapp_grupo,conversation_id}' FROM public.clientes WHERE id='${ids.client}'`),ids.secondGroup);
      assert.equal(config(db).enabled,false);assert.equal(config(db).task_create_since,null);assert.equal(config(db).task_context_since,null);
      assert.throws(() => db.snapshot(ids.group),/42501/);assert.equal(db.snapshot(ids.secondGroup).reading.conversation_id,ids.secondGroup);
    });
  } finally { db.stop(); }
});
