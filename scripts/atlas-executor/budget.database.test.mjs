import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';
import { budgetFixture, id, OWNER, RUN, SESSION, JOB, LEASE } from './budget-fixture.mjs';

const exec = promisify(execFile);
const failure = (fn, code = '42501') => assert.throws(fn, new RegExp(`\\b${code}\\b`));
test('reserva do executor compartilha ledger e teto reais', async t => {
  const db = budgetFixture();
  const counters = () => JSON.parse(db.sql(`SELECT jsonb_build_object('used',used_tokens,'reserved',reserved_tokens,'legacy',legacy_tokens,'calls',model_calls,'cap',max_tokens_per_day) FROM public.atlas_event_config WHERE owner_id='${OWNER}'`));
  const worker = (call, estimate) => JSON.parse(db.service(`SELECT public.atlas_model_reserve('${call}',${estimate},p_job=>'${JOB}',p_lease=>'${LEASE}')`));
  try {
    db.start();
    t.afterEach(() => db.sql(`DELETE FROM private.atlas_model_calls;UPDATE public.atlas_event_config SET usage_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date,used_tokens=0,reserved_tokens=0,legacy_tokens=0,model_calls=0,legacy_model_calls=0,max_tokens_per_day=1000,enabled=true;
      UPDATE public.atlas_office_state SET usage_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date,tokens_today=0,calls_today=0,analysis_reservation=NULL,reservation_tokens=0;
      UPDATE public.atlas_settings SET enabled=true,owner_id='${OWNER}';UPDATE public.profiles SET status='active',role='admin';
      UPDATE auth.users SET banned_until=NULL;UPDATE auth.sessions SET not_after=NULL;DELETE FROM public.user_module_permissions;UPDATE public.module_settings SET is_enabled=true;
      UPDATE public.atlas_runs SET status='processing',request_message=E'[Executor Planeje]\\nPedido QA',source_session_id='${SESSION}' WHERE id='${RUN}';`));
    await t.test('executor e job usam o mesmo teto; replay não autoriza outra chamada', () => {
      assert.equal(db.reserve(id(100), 600).reserved, true); assert.equal(worker(id(101), 400).reserved, true);
      assert.equal(db.reserve(id(102), 1).reserved, false); assert.equal(db.reserve(id(100), 600).reserved, false);
      assert.deepEqual(counters(), { used: 0, reserved: 1000, legacy: 0, calls: 2, cap: 1000 });
      assert.equal(db.sql(`SELECT run_id FROM private.atlas_model_calls WHERE id='${id(100)}'`), RUN);
      assert.equal(db.sql(`SELECT job_id FROM private.atlas_model_calls WHERE id='${id(101)}'`), JOB);
    });
    await t.test('finish compartilhado contabiliza uso explícito, desconhecido e replay uma vez', () => {
      db.reserve(id(110), 300); worker(id(111), 400);
      assert.equal(db.finish(id(110), { prompt_tokens: 90, completion_tokens: 30 }), 't');
      assert.equal(db.finish(id(110), { total_tokens: 1 }), 'f'); assert.equal(db.finish(id(111)), 't');
      assert.deepEqual(counters(), { used: 520, reserved: 0, legacy: 0, calls: 2, cap: 1000 });
      assert.equal(db.sql(`SELECT actual_tokens FROM private.atlas_model_calls WHERE id='${id(111)}'`), '400');
    });
    await t.test('reservas expiradas de ambas origens são cobradas antes da próxima chamada', () => {
      db.reserve(id(120), 300); worker(id(121), 200);
      db.sql("UPDATE private.atlas_model_calls SET expires_at=clock_timestamp()-interval '1 second'");
      assert.equal(db.reserve(id(122), 501).reserved, false);
      assert.deepEqual(counters(), { used: 500, reserved: 0, legacy: 0, calls: 2, cap: 1000 });
      assert.equal(db.finish(id(120), { total_tokens: 0 }), 'f');
      assert.equal(db.reserve(id(123), 500).reserved, true);
    });
    await t.test('legado e reserva pendente do escritório reduzem o mesmo saldo sem alterar teto', () => {
      db.sql(`UPDATE public.atlas_office_state SET tokens_today=600,calls_today=2,analysis_reservation='${id(130)}',reservation_tokens=200`);
      assert.equal(db.reserve(id(131), 201).reserved, false); assert.equal(db.reserve(id(132), 200).reserved, true);
      assert.deepEqual(counters(), { used: 0, reserved: 200, legacy: 600, calls: 1, cap: 1000 });
    });
    await t.test('virada de dia preserva reservas vivas e recomeça contadores sem aumentar teto', () => {
      db.reserve(id(140), 200);
      db.sql("UPDATE public.atlas_event_config SET usage_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,used_tokens=999,model_calls=99");
      assert.equal(db.reserve(id(141), 300).reserved, true); assert.deepEqual(counters(), { used: 0, reserved: 500, legacy: 0, calls: 1, cap: 1000 });
      db.finish(id(140), { total_tokens: 120 }); assert.equal(counters().reserved, 300); assert.equal(counters().used, 120);
    });
    await t.test('somente serviço reserva; helper não concede leitura das tabelas de autenticação', () => {
      for (const role of ['authenticated', 'anon']) {
        failure(() => db.sql(`SET ROLE ${role};SELECT public.atlas_executor_model_reserve('${RUN}','${id(150)}',20)`));
        failure(() => db.sql(`SET ROLE ${role};SELECT private.atlas_executor_model_session('${OWNER}','${SESSION}')`));
      }
      failure(() => db.service('SELECT * FROM auth.sessions')); failure(() => db.service('SELECT * FROM auth.users'));
      failure(() => db.sql('SET ROLE authenticated;SELECT * FROM private.atlas_model_calls'));
      failure(() => db.reserve(id(151), 0), '22023');
      assert.equal(db.sql("SELECT prosecdef FROM pg_proc WHERE oid='public.atlas_executor_model_reserve(uuid,uuid,integer)'::regprocedure"), 'f');
    });
    await t.test('run legado, concluído, sem sessão ou titular/módulo revogados não compram chamada', () => {
      for (const options of [{ message: 'Legado' }, { status: 'completed' }, { session: null }]) failure(() => db.reserve(crypto.randomUUID(), 20, db.newRun(options)));
      for (const [change, restore] of [
        ["UPDATE public.profiles SET status='pending'", "UPDATE public.profiles SET status='active'"],
        ["UPDATE public.atlas_settings SET enabled=false", "UPDATE public.atlas_settings SET enabled=true"],
        ["UPDATE public.module_settings SET is_enabled=false", "UPDATE public.module_settings SET is_enabled=true"],
        ["UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'", 'UPDATE auth.sessions SET not_after=NULL'],
        ["UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour'", 'UPDATE auth.users SET banned_until=NULL'],
      ]) { db.sql(change); failure(() => db.reserve(crypto.randomUUID(), 20)); db.sql(restore); }
      db.sql(`INSERT INTO public.user_module_permissions VALUES('${OWNER}','assistant',false)`); failure(() => db.reserve(id(160), 20));
      assert.equal(counters().calls, 0); assert.equal(counters().reserved, 0);
    });
    await t.test('origem exclusiva aceita run ou job existente e rejeita ausência/múltiplas origens', () => {
      db.reserve(id(170), 20); worker(id(171), 20);
      const values = `id,owner_id,run_id,job_id,lease,estimate,usage_day,expires_at`;
      failure(() => db.sql(`INSERT INTO private.atlas_model_calls(${values}) VALUES('${id(172)}','${OWNER}',NULL,NULL,'${LEASE}',20,current_date,now())`), '23514');
      failure(() => db.sql(`INSERT INTO private.atlas_model_calls(${values}) VALUES('${id(173)}','${OWNER}','${RUN}','${JOB}','${LEASE}',20,current_date,now())`), '23514');
      failure(() => db.sql(`INSERT INTO private.atlas_model_calls(${values}) VALUES('${id(174)}','${OWNER}','${RUN}',NULL,'${LEASE}',0,current_date,now())`), '23514');
    });
    await t.test('escritório público, worker e executor concorrentes respeitam gate/teto reais', async () => {
      const statements = [
        `SELECT public.atlas_executor_model_reserve('${RUN}','${id(180)}',600)`,
        `SELECT public.atlas_model_reserve('${id(181)}',600,p_job=>'${JOB}',p_lease=>'${LEASE}')`,
        `SELECT public.atlas_office_reserve('${OWNER}',(now() AT TIME ZONE 'America/Sao_Paulo')::date,600) IS NULL`,
      ];
      const rows = (await Promise.all(statements.map(statement => exec('psql', [...db.psql, '-c', `SET ROLE service_role;${statement}`], { env: db.env, timeout: 15000 })))).map(result => result.stdout.trim());
      assert.deepEqual(rows.slice(0, 2).map(row => JSON.parse(row).reserved).sort(), [false, true]); assert.equal(rows[2], 't');
      assert.equal(counters().reserved, 600); assert.equal(counters().calls, 1); assert.equal(counters().cap, 1000);
    });
    await t.test('revogar sessão enquanto espera o lock compartilhado impede reserva', async () => {
      const gate = spawn('psql', db.psql, { env: db.env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; gate.stdout.setEncoding('utf8'); gate.stdout.on('data', value => { output += value; });
      try {
        gate.stdin.write(`BEGIN;SELECT owner_id FROM public.atlas_event_config WHERE owner_id='${OWNER}' FOR UPDATE;SELECT 'LOCKED';\n`);
        const deadline = Date.now() + 8000;
        while (!output.includes('LOCKED')) { if (Date.now() > deadline) assert.fail('Lock de orçamento não confirmado.'); await new Promise(resolve => setTimeout(resolve, 15)); }
        const pending = exec('psql', [...db.psql, '-c', `SET application_name='executor-budget-revoke';SET ROLE service_role;SELECT public.atlas_executor_model_reserve('${RUN}','${id(190)}',20)`], { env: db.env, timeout: 15000 }).then(result => ({ result }), error => ({ error }));
        while (db.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='executor-budget-revoke' AND wait_event_type='Lock'") !== '1') { if (Date.now() > deadline) assert.fail('Espera no orçamento não confirmada.'); await new Promise(resolve => setTimeout(resolve, 15)); }
        db.sql(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${SESSION}'`); gate.stdin.end('COMMIT;\n');
        const { error } = await pending; assert.match(error?.stderr || '', /42501/); assert.equal(counters().reserved, 0);
      } finally { if (!gate.stdin.writableEnded) gate.stdin.end('ROLLBACK;\n'); gate.kill(); }
    });
    await t.test('vencimento natural durante espera exige sessão viva no instante da reserva', async () => {
      const gate = spawn('psql', db.psql, { env: db.env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; gate.stdout.setEncoding('utf8'); gate.stdout.on('data', value => { output += value; });
      try {
        gate.stdin.write(`BEGIN;SELECT owner_id FROM public.atlas_event_config WHERE owner_id='${OWNER}' FOR UPDATE;SELECT 'LOCKED';\n`);
        const deadline = Date.now() + 8000;
        while (!output.includes('LOCKED')) { if (Date.now() > deadline) assert.fail('Lock de orçamento não confirmado.'); await new Promise(resolve => setTimeout(resolve, 15)); }
        db.sql(`UPDATE auth.sessions SET not_after=clock_timestamp()+interval '600 milliseconds' WHERE id='${SESSION}'`);
        const pending = exec('psql', [...db.psql, '-c', `SET application_name='executor-budget-expire';SET ROLE service_role;SELECT public.atlas_executor_model_reserve('${RUN}','${id(191)}',20)`], { env: db.env, timeout: 15000 }).then(result => ({ result }), error => ({ error }));
        while (db.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='executor-budget-expire' AND wait_event_type='Lock'") !== '1') { if (Date.now() > deadline) assert.fail('Espera no orçamento não confirmada.'); await new Promise(resolve => setTimeout(resolve, 15)); }
        await new Promise(resolve => setTimeout(resolve, 700)); gate.stdin.end('COMMIT;\n');
        const { error } = await pending; assert.match(error?.stderr || '', /42501/); assert.equal(counters().reserved, 0);
      } finally { if (!gate.stdin.writableEnded) gate.stdin.end('ROLLBACK;\n'); gate.kill(); }
    });
  } finally { db.stop(); }
});
