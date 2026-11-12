BEGIN;

CREATE FUNCTION private.atlas_contact_name_prefix(p_text text,p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH matches AS (
  SELECT DISTINCT p.id,n.alias,btrim(substr(p_text,char_length(n.alias)+1)) AS tail
  FROM public.profiles p CROSS JOIN LATERAL (SELECT translate(lower(btrim(p.full_name)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') AS alias
   UNION SELECT translate(lower(split_part(btrim(p.full_name),' ',1)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) n
  WHERE p.id<>p_owner AND p.status='active' AND p.role IN('admin','superadmin','colaborador') AND n.alias<>''
   AND (p_text=n.alias OR left(p_text,char_length(n.alias)+1)=n.alias||' ')
 ), longest AS (SELECT * FROM matches WHERE char_length(alias)=(SELECT max(char_length(alias)) FROM matches))
 SELECT CASE WHEN count(*)=1 THEN jsonb_build_object('person_id',min(id::text),'tail',min(tail)) END FROM longest;
$$;
REVOKE ALL ON FUNCTION private.atlas_contact_name_prefix(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_contact_name_prefix(text,uuid) TO service_role;

CREATE FUNCTION private.atlas_owner_contact_directive(p_text text,p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE body text;original text;clause text;parts text[];prefix text;named jsonb;other jsonb;tail text;topic text;colleague uuid;plan jsonb;directives integer:=0;
 verbs constant text:='(confirm(e|a|ar)|consult(e|a|ar)|pergunt(e|a|ar)|verifi(que|ca|car)|conf(ira|erir)|fal(e|a|ar))';
BEGIN
 body:=translate(lower(p_text),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
 IF body ~ (E'[`"“”‘’]|(^|\\n)[[:space:]]*>|:[[:space:]]*\\n'||'|\m(so|somente|apenas|mas|porem)[[:space:]]+se\M|\m(nao|nunca)[[:space:]]+(agora|mande|envie|chame|fale|pergunte|confirme|consulte|contate|avise)\M') THEN RETURN NULL;END IF;
 IF body ~ '(^|[^[:alnum:]_])(se|caso)[[:space:]]+(precisar|puder|for)([^[:alnum:]_]|$)'
 OR body ~ (E'(^|[,.;!?\\n])[[:space:]]*'||'(se|caso)\M(?![[:space:]]+nao me engano)') THEN RETURN NULL;END IF;
 -- A negative complement requires clarification instead of guessing what was negated.
 parts:=regexp_match(body,'\m'||verbs||'[[:space:]]+(?:com|a|ao|para)\M(.*)$');
 IF parts IS NOT NULL AND parts[array_length(parts,1)] ~ '\m(nao|nunca|nem|talvez)\M' THEN RETURN NULL;END IF;
 FOR original IN SELECT regexp_split_to_table(p_text,E'[,;.!?\\n]') LOOP
  original:=regexp_replace(original,'[[:space:]]+(por favor|por mim)[[:space:]]*$','','i');
  clause:=btrim(translate(lower(original),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'));
  IF clause ~ ('\m'||verbs||'\M') THEN
   prefix:=regexp_replace(clause,'\m'||verbs||'\M.*$','');
   IF prefix ~ '\m(nao|nunca|nem|talvez)\M' OR clause ~ '["“”‘’'']' THEN RETURN NULL;END IF;
  END IF;
  parts:=regexp_match(clause,'^[[:space:]]*(?:(?:por favor|atlas|pode|poderia|voce pode|preciso que|quero que)[[:space:]]+)?'||verbs||'[[:space:]]+(?:com|a|ao|para)[[:space:]]+(?:a[[:space:]]+|o[[:space:]]+)?(.+?)[[:space:]]*$');
  IF parts IS NULL THEN CONTINUE;END IF;
  named:=private.atlas_contact_name_prefix(btrim(regexp_replace(parts[array_length(parts,1)],'[[:space:]]+(por favor|por mim)$','')),p_owner);
  IF named IS NULL THEN RETURN NULL;END IF;
  tail:=named->>'tail';colleague:=NULL;topic:=NULL;
  parts:=regexp_match(tail,'^e (?:peca|pede|pedir) para (?:ela|ele) (?:ver|confirmar|verificar|conferir|falar) com (?:a |o )?(.+)$');
  IF parts IS NOT NULL THEN
   other:=private.atlas_contact_name_prefix(parts[1],p_owner);
   IF other IS NULL OR other->>'tail'<>'' OR other->>'person_id'=named->>'person_id' THEN RETURN NULL;END IF;
   colleague:=(other->>'person_id')::uuid;
  ELSIF tail<>'' THEN
   IF tail !~ '^(se|sobre|quanto a|como|quando|o que|por que)\M' OR char_length(tail)>300 OR tail ~ ('\m'||verbs||'[[:space:]]+(com|a|ao|para|o)\M') THEN RETURN NULL;END IF;
   topic:=right(btrim(original),char_length(tail));
  END IF;
  plan:=jsonb_build_object('person_id',named->>'person_id','colleague_id',colleague,'topic',topic);directives:=directives+1;
 END LOOP;
 RETURN CASE WHEN directives=1 THEN plan END;
END $$;
REVOKE ALL ON FUNCTION private.atlas_owner_contact_directive(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_owner_contact_directive(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.atlas_manager_owner_contact(p_text text,p_owner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (private.atlas_owner_contact_directive(p_text,p_owner)->>'person_id')::uuid;
$$;

-- Preserve writer guards and receipts; only the current owner instruction supplies the contact.
CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;contact uuid;contact_assignees uuid[];ref jsonb;record jsonb;entry jsonb;record_url text;dialogue jsonb;owner_contact uuid;contact_thread uuid;at_work timestamptz;question text;origin public.atlas_team_threads;contact_plan jsonb;owner_clarification boolean:=false;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.state='completed' AND r.applied THEN RETURN jsonb_build_object('saved',true,'replayed',true,'task_id',t.task_id);END IF;
 IF r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text THEN resume:=true;p_result:=r.result;p_usage:='{}';END IF;
 IF r.id IS NULL OR r.state<>'processing' AND NOT resume OR t.management_kind IS NULL OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) OR r.actor_id<>t.owner_id AND NOT private.atlas_team_recipient(t.id) THEN RAISE EXCEPTION 'Sessão, política ou conversa mudou.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira autorizada.';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
 IF nullif(p_result->>'task_context_version','') IS NOT NULL AND p_result->>'task_context_version' IS DISTINCT FROM (private.atlas_team_context_for(t.id,r.actor_id)->'task'->>'source_version') THEN RAISE EXCEPTION 'Os registros da tarefa mudaram durante a análise.' USING ERRCODE='40001';END IF;
 IF NOT resume AND r.lease IS NOT NULL AND (r.lease::text IS DISTINCT FROM p_result->>'worker_lease' OR r.lease_until<=now()) THEN RAISE EXCEPTION 'Lease da resposta mudou.' USING ERRCODE='40001';END IF;
 IF r.lease IS NOT NULL AND p_result->>'task_context_version' IS DISTINCT FROM (private.atlas_team_context_for(t.id,r.actor_id)->'task'->>'source_version') THEN RAISE EXCEPTION 'Registros da tarefa mudaram.' USING ERRCODE='40001';END IF;
 dialogue:=private.atlas_dialogue_checked(p_result->'dialogue');
 ref:=p_result->'evidence_ref';
 IF ref IS NOT NULL AND ref<>'null'::jsonb THEN
  record:=private.atlas_team_context_for(t.id,r.actor_id)->'task';
  IF p_result->>'task_context_version' IS DISTINCT FROM record->>'source_version' OR record IS NULL THEN RAISE EXCEPTION 'Registros de evidência mudaram.' USING ERRCODE='40001';END IF;
  IF ref->>'kind'='task_attachment' THEN
   SELECT a INTO entry FROM jsonb_array_elements(record->'attachments') a WHERE a->>'id'=ref->>'id' AND a->>'after_last_rework'='true';
   record_url:=entry->>'url';
  ELSIF ref->>'kind'='task_publication' THEN
   SELECT a INTO entry FROM jsonb_array_elements(record->'publications') a WHERE a->>'id'=ref->>'id' AND a->>'status'='published' AND a->>'after_last_rework'='true';
   record_url:=entry->>'evidence_url';
  END IF;
  IF record_url IS NULL OR record_url !~ '^https?://[^/@[:space:]]+(/|$)' OR char_length(record_url)>2000 OR p_result->>'evidence_url' IS DISTINCT FROM record_url THEN RAISE EXCEPTION 'Evidência fora da tarefa/rodada autorizada.';END IF;
 END IF;
 kind:=p_result->>'decision';actor:=r.actor_id;
 IF t.management_kind='followup' AND kind='ready' THEN kind:='progress';END IF;
 SELECT md5(to_jsonb(c)::text) INTO basis FROM public.clientes c WHERE c.id=t.client_id;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')::text) INTO tasks_basis FROM public.tarefas x WHERE x.client_id=t.client_id;
 IF resume AND r.result->>'client_basis' IS DISTINCT FROM basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"O cadastro mudou antes da programação. Vamos conferir o escopo novamente antes de criar a tarefa."');END IF;
 IF resume AND t.management_kind='intake' AND r.result->>'tasks_basis' IS DISTINCT FROM tasks_basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"A fila mudou enquanto esse pedido aguardava. Vamos conferir se já tem uma tarefa cuidando disso?"');END IF;
 IF kind IS NULL OR kind NOT IN('ask','ready','progress','blocked','delivered','owner_needed','owner_answered','resolved') OR char_length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 4000 OR char_length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Resposta incompleta.';END IF;
 selected:=nullif(p_result->>'executor_id','')::uuid;
 IF selected IS NOT NULL AND (selected=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=selected AND status='active' AND role IN('admin','superadmin','colaborador'))) THEN RAISE EXCEPTION 'Executor indisponível.';END IF;
 IF t.management_kind='followup' AND actor=t.owner_id THEN
  SELECT private.atlas_owner_contact_directive(m.content,t.owner_id) INTO contact_plan FROM public.atlas_team_messages m WHERE m.id=r.message_id AND m.thread_id=t.id AND m.actor_id=actor;
  owner_contact:=(contact_plan->>'person_id')::uuid;
  IF owner_contact IS NOT NULL THEN
   IF selected IS NOT NULL AND selected<>owner_contact THEN RAISE EXCEPTION 'A pessoa indicada não corresponde ao pedido do dono.' USING ERRCODE='42501';END IF;
   IF t.account_person_id IS DISTINCT FROM private.atlas_manager_account(t.owner_id,t.client_id)
   OR t.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN RAISE EXCEPTION 'O vínculo do assunto mudou.' USING ERRCODE='42501';END IF;
   selected:=owner_contact;kind:='progress';
  END IF;
 END IF;
 IF t.management_data ? 'owner_contact_request_id' THEN
  IF NOT private.atlas_owner_contact_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
  selected:=NULL;
  IF kind IN('owner_needed','blocked') THEN kind:='resolved';END IF;
 END IF;
 IF actor=t.owner_id AND kind='owner_needed' AND t.management_kind<>'owner_context' THEN
  owner_clarification:=t.management_kind='followup' AND t.task_id IS NULL;
  selected:=NULL;kind:=CASE WHEN owner_clarification THEN 'ask' ELSE 'progress' END;
  p_result:=jsonb_set(p_result,'{reply}',to_jsonb(CASE WHEN owner_clarification THEN 'Não localizei a tarefa vinculada. Me diga quem da equipe deve confirmar este assunto.' ELSE 'Recebi esse contexto. Nenhuma consulta à equipe foi enviada a partir desta mensagem.' END));
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on',CASE WHEN owner_clarification THEN 'owner' ELSE 'self' END);END IF;
 END IF;
 IF actor=t.owner_id AND t.management_kind='followup' AND t.task_id IS NULL AND kind='ask' THEN
  owner_clarification:=true;
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on','owner');END IF;
 END IF;
 expected:=nullif(p_result->>'expected_at','')::timestamptz;
 IF expected IS NOT NULL AND (expected<now()-interval '5 minutes' AND NOT (resume AND t.management_kind='followup') OR expected>now()+interval '90 days') THEN RAISE EXCEPTION 'Previsão inválida.';END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR record_url IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
 review:=coalesce(nullif(p_result->>'review_at','')::timestamptz,now()+interval '1 hour');
 IF resume AND t.management_kind='followup' AND review<=now() THEN review:=now()+interval '1 hour';p_result:=jsonb_set(p_result,'{review_at}',to_jsonb(review));END IF;
 review:=private.atlas_manager_work(review,t.owner_id,t.current_person_id);
 IF review<=now() OR review>now()+interval '90 days' THEN RAISE EXCEPTION 'Revisão inválida.';END IF;
 IF kind='delivered' AND nullif(p_result->>'evidence_url','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN kind:='ask';END IF;
 IF kind='ready' THEN
  IF t.management_kind<>'intake' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Alinhe primeiro com o responsável da conta.';END IF;
  IF p_result->>'scope_status' IS DISTINCT FROM 'within_scope' THEN kind:='owner_needed';
  ELSIF nullif(p_result->>'existing_task_id','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_manager_policy WHERE owner_id=t.owner_id AND create_after_clarification) THEN kind:='owner_needed';p_result:=jsonb_set(p_result,'{reply}','"O trabalho foi alinhado com a conta. A criação automática está desligada: revise o repasse nas Demandas deste cliente para criar a tarefa."');
  ELSIF selected IS NULL OR char_length(btrim(coalesce(p_result->>'task_title',''))) NOT BETWEEN 1 AND 180 OR char_length(btrim(coalesce(p_result->>'task_description',''))) NOT BETWEEN 10 AND 6000 THEN kind:='ask';
  ELSE
   existing:=nullif(p_result->>'existing_task_id','')::uuid;
   IF t.origin_job_id IS NOT NULL THEN
    IF jsonb_typeof(p_result->'finding_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'finding_ids')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT coalesce(t.management_data->'demand_ids','[]') ? a.id OR NOT EXISTS(SELECT 1 FROM public.atlas_demands d WHERE d.id::text=a.id AND d.owner_id=t.owner_id AND d.client_id=t.client_id AND d.proposal->>'thread_id'=t.id::text AND d.proposal->>'job_id'=t.origin_job_id::text AND d.state IN('proposed','draft') AND d.updated_at<=r.created_at)) THEN RAISE EXCEPTION 'Selecione somente demandas desta ordem do dono.';END IF;
   ELSE
   IF jsonb_typeof(p_result->'finding_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'finding_ids')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT coalesce(t.management_data->'finding_ids','[]') ? a.id) THEN RAISE EXCEPTION 'Selecione somente pedidos deste alinhamento.';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.id::text=a.id AND f.owner_id=t.owner_id AND f.client_id=t.client_id AND f.thread_id=t.id AND f.state NOT IN('closed','no_action') AND f.updated_at<=r.created_at AND private.atlas_event_client(f.conversation_id)=t.client_id)) THEN RAISE EXCEPTION 'O pedido ou o vínculo do grupo mudou. Refaça o alinhamento antes de criar a tarefa.';END IF;
   END IF;
   IF t.task_id IS NOT NULL AND existing IS DISTINCT FROM t.task_id THEN kind:='ask';
   ELSIF existing IS NOT NULL THEN
    SELECT * INTO task FROM public.tarefas WHERE id=existing AND client_id=t.client_id FOR SHARE;
    IF task.id IS NULL OR EXISTS(SELECT 1 FROM public.task_statuses WHERE value=task.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa existente indisponível.';END IF;
    -- Linking never transfers an existing task or alters its official deadline.
    IF NOT selected=ANY(task.assignee_ids) THEN kind:='ask';question_override:='Essa tarefa está com outra pessoa. Vamos conferir com quem cuida da conta como seguir?';END IF;
    IF EXISTS(SELECT 1 FROM public.atlas_team_threads x WHERE x.owner_id=t.owner_id AND x.task_id=task.id AND x.id<>t.id AND x.state<>'closed' AND (x.origin_job_id IS NULL OR x.management_kind='followup') AND (x.management_kind IS DISTINCT FROM 'consultation' OR NOT x.management_data ? 'owner_contact_request_id')) THEN kind:='ask';question_override:='Já estou acompanhando essa tarefa em outra conversa. Vamos seguir por lá para não cobrar duas vezes.';END IF;
   ELSE
    tasktype:=p_result->>'task_type';
    IF tasktype IS NULL OR tasktype NOT IN('interno','paid_traffic','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo inválido.';END IF;
    SELECT empresa INTO name FROM public.clientes WHERE id=t.client_id;
    v_title:=private.atlas_demand_task_title(name,p_result->>'task_title');
    PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-task:'||t.owner_id::text||t.client_id::text,0));
    SELECT * INTO task FROM public.tarefas x WHERE x.client_id=t.client_id AND lower(btrim(x.title))=lower(btrim(v_title)) AND NOT EXISTS(SELECT 1 FROM public.task_statuses WHERE value=x.status AND is_terminal) LIMIT 1 FOR SHARE;
    IF task.id IS NOT NULL THEN kind:='ask';question_override:='Achei uma tarefa aberta com esse título: '||task.title||'. É esse mesmo trabalho? Assim seguimos nela.';
    ELSE
     days:=CASE WHEN tasktype='interno' THEN coalesce((SELECT inquiry_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),1) ELSE coalesce((SELECT production_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),3) END;
     due:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
     WHILE days>0 LOOP due:=due+1;IF extract(isodow FROM due)<6 THEN days:=days-1;END IF;END LOOP;
     IF expected IS NOT NULL THEN due:=(expected AT TIME ZONE 'America/Sao_Paulo')::date;END IF;
     WHILE extract(isodow FROM due)>5 LOOP due:=due+1;END LOOP;
     SELECT value INTO initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,value LIMIT 1;
     IF initial IS NULL THEN RAISE EXCEPTION 'Etapa inicial indisponível.';END IF;
     -- Automatic execution is deferred outside the recipient's business hours.
     IF private.atlas_manager_work(now(),t.owner_id,selected)>now() THEN kind:='queued';
     ELSE
      INSERT INTO public.tarefas(title,description,status,client_id,owner_id,type,priority,due_date,assignee_ids,status_history)
      VALUES(v_title,left(p_result->>'task_description',6000)||E'\n\nOrigem: alinhamento interno com Atlas. Conversa '||t.id||'. Relato da conta; não comprova execução.',initial,t.client_id,t.owner_id,tasktype,'medium',due,ARRAY[selected],jsonb_build_array(jsonb_build_object('status',initial,'assignee_ids',ARRAY[selected],'user_id',actor,'timestamp',now(),'source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id))) RETURNING * INTO task;
      IF task.assignee_ids IS DISTINCT FROM ARRAY[selected] OR task.due_date IS DISTINCT FROM due THEN RAISE EXCEPTION 'Fluxo alteraria o repasse; verifique a configuração.';END IF;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 body:=coalesce(question_override,p_result->>'reply');
 IF NOT resume AND t.management_data->>'pending_request_id' IS NOT NULL THEN
  UPDATE public.atlas_team_requests SET applied=true,result=result||jsonb_build_object('superseded_by',r.id) WHERE id=(t.management_data->>'pending_request_id')::uuid AND id<>r.id AND NOT applied;
  UPDATE public.atlas_team_threads SET management_data=management_data-'pending_request_id' WHERE id=t.id;
 END IF;
 IF kind='queued' THEN
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=private.atlas_manager_work(now(),t.owner_id,selected),management_data=jsonb_set(management_data,'{pending_request_id}',to_jsonb(r.id::text)),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Fechado. Vou organizar a tarefa no começo do próximo expediente. Ela ainda não foi criada; antes de passar para a equipe, confiro se algo mudou.';
 ELSIF kind='ready' AND task.id IS NOT NULL THEN
  UPDATE public.atlas_team_threads SET task_id=task.id,title=task.title,management_kind='followup',management_data=CASE WHEN origin_job_id IS NOT NULL THEN management_data||'{"consult_organized":true,"recipient_basis":"assignee"}' ELSE management_data END,current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',t.owner_id,selected),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  UPDATE public.atlas_event_findings SET task_id=task.id,revision=revision+1,updated_at=now() WHERE thread_id=t.id AND p_result->'finding_ids' ? id::text;
  IF t.origin_job_id IS NOT NULL THEN UPDATE public.atlas_demands SET task_id=task.id,state='linked',revision=revision+1,updated_at=now() WHERE owner_id=t.owner_id AND client_id=t.client_id AND p_result->'finding_ids' ? id::text AND proposal->>'thread_id'=t.id::text;END IF;
  UPDATE public.atlas_demands d SET task_id=task.id,state='linked',proposal=jsonb_build_object('source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id),revision=d.revision+1,updated_at=now() FROM public.atlas_event_findings f WHERE f.thread_id=t.id AND f.demand_id=d.id AND p_result->'finding_ids' ? f.id::text AND d.state<>'archived';
  UPDATE public.atlas_event_findings SET thread_id=NULL,state='observed',revision=revision+1,updated_at=now() WHERE thread_id=t.id AND NOT p_result->'finding_ids' ? id::text;
  body:='Tarefa '||CASE WHEN existing IS NOT NULL THEN 'vinculada' ELSE 'criada' END||': '||left(task.title,100)||'. '||(SELECT left(split_part(full_name,' ',1),20) FROM public.profiles WHERE id=selected)||', consegue seguir com essa etapa? Prazo: '||coalesce(to_char(task.due_date,'DD/MM/YYYY'),'a combinar')||'. Detalhes no contexto.';
 ELSIF owner_contact IS NOT NULL THEN
  at_work:=private.atlas_manager_work(now(),t.owner_id,selected);
  question:=CASE WHEN contact_plan->>'colleague_id' IS NOT NULL THEN 'Você pode conferir a situação deste assunto com '||(SELECT full_name FROM public.profiles WHERE id=(contact_plan->>'colleague_id')::uuid)||' e me contar o próximo passo?'
   WHEN contact_plan->>'topic' IS NOT NULL THEN 'Pode conferir este ponto: '||(contact_plan->>'topic')||'?'
   ELSE 'Você pode conferir o andamento deste assunto e me contar o próximo passo?' END;
  question:=question||' Referência: '||left(t.title,180)||'.'||CASE WHEN t.task_id IS NULL THEN ' Não localizei a tarefa vinculada; o título é apenas a referência anterior do acompanhamento.' ELSE ' A consulta não altera a tarefa oficial.' END;
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,state,next_review_at,management_kind,management_data)
  VALUES(t.owner_id,t.client_id,t.task_id,t.account_person_id,selected,left('Consulta: '||t.title,200),jsonb_build_object('label','Consulta operacional solicitada pelo dono','text',question,'at',now()),'owner-contact:'||r.id,
   CASE WHEN at_work>now() THEN 'waiting_review' ELSE 'awaiting_reply' END,CASE WHEN at_work>now() THEN at_work ELSE private.atlas_manager_work(now()+interval '1 hour',t.owner_id,selected) END,'consultation',
   jsonb_build_object('owner_contact_request_id',r.id,'dispatch_pending',at_work>now(),'scheduled_at',at_work,'question',question)) RETURNING id INTO contact_thread;
  IF at_work<=now() THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(contact_thread,'atlas',question);END IF;
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=NULL,summary=p_result->>'summary',management_data=management_data||jsonb_build_object('owner_contact_thread_id',contact_thread),revision=revision+1,updated_at=now() WHERE id=t.id;
  p_result:=p_result||jsonb_build_object('owner_contact_thread_id',contact_thread,'owner_contact_person_id',selected);
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on','team','next_action','Aguardar retorno da consulta operacional');END IF;
  body:=CASE WHEN t.task_id IS NULL THEN 'Não localizei a tarefa vinculada. ' ELSE '' END||CASE WHEN at_work>now() THEN 'Agendei a consulta com ' ELSE 'Registrei a consulta para ' END||(SELECT full_name FROM public.profiles WHERE id=selected)||CASE WHEN at_work>now() THEN ' no próximo expediente. Ainda não enviei a pergunta.' ELSE '. Assim que houver resposta, trago o relato por aqui.' END;
 ELSIF kind='resolved' AND t.management_data ? 'owner_contact_request_id' THEN
  SELECT parent.* INTO origin FROM public.atlas_team_threads parent JOIN public.atlas_team_requests source ON source.thread_id=parent.id WHERE source.id=(t.management_data->>'owner_contact_request_id')::uuid AND parent.owner_id=t.owner_id AND parent.client_id=t.client_id AND parent.management_data->>'owner_contact_thread_id'=t.id::text FOR UPDATE OF parent;
  IF origin.id IS NULL THEN RAISE EXCEPTION 'Assunto de origem indisponível.' USING ERRCODE='42501';END IF;
  body:='Retorno de '||(SELECT full_name FROM public.profiles WHERE id=actor)||' (relato recebido em '||to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'): '||(p_result->>'summary');
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(origin.id,'atlas',body);
  UPDATE public.atlas_team_threads SET summary=left(body,2000),management_data=(management_data-'owner_contact_thread_id')||jsonb_build_object('owner_contact_return',jsonb_build_object('thread_id',t.id,'actor_id',actor,'at',now(),'summary',p_result->>'summary')),state='waiting_review',next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=origin.id;
  UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{dialogue}',coalesce(management_data->'dialogue','{}')||jsonb_build_object('waiting_on','none','next_action','Conferir o relato recebido','missing_field',NULL)) WHERE id=origin.id;
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Registrei seu relato e trouxe o retorno à conversa que originou esta consulta.';
 ELSIF kind='owner_answered' THEN
  IF actor<>t.owner_id OR t.management_kind<>'owner_context' OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Informação exclusiva do dono.';END IF;
  parent:=nullif(t.management_data->>'parent_thread','')::uuid;
  IF parent IS NOT NULL THEN
   UPDATE public.atlas_team_threads SET state='awaiting_reply',current_person_id=account_person_id,next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=jsonb_set(management_data,'{owner_direction}',jsonb_build_object('summary',p_result->>'summary','request_id',r.id,'at',now())),revision=revision+1,updated_at=now() WHERE id=parent AND owner_id=t.owner_id AND client_id=t.client_id AND state<>'closed';
   IF NOT FOUND THEN RAISE EXCEPTION 'Assunto de origem indisponível.';END IF;
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(parent,'atlas','O Josias passou a orientação: '||(p_result->>'summary')||' Com isso, falta alguma coisa para seguirmos?');
  END IF;
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic,source_request_id,team_shared,team_shared_at)
  SELECT t.owner_id,t.client_id,left(p_result->>'summary',4000),'user_confirmation',left(m.content,2000),'direcao_operacional',r.id,true,now() FROM public.atlas_team_messages m WHERE m.id=r.message_id;
  body:='Fechado, guardei essa orientação. '||CASE WHEN parent IS NOT NULL THEN 'Vou seguir com quem cuida da conta. Sua conversa comigo fica por aqui.' ELSE 'Vou usar isso nos próximos passos desse cliente.' END;
 ELSIF kind='owner_needed' AND t.management_kind<>'owner_context' THEN
  INSERT INTO public.atlas_team_threads(owner_id,client_id,account_person_id,current_person_id,title,shared_context,source_key,state,management_kind,management_data)
  VALUES(t.owner_id,t.client_id,t.owner_id,t.owner_id,left('Decisão: '||t.title,200),jsonb_build_object('text',p_result->>'summary','label','Decisão que falta ao acompanhamento interno','at',now()),'manager-decision:'||r.id,'needs_owner','owner_context',jsonb_build_object('needs_account',false,'parent_thread',t.id)) RETURNING id INTO owner_thread;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(owner_thread,'atlas',left(p_result->>'reply',4000));
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Esse ponto depende de uma decisão do Josias. Já levei a dúvida para ele; quando responder, seguimos por aqui.';
 ELSIF kind IN('owner_needed','delivered') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN kind='delivered' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN kind='delivered' THEN account_person_id ELSE owner_id END,next_review_at=NULL,summary=p_result->>'summary',evidence_url=nullif(p_result->>'evidence_url',''),revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSIF kind='resolved' THEN
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSE
  IF kind IN('progress','blocked') AND selected IS NOT NULL AND selected<>t.current_person_id THEN
   IF NOT (t.management_kind='followup' AND EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND cardinality(x.assignee_ids)=1 AND selected=ANY(x.assignee_ids))) AND (t.management_kind<>'followup' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor
   OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='human' AND m.actor_id=actor AND m.created_at<=r.created_at AND private.atlas_manager_named_executor(m.content,t.owner_id)=selected)
   OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id))
   THEN RAISE EXCEPTION 'A conta precisa identificar a pessoa nesta conversa.' USING ERRCODE='42501';END IF;
   IF private.atlas_manager_work(now(),t.owner_id,selected)>now() THEN
    kind:='queued';
    UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=private.atlas_manager_work(now(),owner_id,selected),summary=p_result->>'summary',management_data=jsonb_set(management_data,'{pending_request_id}',to_jsonb(r.id::text)),revision=revision+1,updated_at=now() WHERE id=t.id;
    body:='Fechado. Vou seguir com o responsável dessa etapa no próximo expediente. Ainda não chamei a pessoa; confiro os registros antes de continuar.';
   ELSE
    contact:=selected;SELECT x.assignee_ids INTO contact_assignees FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id;
    UPDATE public.atlas_team_threads SET current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(review,owner_id,selected),expected_at=expected,summary=p_result->>'summary',management_data=(management_data-'pending_request_id')||jsonb_build_object('contact_request_id',r.id,'contact_person_id',selected),revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
    body:=CASE WHEN actor=t.account_person_id THEN 'Quem cuida da conta explicou: ' ELSE 'A tarefa está atribuída a você e a etapa foi atualizada: ' END||left(coalesce(dialogue->>'next_action',p_result->>'summary'),220)||'. Os ajustes e as fontes estão no contexto deste assunto.';
   END IF;
  ELSE
   UPDATE public.atlas_team_threads SET current_person_id=CASE WHEN owner_clarification THEN owner_id ELSE current_person_id END,state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=CASE WHEN actor=t.owner_id AND t.management_kind='followup' AND t.task_id IS NULL THEN NULL ELSE review END,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 IF dialogue IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE id=t.id AND current_person_id IS DISTINCT FROM t.current_person_id AND state='awaiting_reply') THEN dialogue:=jsonb_set(dialogue,'{waiting_on}','"self"');END IF;
  UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{dialogue}',dialogue) WHERE id=t.id;
 END IF;
 IF kind='resolved' AND body ~* '(exclu|apag)' THEN body:='Fechei este acompanhamento. Nenhuma tarefa foi excluída por essa ação.';END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis,'contact_person_id',contact,'contact_assignee_ids',contact_assignees,'attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;

COMMIT;
