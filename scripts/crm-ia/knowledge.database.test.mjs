import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { compileKnowledgeSections } from '../../supabase/functions/_shared/crmIaKnowledge.js';

const work = mkdtempSync('/tmp/crm-knowledge-db-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' }, baseline = process.env.CRM_KNOWLEDGE_BASELINE === '1';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, i) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][i])]));
const { admin, staff, client, foreign } = context;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 20000 });
  if (result.error || result.status !== 0) throw Error(result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = input => run('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55722', '-U', 'knowledge_qa', '-d', 'postgres'], input);
const call = (action, payload = {}, uid = admin, scope = client) => JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace(${quote(action)},'${scope}',${json(payload)});COMMIT;`));
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const sections = () => ({ company: { name: '', sector: '', about: '', phone: '', email: '', address: '', website: '' }, hours: [], faq: [], policies: [], context: '' });

test('base estruturada mantém texto, versões, consumidores legados e escopo', async t => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'knowledge_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55722 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text,ADD UNIQUE(cliente_id,from_jid);
      ALTER TABLE public.cliente_whatsapp_inbox ADD UNIQUE(cliente_id,message_id);
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_usuario_acesso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,whatsapp_config_id uuid);
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      ALTER TABLE public.cliente_whatsapp_inbox ADD COLUMN conversation_id uuid REFERENCES public.atendimento_conversas(id);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true),('${foreign}','atendimento_loja',true);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      CREATE FUNCTION public.cliente_atend_is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND status='active')$$;
      CREATE FUNCTION public.cliente_atend_is_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
      GRANT ALL ON public.cliente_atend_ia_bases TO authenticated,service_role;
      ALTER TABLE public.cliente_atend_ia_bases ENABLE ROW LEVEL SECURITY;`);
    sql(migration('20260929040000_cliente_atend_ia.sql').match(/create policy cliente_atend_ia_bases_admin\b[\s\S]*?;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_ia_bases_touch BEFORE UPDATE ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    const chain = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(name => /^\d+_crm_ia_/.test(name) && name <= '20261112064949_crm_ia_manual_receipt.sql').sort();
    assert.equal(chain.length, 21);
    for (const file of chain) sql(migration(file));
    sql('CREATE ROLE knowledge_delegate_qa NOLOGIN;CREATE ROLE knowledge_default_extra_qa NOLOGIN;GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO service_role;GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO knowledge_delegate_qa WITH GRANT OPTION;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO knowledge_default_extra_qa;ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT EXECUTE ON FUNCTIONS TO knowledge_default_extra_qa');
    const legacy = call('save_base', { nome: 'Legado QA', conteudo: '  Conteúdo anterior 👩🏽‍💻.\n' });
    const oldOid = sql("SELECT 'public.crm_ia_workspace(text,uuid,jsonb)'::regprocedure::oid"), oldOwner = sql(`SELECT proowner FROM pg_proc WHERE oid=${oldOid}`);
    const publicPrivileges = () => sql("SELECT jsonb_agg(jsonb_build_array(rolname,has_function_privilege(rolname,'public.crm_ia_workspace(text,uuid,jsonb)','EXECUTE'),has_function_privilege(rolname,'public.crm_ia_workspace(text,uuid,jsonb)','EXECUTE WITH GRANT OPTION')) ORDER BY rolname) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','knowledge_delegate_qa','knowledge_default_extra_qa','knowledge_qa')");
    const oldPrivileges = publicPrivileges();
    const policy = sql("SELECT jsonb_build_object('rls',relrowsecurity,'acl',relacl::text,'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policy p WHERE polrelid=c.oid)) FROM pg_class c WHERE oid='public.cliente_atend_ia_bases'::regclass");
    if (!baseline) sql(migration('20261112095000_crm_ia_knowledge_sections.sql'));

    await t.test('save_base compila a estrutura no servidor sem confiar no texto enviado', () => {
      const value = sections();value.company.name = 'Empresa fictícia';value.context = 'Contexto confirmado.';
      const saved = call('save_base', { nome: 'Estruturada QA', conteudo: 'Não deve prevalecer', crm_ia_sections: value });
      assert.equal(saved.conteudo, 'Empresa\nNome: Empresa fictícia\n\nContexto adicional\nContexto confirmado.');
      assert.deepEqual(saved.crm_ia_sections, value);
      assert.deepEqual(call('workspace').bases.find(row => row.id === saved.id), saved);
    });
    if (baseline) return;

    await t.test('migration não reescreve bases antigas e contexto isolado preserva todos os bytes', () => {
      const row = JSON.parse(sql(`SELECT to_jsonb(b) FROM public.cliente_atend_ia_bases b WHERE id='${legacy.id}'`));
      assert.equal(row.updated_at, legacy.updated_at);assert.equal(row.conteudo, legacy.conteudo);assert.equal(row.crm_ia_sections, null);
      const value = sections();value.context = legacy.conteudo;
      const saved = call('save_base', { id: legacy.id, expected_updated_at: legacy.updated_at, nome: legacy.nome, crm_ia_sections: value });
      assert.equal(saved.conteudo, legacy.conteudo);assert.notEqual(saved.updated_at, legacy.updated_at);
    });

    await t.test('conteúdo legado invalida estrutura; renomear com o mesmo conteúdo a preserva', () => {
      const value = sections();value.company.name = 'Original';
      let saved = call('save_base', { nome: 'Compatibilidade QA', crm_ia_sections: value });
      saved = call('save_base', { id: saved.id, expected_updated_at: saved.updated_at, nome: 'Renomeada QA', conteudo: saved.conteudo });
      assert.deepEqual(saved.crm_ia_sections, value);
      saved = call('save_base', { id: saved.id, expected_updated_at: saved.updated_at, nome: saved.nome, conteudo: 'Alterado por outro consumidor' });
      assert.equal(saved.crm_ia_sections, null);assert.equal(saved.conteudo, 'Alterado por outro consumidor');
      sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';UPDATE public.cliente_atend_ia_bases SET crm_ia_sections=${json(value)},conteudo='Ignorado' WHERE id='${saved.id}';COMMIT;`);
      assert.equal(sql(`SELECT conteudo FROM public.cliente_atend_ia_bases WHERE id='${saved.id}'`), 'Empresa\nNome: Original');
      sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';UPDATE public.cliente_atend_ia_bases SET conteudo='Texto da Loja' WHERE id='${saved.id}';COMMIT;`);
      assert.equal(sql(`SELECT crm_ia_sections IS NULL FROM public.cliente_atend_ia_bases WHERE id='${saved.id}'`), 't');
    });

    await t.test('CAS, conta e papéis não ganham acesso; retorno usa a versão final', () => {
      const value = sections();value.context = 'Versão um';
      const first = call('save_base', { nome: 'Versão QA', crm_ia_sections: value });value.context = 'Versão dois';
      const second = call('save_base', { id: first.id, expected_updated_at: first.updated_at, nome: first.nome, crm_ia_sections: value });
      assert.notEqual(first.updated_at, second.updated_at);
      assert.equal(sql(`SELECT updated_at='${second.updated_at}'::timestamptz FROM public.cliente_atend_ia_bases WHERE id='${first.id}'`), 't');
      assert.throws(() => call('save_base', { id: first.id, expected_updated_at: first.updated_at, nome: first.nome, crm_ia_sections: value }), /versão|alterad|atualiz/i);
      assert.throws(() => call('save_base', { id: second.id, expected_updated_at: second.updated_at, nome: second.nome, crm_ia_sections: value }, admin, foreign), /indisponível|acesso/i);
      assert.throws(() => call('save_base', { nome: 'Sem permissão', crm_ia_sections: value }, staff), /gestão|acesso/i);
    });

    await t.test('tipos, chaves, limites e linhas incompletas são recusados sem gravação parcial', () => {
      const wrong = [];
      for (const key of ['company', 'hours', 'faq', 'policies', 'context']) { const row = sections();row[key] = null;wrong.push(row); }
      wrong.push({ ...sections(), extra: true });
      for (const patch of [{ company: { ...sections().company, name: {} } }, { hours: [{ days: 'Seg', start: '24:00', end: '25:00' }] }, { hours: [{ days: '', start: '09:00', end: '18:00' }] }, { hours: [{ days: 'Seg', start: '18:00', end: '09:00' }] }, { faq: [{ question: 'Sem resposta', answer: '' }] }, { policies: [{ title: 'Sem conteúdo', content: '' }] }, { context: 'á'.repeat(30001) }, { faq: Array.from({ length: 51 }, () => ({ question: 'Q', answer: 'A' })) }]) wrong.push({ ...sections(), ...patch });
      const before = sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.cliente_atend_ia_bases b');
      for (const crm_ia_sections of wrong) assert.throws(() => call('save_base', { nome: 'Recusada QA', crm_ia_sections }), /base|seç|conteúdo|conhecimento|horári|pergunta|polític/i);
      assert.equal(sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.cliente_atend_ia_bases b'), before);
    });

    await t.test('todas as seções e Unicode compilam para os leitores atuais sem execução externa', () => {
      const value = sections();value.company = { name: 'Ápice QA 👩🏽‍💻', sector: 'Serviço', about: 'Linha um\nLinha dois', phone: '+55 11 99999-9999', email: 'qa@example.invalid', address: 'Endereço QA', website: 'https://example.invalid' };
      value.hours = [{ days: 'Seg–Sex', start: '09:00', end: '18:00' }];value.faq = [{ question: 'Como?', answer: 'Com a equipe.' }];value.policies = [{ title: 'Regra', content: 'Não inventar.' }];value.context = 'Contexto final.';
      const saved = call('save_base', { nome: 'Completa QA', crm_ia_sections: value });
      assert.equal(saved.conteudo, compileKnowledgeSections(value));
      for (const text of ['Empresa\nNome: Ápice QA 👩🏽‍💻', 'Atendimento\nSeg–Sex: 09:00–18:00', 'Perguntas frequentes\nPergunta: Como?\nResposta: Com a equipe.', 'Políticas\nRegra\nNão inventar.', 'Contexto adicional\nContexto final.']) assert.ok(saved.conteudo.includes(text), text);
      const exact = sections();exact.context = 'á'.repeat(29999) + '👩';
      assert.equal([...call('save_base', { nome: 'Limite QA', crm_ia_sections: exact }).conteudo].length, 30000);
    });

    await t.test('modelo legado copia o conteúdo compilado em outra conta autorizada sem reaplicar JSON antigo', () => {
      const value = sections();value.company.name = 'Empresa do modelo';value.context = 'Orientação do modelo.';
      const source = call('save_base', { nome: 'Origem modelo QA', crm_ia_sections: value });
      const template = call('save_template', { tipo: 'base', nome: 'Modelo QA', data: { nome: 'Cópia QA', conteudo: source.conteudo } });
      call('apply_template', { id: template.id, revision: template.revision, target_client_id: foreign });
      const copied = call('workspace', {}, admin, foreign).bases.find(row => row.nome === 'Cópia QA');
      assert.equal(copied.conteudo, source.conteudo);assert.equal(copied.crm_ia_sections, null);assert.notEqual(copied.id, source.id);
    });

    await t.test('falha após o delegado desfaz texto e revisão na mesma transação', () => {
      const source = call('save_base', { nome: 'Atomicidade QA', conteudo: 'Anterior' });
      const snapshot = () => sql(`SELECT jsonb_build_object('base',(SELECT to_jsonb(b) FROM public.cliente_atend_ia_bases b WHERE id='${source.id}'),'config',(SELECT to_jsonb(c) FROM public.crm_ia_config c WHERE cliente_id='${client}'))`);
      const before = snapshot();
      sql(`CREATE FUNCTION private.knowledge_fail_qa() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Falha sintética depois do delegado';END$$;CREATE TRIGGER knowledge_fail_qa BEFORE UPDATE OF crm_ia_sections ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION private.knowledge_fail_qa()`);
      try { assert.throws(() => call('save_base', { id: source.id, expected_updated_at: source.updated_at, nome: source.nome, crm_ia_sections: { ...sections(), context: 'Não confirmar' } }), /Falha sintética/); }
      finally { sql('DROP TRIGGER knowledge_fail_qa ON public.cliente_atend_ia_bases;DROP FUNCTION private.knowledge_fail_qa()'); }
      assert.equal(snapshot(), before);
    });

    await t.test('função anterior, owner, RLS e grants de dados são preservados sem acesso direto ao helper', () => {
      assert.equal(sql("SELECT 'public.crm_ia_workspace_pre_knowledge_sections(text,uuid,jsonb)'::regprocedure::oid"), oldOid);
      assert.equal(sql("SELECT proowner FROM pg_proc WHERE oid='public.crm_ia_workspace(text,uuid,jsonb)'::regprocedure"), oldOwner);
      assert.equal(publicPrivileges(), oldPrivileges);
      assert.equal(sql("SELECT jsonb_build_object('rls',relrowsecurity,'acl',relacl::text,'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policy p WHERE polrelid=c.oid)) FROM pg_class c WHERE oid='public.cliente_atend_ia_bases'::regclass"), policy);
      for (const role of ['anon', 'authenticated', 'service_role', 'knowledge_delegate_qa', 'knowledge_default_extra_qa']) {
        assert.equal(sql(`SELECT has_function_privilege('${role}','private.crm_ia_knowledge_text(jsonb)','execute')`), 'f');
        assert.equal(sql(`SELECT has_function_privilege('${role}','public.crm_ia_workspace_pre_knowledge_sections(text,uuid,jsonb)','execute')`), 'f');
      }
      assert.deepEqual(call('usage'), JSON.parse(sql(`SET test.uid='${admin}';SELECT public.crm_ia_workspace_pre_knowledge_sections('usage','${client}','{}')`)));
    });
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});
