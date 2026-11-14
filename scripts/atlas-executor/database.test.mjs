import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';
import { databaseFixture, id, ids, literal, json } from './database-fixture.mjs';

const exec = promisify(execFile);
const proposal = (name, payload = {}) => ({ kind: 'proposal', app: 'crm', action: 'save_pipeline', title: `Criar ${name}`, payload: { nome: name, is_default: false, ...payload }, before: null, preview: { after: { nome: name } }, effect: { type: 'configuration', external: false }, links: [] });
const question = fields => ({ kind: 'question', app: 'crm', title: 'Dados fictícios', description: 'Dados de teste.', fields, payload: {}, before: null, preview: {}, effect: {}, links: [] });
const count = (db, name) => Number(db.sql(`SELECT count(*) FROM public.crm_pipelines WHERE nome=${literal(name)}`));
const failure = (action, code = '42501') => assert.throws(action, new RegExp(`\\b(?:${code})\\b`));
function connection(db) {
  const child = spawn('psql', db.psql, { env: db.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => { output += text; }); child.stderr.on('data', text => { error += text; });
  const waitFor = async marker => {
    const deadline = Date.now() + 8000;
    while (!output.includes(marker)) {
      if (child.exitCode !== null || Date.now() > deadline) throw Error(`Conexão QA não chegou a ${marker}: ${error}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  return { child, waitFor };
}
async function blocked(db, names, number) {
  const deadline = Date.now() + 8000;
  while (Number(db.sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name IN(${names.map(literal).join(',')}) AND wait_event_type='Lock'`)) !== number) {
    if (Date.now() > deadline) assert.fail(`${number} clientes não bloquearam no lock comprovado.`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}
const concurrent = (db, name, statement) => exec('psql', [...db.psql, '-c', `SET application_name=${literal(name)};${db.userSql(statement)}`], { env: db.env, encoding: 'utf8', timeout: 15000 });

test('executor mantém decisões e CRM oficial no PostgreSQL16 privado', async t => {
  const db = databaseFixture();
  const saved = item => JSON.parse(db.sql(`SELECT to_jsonb(i) FROM public.atlas_execution_items i WHERE id='${item.id}'`));
  const create = (name, input = proposal(name), options = {}) => {
    const context = db.newRun(options);
    return { ...context, item: db.store(context.run, `call-${name}`, input) };
  };
  try {
    db.start();
    await t.test('preparação não muta CRM, deriva escopo e call id exige conteúdo imutável', () => {
      const context = db.newRun(), input = proposal('Preparação QA');
      const item = db.store(context.run, 'call-first', input);
      assert.equal(item.state, 'proposed'); assert.equal(item.revision, 1);
      assert.equal(item.owner_id, ids.admin); assert.equal(item.client_id, ids.client);
      assert.equal(item.conversation_id, context.conversation); assert.equal(item.run_id, context.run);
      assert.deepEqual(item.payload, input.payload); assert.equal(count(db, 'Preparação QA'), 0);
      assert.equal(db.store(context.run, 'call-first', input).id, item.id);
      failure(() => db.store(context.run, 'call-first', proposal('Outro conteúdo')), '40001');
      assert.deepEqual(saved(item).payload, input.payload); assert.ok(item.resume_request_id);
    });
    await t.test('owner, conversa, modo, run e cliente não podem ser substituídos', () => {
      const { run } = db.newRun();
      for (const field of ['owner_id', 'conversation_id', 'run_id']) failure(() => db.store(run, `override-${field}`, { ...proposal('Injetado'), [field]: id(9999) }), '22023|42501');
      failure(() => db.store(run, 'override-client', { ...proposal('Injetado'), client_id: ids.foreign }), '22023|42501');
      for (const field of ['client_id', 'cliente_id', 'p_client_id', 'target_client_id']) failure(() => db.store(run, `payload-${field}`, proposal('Injetado', { [field]: ids.foreign })), '22023|42501');
      failure(() => db.store(id(9999), 'missing-run', proposal('Ausente')));
      failure(() => db.store(run, 'wrong-owner', proposal('Outro dono'), { actor: ids.staff, session: ids.otherSession }));
      failure(() => db.store(db.newRun({ message: 'Pedido legado' }).run, 'wrong-mode', proposal('Legado')));
      failure(() => db.store(db.newRun({ status: 'completed' }).run, 'finished-run', proposal('Finalizado')));
      failure(() => db.store(db.newRun({ conversationClient: ids.foreign }).run, 'wrong-conversation', proposal('Escopo divergente')), '22023|42501');
    });
    await t.test('sessão real, papel JWT e módulo assistant são exigidos na gravação e leitura', () => {
      const { run } = db.newRun();
      for (const options of [{ session: null }, { session: ids.otherSession }, { delegate: 'atlas' }, { role: 'service_role' }]) failure(() => db.store(run, `denied-${JSON.stringify(options)}`, proposal('Negado'), options));
      const item = db.store(run, 'visible', proposal('Visível'));
      assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${item.id}'`), '1');
      assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${item.id}'`, { actor: ids.staff, session: ids.otherSession }), '0');
      db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.admin}','assistant',false)`);
      failure(() => db.store(run, 'module-revoked', proposal('Módulo revogado')));
      assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${item.id}'`), '0');
      db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.admin}' AND module_name='assistant';UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${ids.session}'`);
      failure(() => db.store(run, 'dead-session', proposal('Sessão expirada')));
      assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${item.id}'`), '0');
      db.sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${ids.session}'`);
    });
    await t.test('tabela nega escrita direta e revisão incorreta não aprova', () => {
      const { item } = create('Imutável QA');
      for (const role of ['authenticated', 'service_role']) {
        failure(() => db.asUser(`UPDATE public.atlas_execution_items SET payload='{}' WHERE id='${item.id}'`, { role }));
        failure(() => db.asUser(`INSERT INTO public.atlas_execution_items(id) VALUES('${id(9998)}')`, { role }));
      }
      assert.deepEqual(saved(item).payload, item.payload);
      failure(() => db.decide(item, 'approve', {}, null, {}, item.revision + 1), '40001');
      assert.equal(count(db, 'Imutável QA'), 0);
    });
    await t.test('sessão de origem e objetivo confirmado do run não podem ser reescritos', () => {
      const { run } = db.newRun();
      failure(() => db.asUser(`UPDATE public.atlas_runs SET source_session_id='${ids.otherSession}' WHERE id='${run}'`));
      db.asUser(`UPDATE public.atlas_runs SET executor_objective='Objetivo original fictício' WHERE id='${run}'`);
      failure(() => db.asUser(`UPDATE public.atlas_runs SET executor_objective='Outro objetivo' WHERE id='${run}'`));
      assert.equal(db.sql(`SELECT executor_objective FROM public.atlas_runs WHERE id='${run}'`), 'Objetivo original fictício');
    });
    await t.test('logout não altera histórico nem é bloqueado por runs terminados', () => {
      const session = id(9001);
      db.sql(`INSERT INTO auth.sessions(id,user_id) VALUES('${session}','${ids.admin}')`);
      const { run } = db.newRun({ session, status: 'completed' });
      db.sql(`DELETE FROM auth.sessions WHERE id='${session}'`);
      assert.equal(db.sql(`SELECT source_session_id FROM public.atlas_runs WHERE id='${run}'`), session);
    });
    await t.test('aprovação cria registro uma vez, conserva recibo e resume id após resposta perdida', () => {
      const { item } = create('Aprovação QA'), done = db.decide(item, 'approve');
      assert.equal(done.state, 'completed'); assert.equal(done.resume_request_id, item.resume_request_id);
      assert.ok(done.result?.id); assert.equal(count(db, 'Aprovação QA'), 1);
      const native = JSON.parse(db.sql(`SELECT to_jsonb(p) FROM public.crm_pipelines p WHERE id='${done.result.id}'`));
      assert.equal(native.cliente_id, ids.client); assert.equal(native.nome, 'Aprovação QA');
      const replay = db.decide(item, 'approve');
      assert.equal(replay.id, done.id); assert.deepEqual(replay.result, done.result); assert.equal(replay.resume_request_id, done.resume_request_id);
      assert.equal(count(db, 'Aprovação QA'), 1);
      failure(() => db.decide(item, 'reject'), '40001');
      failure(() => db.decide(item, 'approve', { alterado: true }), '22023|40001');
    });
    await t.test('recusar e cancelar não gravam no módulo', () => {
      for (const [decision, state] of [['reject', 'rejected'], ['cancel', 'cancelled']]) {
        const name = `Recusa ${decision} QA`, { item } = create(name), result = db.decide(item, decision);
        assert.equal(result.state, state); assert.equal(count(db, name), 0); assert.deepEqual(result.payload, item.payload);
        assert.equal(db.decide(item, decision).resume_request_id, result.resume_request_id);
      }
    });
    await t.test('perguntas validam tipos, opções, limites e chaves desconhecidas', () => {
      const fields = [{ id: 'nome', label: 'Nome', type: 'text', maxLength: 4 }, { id: 'nota', label: 'Nota', type: 'textarea', required: false, maxLength: 20 },
        { id: 'quantidade', label: 'Quantidade', type: 'number', min: 0, max: 10 }, { id: 'data', label: 'Data', type: 'date' }, { id: 'hora', label: 'Hora', type: 'time' },
        { id: 'tom', label: 'Tom', type: 'select', options: [{ value: 'formal', label: 'Formal' }, { value: 'cordial', label: 'Cordial' }] },
        { id: 'canais', label: 'Canais', type: 'multiselect', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, { id: 'ativo', label: 'Ativo', type: 'boolean' }];
      const { item } = create('Pergunta QA', question(fields));
      const valid = { nome: 'Ana', quantidade: 2, data: '2026-12-01', hora: '09:30', tom: 'formal', canais: ['a'], ativo: false };
      for (const patch of [{ nome: '' }, { nome: 'Longo' }, { quantidade: '2' }, { quantidade: -1 }, { data: '2026-02-30' }, { hora: '25:00' }, { tom: 'outro' }, { canais: ['a', 'a'] }, { canais: ['c'] }, { ativo: 'false' }, { injetado: true }]) {
        failure(() => db.decide(item, 'answer', { ...valid, ...patch }), '22023'); assert.equal(saved(item).state, 'awaiting_input');
      }
      const result = db.decide(item, 'answer', valid);
      assert.equal(result.state, 'completed'); assert.deepEqual(result.answers, valid);
      assert.equal(db.decide(item, 'answer', valid).resume_request_id, result.resume_request_id);
      failure(() => db.decide(item, 'answer', { ...valid, quantidade: 3 }), '40001');
    });
    await t.test('texto livre não aprova proposta e não aceita vazio nem excesso', () => {
      const { item } = create('Texto QA', question([{ id: 'nome', label: 'Nome', type: 'text' }]));
      failure(() => db.decide(item, 'text', {}, '  '), '22023'); failure(() => db.decide(item, 'text', {}, 'x'.repeat(12001)), '22023');
      const result = db.decide(item, 'text', {}, 'Prefiro explicar por texto.');
      assert.equal(result.state, 'completed'); assert.equal(result.decision, 'text'); assert.ok(JSON.stringify(result.answers).includes('Prefiro explicar por texto.'));
      assert.equal(db.decide(item, 'text', {}, 'Prefiro explicar por texto.').resume_request_id, result.resume_request_id);
      const { item: proposed } = create('Texto não aprova QA');
      failure(() => db.decide(proposed, 'text', {}, 'Pode seguir.'), '22023'); assert.equal(count(db, 'Texto não aprova QA'), 0);
    });
    await t.test('versão nativa concorrente vira conflito sem sobrescrever nem repetir', () => {
      const initial = JSON.parse(db.asUser(`SELECT public.crm_ia_workspace('save_pipeline','${ids.client}',${json({ nome: 'Versão original QA', is_default: false })})`));
      const input = { ...proposal('Editar QA'), payload: { id: initial.id, nome: 'Edição Atlas QA', is_default: false, expected_updated_at: initial.updated_at } };
      const { item } = create('Conflito QA', input);
      db.sql(`UPDATE public.crm_pipelines SET nome='Edição humana QA',updated_at=clock_timestamp() WHERE id='${initial.id}'`);
      const result = db.decide(item, 'approve');
      assert.equal(result.state, 'conflict'); assert.equal(result.error.code, '40001'); assert.deepEqual(saved(item).payload, input.payload);
      assert.equal(db.sql(`SELECT nome FROM public.crm_pipelines WHERE id='${initial.id}'`), 'Edição humana QA');
      assert.equal(db.decide(item, 'approve').resume_request_id, result.resume_request_id);
    });
    await t.test('erro nativo reverte efeito parcial e não expõe detalhes internos', () => {
      db.sql(`CREATE FUNCTION public.executor_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        INSERT INTO public.crm_stages(pipeline_id,nome) VALUES(NEW.id,'Efeito parcial QA');RAISE EXCEPTION 'segredo-fixture-nao-exibir';END$$;
        CREATE TRIGGER executor_fixture_fail AFTER INSERT ON public.crm_pipelines FOR EACH ROW WHEN(NEW.nome='Falha atômica QA') EXECUTE FUNCTION public.executor_fixture_fail();`);
      const { item } = create('Falha atômica QA'), result = db.decide(item, 'approve');
      assert.equal(result.state, 'failed'); assert.equal(count(db, 'Falha atômica QA'), 0);
      assert.equal(db.sql("SELECT count(*) FROM public.crm_stages WHERE nome='Efeito parcial QA'"), '0'); assert.ok(!JSON.stringify(result.error).includes('segredo-fixture'));
      db.sql('DROP TRIGGER executor_fixture_fail ON public.crm_pipelines;DROP FUNCTION public.executor_fixture_fail()');
    });
    await t.test('revogar CRM, cliente, sessão ou dono nega aprovação e replay terminal', () => {
      const { item } = create('Revogado QA'), completed = create('Replay revogado QA').item; db.decide(completed, 'approve');
      db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.admin}','crm',false)`);
      failure(() => db.decide(item, 'approve')); failure(() => db.decide(completed, 'approve')); assert.equal(saved(item).state, 'proposed'); assert.equal(count(db, 'Revogado QA'), 0);
      assert.equal(db.asUser(`SELECT count(*) FROM public.atlas_execution_items WHERE id='${item.id}'`), '0');
      db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.admin}' AND module_name='crm';UPDATE public.profiles SET role='colaborador' WHERE id='${ids.admin}';INSERT INTO public.user_module_access VALUES('${ids.admin}','clients','responsible');`);
      failure(() => db.decide(item, 'approve')); assert.equal(saved(item).state, 'proposed');
      db.sql(`DELETE FROM public.user_module_access WHERE user_id='${ids.admin}';UPDATE public.profiles SET role='admin' WHERE id='${ids.admin}';UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${ids.session}'`);
      failure(() => db.decide(item, 'approve')); failure(() => db.decide(completed, 'approve'));
      db.sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${ids.session}';UPDATE public.atlas_settings SET enabled=false WHERE id='atlas'`);
      failure(() => db.decide(item, 'approve')); failure(() => db.decide(completed, 'approve')); db.sql("UPDATE public.atlas_settings SET enabled=true WHERE id='atlas'");
    });
    await t.test('duplo clique em dois clientes realmente bloqueados cria somente um registro', async () => {
      const { item } = create('Concorrência QA'), gate = connection(db);
      try {
        gate.child.stdin.write(`BEGIN;SELECT id FROM public.atlas_execution_items WHERE id='${item.id}' FOR UPDATE;SELECT 'LOCKED';\n`); await gate.waitFor('LOCKED');
        const names = ['executor-approve-a', 'executor-approve-b'], pending = names.map(name => concurrent(db, name, db.decideStatement(item, 'approve')));
        await blocked(db, names, 2); gate.child.stdin.end('COMMIT;\n');
        const rows = (await Promise.all(pending)).map(result => JSON.parse(result.stdout.trim().split('\n').at(-1)));
        assert.equal(rows[0].state, 'completed'); assert.deepEqual(rows[0].result, rows[1].result); assert.equal(rows[0].resume_request_id, rows[1].resume_request_id); assert.equal(count(db, 'Concorrência QA'), 1);
      } finally { if (!gate.child.stdin.writableEnded) gate.child.stdin.end('ROLLBACK;\n'); gate.child.kill(); }
    });
    await t.test('revogação durante espera do lock impede gravação após liberar', async () => {
      const { item } = create('Revogação no lock QA'), gate = connection(db);
      try {
        gate.child.stdin.write(`BEGIN;SELECT id FROM public.atlas_execution_items WHERE id='${item.id}' FOR UPDATE;SELECT 'LOCKED';\n`); await gate.waitFor('LOCKED');
        const pending = concurrent(db, 'executor-revoke', db.decideStatement(item, 'approve')).then(result => ({ result }), error => ({ error }));
        await blocked(db, ['executor-revoke'], 1); db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.admin}','crm',false)`); gate.child.stdin.end('COMMIT;\n');
        const { error } = await pending;
        assert.match(error?.stderr || '', /42501/); assert.equal(saved(item).state, 'proposed'); assert.equal(count(db, 'Revogação no lock QA'), 0);
      } finally { if (!gate.child.stdin.writableEnded) gate.child.stdin.end('ROLLBACK;\n'); gate.child.kill(); db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.admin}' AND module_name='crm'`); }
    });
  } finally { db.stop(); }
});
