BEGIN;

-- Share the canonical rich reader; callers keep their own authorization gates.
CREATE OR REPLACE FUNCTION private.atlas_task_detail_record(p_task uuid,p_client uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH record AS (
 SELECT (
  SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(x)) WHERE key=ANY(ARRAY[
   'id','title','type','priority','due_date','post_date','project_id','client_id','assignee_ids',
   'briefing_payload','briefing_estado','briefing_completo','briefing_legado','briefing_validado_em',
   'stage_execution_history','operational_function_id','demand_type','demand_origin','sla_days',
   'customer_promised_date','review_round','reschedule_reason','planned_channels',
   'workflow_template_id','workflow_stage_key','production_delivered_at','production_delivery_attachment_id',
   'stage_started_at','stage_due_at','recording_scheduled_on'])
 )||jsonb_build_object(
  'description',left(coalesce(x.description,''),12000),'status_value',x.status,'status',coalesce(s.label,x.status),'terminal',coalesce(s.is_terminal,false),
  'assignees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'status',p.status) ORDER BY p.id),'[]') FROM public.profiles p WHERE p.id=ANY(x.assignee_ids)),
  'status_history',(SELECT coalesce(jsonb_agg(entry ORDER BY ord),'[]') FROM (SELECT entry,ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.status_history)='array' THEN x.status_history ELSE '[]' END) WITH ORDINALITY a(entry,ord) ORDER BY ord DESC LIMIT 30) h),
  'comments',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.at,c.id),'[]') FROM (SELECT tc.id,tc.user_id,p.full_name author,tc.created_at at,left(tc.content,3000) body,length(tc.content)>3000 body_truncated FROM public.task_comments tc LEFT JOIN public.profiles p ON p.id=tc.user_id WHERE tc.task_id=x.id ORDER BY tc.created_at DESC,tc.id DESC LIMIT 30) c),
  'justifications',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.created_at,j.id),'[]') FROM (SELECT j.id,j.created_by,p.full_name author,j.deadline_kind,j.due_on,j.workflow_stage_key,j.reason_code,left(j.details,2000) details,length(j.details)>2000 details_truncated,j.created_at FROM public.task_delay_justifications j LEFT JOIN public.profiles p ON p.id=j.created_by WHERE j.task_id=x.id ORDER BY j.created_at DESC,j.id DESC LIMIT 10) j),
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') FROM (SELECT a.id,a.name,a.url,a.provider,a.mime_type,a.publication_id,a.source_url,a.created_at,
   (NOT coalesce(cycle.bad,false) AND (cycle.at IS NULL OR a.created_at>=cycle.at)) after_last_rework FROM public.task_attachments a WHERE a.task_id=x.id ORDER BY a.created_at DESC,a.id DESC LIMIT 20) a),
  'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at,p.id),'[]') FROM (SELECT p.id,p.channel,p.status,p.assignee_id,p.scheduled_for,p.scheduled_at,p.published_on,p.evidence_url,p.meta_post_id,p.destination,p.updated_at,
   (NOT coalesce(cycle.bad,false) AND (cycle.at IS NULL OR
    p.published_on>=(cycle.at AT TIME ZONE 'America/Sao_Paulo')::date AND
    (p.created_at>=cycle.at OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.history)='array' THEN p.history ELSE '[]' END) event
     WHERE event->>'to_status'='published' AND event->>'from_status' IS DISTINCT FROM 'published' AND private.atlas_record_time(event->>'at')>=cycle.at)))) after_last_rework
   FROM public.task_channel_publications p WHERE p.task_id=x.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 20) p),
  'traffic',CASE WHEN x.type='paid_traffic' THEN (
   SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(CASE WHEN jsonb_typeof(c.meta_resumo)='object' THEN c.meta_resumo ELSE '{}' END)
   WHERE key=ANY(ARRAY['period','syncedAt','activeCount','permError','rateLimited'])
  )||jsonb_build_object('has_error',nullif(c.meta_resumo->>'errorMessage','') IS NOT NULL,'running',(
   SELECT coalesce(jsonb_agg(value),'[]') FROM (
    SELECT jsonb_build_object('id',entry->>'id','name',left(entry->>'name',180)) value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.meta_resumo->'running')='array' THEN c.meta_resumo->'running' ELSE '[]' END) entry
    WHERE jsonb_typeof(entry)='object' LIMIT 8
   ) r)) ELSE NULL END,
  'coverage',jsonb_build_object('comments_total',(SELECT count(*) FROM public.task_comments c WHERE c.task_id=x.id),
   'justifications_total',(SELECT count(*) FROM public.task_delay_justifications j WHERE j.task_id=x.id),
   'attachments_total',(SELECT count(*) FROM public.task_attachments a WHERE a.task_id=x.id),
   'publications_total',(SELECT count(*) FROM public.task_channel_publications p WHERE p.task_id=x.id),
   'status_history_total',CASE WHEN jsonb_typeof(x.status_history)='array' THEN jsonb_array_length(x.status_history) ELSE 0 END,
   'description_length',length(coalesce(x.description,'')),'attachment_content_read',false)
 ) value
 FROM public.tarefas x JOIN public.clientes c ON c.id=x.client_id LEFT JOIN public.task_statuses s ON s.value=x.status
 CROSS JOIN LATERAL(SELECT max(private.atlas_record_time(h->>'timestamp')) at,bool_or(private.atlas_record_time(h->>'timestamp') IS NULL) bad
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.status_history)='array' THEN x.status_history ELSE '[]' END) h
  WHERE lower(h->>'status') IN('alteração','alteracao','changes','rework') OR EXISTS(
   SELECT 1 FROM public.task_statuses hs WHERE hs.value=h->>'status' AND lower(hs.label) IN('alteração','alteracao','changes','rework'))) cycle
 WHERE x.id=p_task AND x.client_id=p_client AND (current_user IN('postgres','supabase_admin','service_role') OR public.atlas_is_owner() AND private.planeje_live_session())
 ), checked AS (SELECT value||jsonb_build_object('publication_ready',private.atlas_record_publication_ready(value)) value FROM record)
 SELECT value||jsonb_build_object('source_version',md5(value::text)) FROM checked;
$$;
REVOKE ALL ON FUNCTION private.atlas_task_detail_record(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_task_detail_record(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION private.atlas_task_record(p_thread uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.atlas_task_detail_record(coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid),t.client_id)
 FROM public.atlas_team_threads t WHERE t.id=p_thread;
$$;
CREATE FUNCTION public.atlas_manager_task_detail(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE cid uuid;
BEGIN
 IF NOT public.atlas_is_owner() OR NOT private.planeje_live_session() THEN RAISE EXCEPTION 'Consulta privada indisponível.' USING ERRCODE='42501'; END IF;
 SELECT t.client_id INTO cid FROM public.tarefas t JOIN public.clientes c ON c.id=t.client_id WHERE t.id=p_task AND c.etapa='closed';
 IF cid IS NULL THEN RETURN NULL; END IF;
 RETURN private.atlas_task_detail_record(p_task,cid);
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_task_detail(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_manager_task_detail(uuid) TO authenticated;

CREATE FUNCTION public.atlas_team_read_source(p_request uuid,p_section text,p_reference uuid DEFAULT NULL,p_offset integer DEFAULT 0,p_month text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE ctx jsonb;t public.atlas_team_threads;cid uuid;groups uuid[];gid uuid;records jsonb;coverage jsonb:='{}';
 source_basis jsonb;result jsonb;reason text;available boolean:=true;month text;total integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 ctx:=private.atlas_team_request_context(p_request);
 SELECT th.* INTO t FROM public.atlas_team_threads th JOIN public.atlas_team_requests r ON r.thread_id=th.id WHERE r.id=p_request;
 cid:=t.client_id;
 IF p_section<>ALL(ARRAY['portfolio','client','tasks','task_detail','publications','plans','conversations','conversation','audio_transcript','team','traffic','results']) OR p_offset NOT BETWEEN 0 AND 1000000 OR p_month IS NOT NULL AND p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-01$' THEN RAISE EXCEPTION 'Fonte ou recorte não autorizado.' USING ERRCODE='42501';END IF;
 month:=coalesce(p_month,to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')||'-01');
 SELECT coalesce(array_agg(g.id ORDER BY g.id),'{}') INTO groups FROM public.atendimento_conversas g
 WHERE g.is_group AND NOT coalesce(g.bloqueada,false) AND g.archived_at IS NULL AND private.atlas_event_client(g.id)=cid;
 IF p_section='portfolio' THEN
  SELECT jsonb_build_array(jsonb_build_object('id',c.id,'empresa',c.empresa,'etapa',c.etapa)) INTO records FROM public.clientes c WHERE c.id=cid;
 ELSIF p_section='client' THEN
  records:=jsonb_build_object('id',cid,'scope',ctx->'scope','account_person_id',t.account_person_id);
 ELSIF p_section='tasks' THEN
  records:=ctx->'tasks';coverage:=jsonb_build_object('complete',true,'records_total',jsonb_array_length(coalesce(records,'[]')));
 ELSIF p_section='team' THEN
  records:=ctx->'people';
 ELSIF p_section IN('task_detail','publications') THEN
  IF p_reference IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=p_reference AND x.client_id=cid) THEN RAISE EXCEPTION 'Tarefa fora do cliente.' USING ERRCODE='42501';END IF;
  records:=CASE WHEN p_reference IS NULL THEN ctx->'task' ELSE private.atlas_task_detail_record(p_reference,cid) END;
  IF records IS NULL OR records='null'::jsonb THEN available:=false;reason:='Tarefa não localizada nesta referência.';
  ELSIF p_section='publications' THEN records:=jsonb_build_object('task_id',records->'id','publications',records->'publications','coverage',records->'coverage','task_source_version',records->'source_version');END IF;
 ELSIF p_section='plans' THEN
  SELECT jsonb_build_object('reference_month',month,
   'monthly_scope',(SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM public.client_monthly_scopes s CROSS JOIN LATERAL jsonb_each(to_jsonb(s)) kv WHERE s.client_id=cid AND s.reference_month=month::date AND key=ANY(ARRAY['id','client_id','reference_month','product','deliverables','channels','meta_ads','google_ads','media_goals','account_owner_id','scope_exceptions','plan_status','updated_at'])),
   'projects',coalesce((SELECT jsonb_agg(v ORDER BY v->>'id') FROM (
    SELECT jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'mes_referencia',to_jsonb(p)->'mes_referencia','mes_fim',to_jsonb(p)->'mes_fim','planning_model',to_jsonb(p)->'planning_model','plan_approved_at',to_jsonb(p)->'plan_approved_at',
      'plans',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',cp.id,'source_version',md5(to_jsonb(cp)::text),'updated_at',to_jsonb(cp)->'updated_at','status',to_jsonb(cp)->'status','document_offset',p_offset,'main_document',substr(coalesce(to_jsonb(cp)->>'contexto_ia',''),p_offset+1,6000),'total_characters',length(coalesce(to_jsonb(cp)->>'contexto_ia','')),'next_offset',CASE WHEN length(coalesce(to_jsonb(cp)->>'contexto_ia',''))>p_offset+6000 THEN p_offset+6000 ELSE NULL END)),'[]') FROM public.campaign_plans cp WHERE cp.project_id=p.id)) v
    FROM public.projetos p WHERE p.client_id=cid AND left(to_jsonb(p)->>'mes_referencia',7)<=left(month,7) AND coalesce(left(to_jsonb(p)->>'mes_fim',7),left(to_jsonb(p)->>'mes_referencia',7))>=left(month,7) ORDER BY p.id LIMIT 20) rows),'[]')) INTO records;
  coverage:=jsonb_build_object('complete',false,'month',month,'project_limit',20,'document_characters_per_plan',6000,'note','Aprovação pertence à revisão/mês registrados. Escopo estruturado ausente não prova falta de contrato.');
 ELSIF p_section='conversations' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'display_name',g.display_name,'last_message_at',g.last_message_at,'awaiting_response_since',g.awaiting_response_since) ORDER BY g.id),'[]') INTO records FROM public.atendimento_conversas g WHERE g.id=ANY(groups);
  coverage:=jsonb_build_object('complete',true,'canonical_binding',true,'records_total',cardinality(groups));
  IF cardinality(groups)=0 THEN available:=false;reason:='Nenhum grupo ativo possui vínculo canônico com este cliente. Não foi escolhida conversa pelo nome.';END IF;
 ELSIF p_section IN('conversation','audio_transcript') THEN
  IF p_section='audio_transcript' THEN
   SELECT a.conversation_id INTO gid FROM public.atlas_audio_transcripts a WHERE a.inbox_id=p_reference AND a.owner_id=t.owner_id;
  ELSE gid:=coalesce(p_reference,CASE WHEN cardinality(groups)=1 THEN groups[1] ELSE NULL END);END IF;
  IF gid IS NOT NULL AND NOT gid=ANY(groups) THEN RAISE EXCEPTION 'Conversa fora do cliente.' USING ERRCODE='42501';END IF;
  IF gid IS NULL THEN available:=false;reason:='Escolha o ID de um grupo canonicamente vinculado na listagem; nenhum acesso externo foi tentado.';
  ELSIF p_section='audio_transcript' THEN
   SELECT jsonb_build_object('source_inbox_id',a.inbox_id,'status',a.status,'transcript_offset',p_offset,'transcript',CASE WHEN a.status='completed' THEN substr(a.transcript,p_offset+1,6000) ELSE NULL END,'total_characters',length(a.transcript),'next_offset',CASE WHEN a.status='completed' AND length(a.transcript)>p_offset+6000 THEN p_offset+6000 ELSE NULL END,'automatic',true,'source_version',md5(to_jsonb(a)::text)) INTO records FROM public.atlas_audio_transcripts a WHERE a.inbox_id=p_reference AND a.owner_id=t.owner_id;
   available:=records->>'status'='completed';reason:=CASE WHEN NOT available THEN 'Áudio sem transcrição concluída; não foi ouvido.' END;
  ELSE
   WITH messages AS (
    SELECT 'in:'||i.id::text id,i.created_at at,jsonb_build_object('id','in:'||i.id::text,'at',i.created_at,'sender_name',to_jsonb(i)->>'sender_name','direction','received','type',i.type,'body',CASE WHEN lower(i.type)=ANY(ARRAY['ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message']) THEN CASE WHEN a.status='completed' THEN left(a.transcript,3000) END ELSE left(i.body,3000) END,'audio_status',CASE WHEN lower(i.type)=ANY(ARRAY['ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message']) THEN coalesce(a.status,'pending') END,'source_inbox_id',i.id,'reply_to',coalesce(to_jsonb(i)->>'reply_to_message_id',to_jsonb(i)->>'reply_to'),'body_truncated',CASE WHEN lower(i.type)=ANY(ARRAY['ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message']) THEN length(a.transcript)>3000 ELSE length(i.body)>3000 END) value
    FROM public.cliente_whatsapp_inbox i LEFT JOIN public.atlas_audio_transcripts a ON a.inbox_id=i.id AND a.owner_id=t.owner_id WHERE i.conversation_id=gid AND i.media_purged_at IS NULL
    UNION ALL
    SELECT 'out:'||s.id::text,s.created_at,jsonb_build_object('id','out:'||s.id::text,'at',s.created_at,'direction','sent','author_id',to_jsonb(s)->>'sent_by','body',left(s.body,3000),'body_truncated',length(s.body)>3000) FROM public.cliente_whatsapp_sent s WHERE s.conversation_id=gid
   ) SELECT jsonb_build_object('conversation_id',gid,'messages',(SELECT coalesce(jsonb_agg(value ORDER BY at,id),'[]') FROM (SELECT * FROM messages ORDER BY at DESC,id DESC LIMIT 20 OFFSET p_offset) page),'inventory_version',(SELECT md5(coalesce(string_agg(value::text,E'\n' ORDER BY id),'')) FROM messages)),(SELECT count(*) FROM messages) INTO records,total;
   coverage:=jsonb_build_object('complete',p_offset=0 AND total<=20,'records_total',total,'offset',p_offset,'limit',20,'next_offset',CASE WHEN total>p_offset+20 THEN p_offset+20 ELSE NULL END,'attachment_content_read',false,'note','Recebidas/enviadas registradas; áudio somente com transcrição concluída. Não comprova leitura de anexos nem estado externo da publicação.');
  END IF;
 ELSIF p_section='traffic' THEN
  SELECT jsonb_build_object('client_id',cid,'meta',jsonb_build_object('snapshot',c.meta_resumo,'source','clientes.meta_resumo','external_read_attempted',false),'google',jsonb_build_object('available',false,'external_read_attempted',false,'reason','Métricas Google não possuem snapshot nesta fonte; vínculo não comprova desempenho.','bindings',(SELECT coalesce(jsonb_agg(jsonb_build_object('customer_id',g.google_customer_id,'name',g.google_customer_name)),'[]') FROM public.cliente_google_ads_accounts g WHERE g.cliente_id=cid AND g.is_active))) INTO records FROM public.clientes c WHERE c.id=cid;
  coverage:='{"complete":false,"live_external_verification":false}';
 ELSIF p_section='results' THEN
  available:=false;reason:='Resultados exigem recorte e evidência do CRM. Esta conversa operacional não consultou contatos/vendas nem métricas externas; não é resultado zero.';
 END IF;
 result:=jsonb_build_object('available',coalesce(available,false),'records',records,'coverage',coverage,'reason',reason,'source',p_section,'client_id',cid,'reference_month',month);
 source_basis:=result||jsonb_build_object('groups',groups,'client_scope',ctx->'scope');
 RETURN result||jsonb_build_object('source_version',md5(source_basis::text),'queried_at',now());
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_read_source(uuid,text,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_read_source(uuid,text,uuid,integer,text) TO service_role;

-- Recheck scoped source versions in the same transaction as the existing writer.
CREATE OR REPLACE FUNCTION public.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ref jsonb;actual jsonb;r public.atlas_team_requests;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 IF r.state='processing' THEN
  IF jsonb_typeof(p_result->'investigation_sources')='array' AND jsonb_array_length(p_result->'investigation_sources')>8 THEN RAISE EXCEPTION 'Limite de fontes excedido.';END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(coalesce(p_result->'investigation_sources','[]')) LOOP
   actual:=public.atlas_team_read_source(p_id,ref->>'section',nullif(ref->>'reference_id','')::uuid,coalesce((ref->>'offset')::integer,0),ref->>'reference_month');
   IF nullif(ref->>'source_version','') IS NULL OR actual->>'source_version' IS DISTINCT FROM ref->>'source_version' THEN RAISE EXCEPTION 'As fontes mudaram durante a investigação.' USING ERRCODE='40001';END IF;
  END LOOP;
 END IF;
 RETURN private.atlas_manager_finish(p_id,p_result,p_usage);
END $$;
-- Findings are projected only from the still-current message inventory.
CREATE FUNCTION private.atlas_event_inventory_current(p_job uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;ref jsonb;body text;kind text;audio_state text;found_source boolean;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job;
 IF j.id IS NULL OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id OR j.input->'coverage'->'message_inventory' IS DISTINCT FROM jsonb_build_object(
  'received',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(i.id::text,E'\n' ORDER BY i.id),''),'UTF8')),'hex')) FROM public.cliente_whatsapp_inbox i WHERE i.conversation_id=j.conversation_id AND i.media_purged_at IS NULL),
  'sent',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(s.id::text,E'\n' ORDER BY s.id),''),'UTF8')),'hex')) FROM public.cliente_whatsapp_sent s WHERE s.conversation_id=j.conversation_id)) THEN RETURN false;END IF;
 IF jsonb_typeof(j.input->'messages') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(j.input->'messages') LOOP
  body:=NULL;kind:=NULL;audio_state:=NULL;
  IF ref->>'id' LIKE 'in:%' THEN
   SELECT i.type,CASE WHEN lower(i.type)=ANY(ARRAY['ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message']) THEN CASE WHEN a.status='completed' THEN a.transcript END ELSE i.body END,
    CASE WHEN lower(i.type)=ANY(ARRAY['ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message']) THEN coalesce(a.status,'pending') END
   INTO kind,body,audio_state FROM public.cliente_whatsapp_inbox i LEFT JOIN public.atlas_audio_transcripts a ON a.inbox_id=i.id AND a.owner_id=j.owner_id
   WHERE i.id::text=substr(ref->>'id',4) AND i.conversation_id=j.conversation_id AND i.media_purged_at IS NULL;
   found_source:=FOUND;
   IF body IS NOT NULL THEN body:=regexp_replace(body,'['||chr(1)||'-'||chr(8)||chr(11)||chr(12)||chr(14)||'-'||chr(31)||']','','g');END IF;
   IF audio_state='pending' AND ref->>'audio_state'='historical_unavailable' THEN audio_state:='historical_unavailable';END IF;
   IF audio_state IS DISTINCT FROM ref->>'audio_state' THEN RETURN false;END IF;
  ELSIF ref->>'id' LIKE 'out:%' THEN
   SELECT s.body,'text' INTO body,kind FROM public.cliente_whatsapp_sent s WHERE s.id::text=substr(ref->>'id',5) AND s.conversation_id=j.conversation_id;
   found_source:=FOUND;
  ELSE RETURN false;END IF;
  IF NOT found_source OR body IS DISTINCT FROM ref->>'body' OR kind IS DISTINCT FROM ref->>'type' THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.atlas_event_inventory_current(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_event_inventory_current(uuid) TO service_role;
CREATE FUNCTION private.atlas_event_finding_inventory_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND NEW.versions IS NOT DISTINCT FROM OLD.versions THEN RETURN NEW;END IF;
 IF NOT coalesce(private.atlas_event_inventory_current(NEW.job_id),false) THEN RAISE EXCEPTION 'Novas mensagens mudaram a análise; fontes preservadas para nova conferência.' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_event_finding_inventory_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atlas_event_finding_inventory_guard BEFORE INSERT OR UPDATE OF job_id,versions ON public.atlas_event_findings
 FOR EACH ROW EXECUTE FUNCTION private.atlas_event_finding_inventory_guard();
COMMIT;
