-- Operational events only: never model thoughts, prompts or source content.
BEGIN;
ALTER TABLE public.atlas_team_requests ADD COLUMN activity jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(activity)='array' AND jsonb_array_length(activity)<=96);

CREATE FUNCTION public.atlas_team_record_activity(p_request uuid,p_lease uuid,p_code text,p_status text DEFAULT 'running',p_section text DEFAULT NULL,p_agent text DEFAULT NULL,p_reference uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb;previous jsonb;r public.atlas_team_requests;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 PERFORM private.atlas_model_scope(p_request,NULL,p_lease);
 IF p_code IS NULL OR p_code NOT IN('context','knowledge','source','agent','compose','validate','revalidate','save','budget','error','image')
 OR p_status IS NULL OR p_status NOT IN('running','completed','unavailable','partial','failed','waiting')
 OR p_section IS NOT NULL AND p_section NOT IN('portfolio','client','tasks','task_detail','publications','plans','conversations','conversation','audio_transcript','team','traffic','results')
 OR p_agent IS NOT NULL AND p_agent NOT IN('central','clientes','operacao','estrategia','trafego','resultados')
 OR (p_code='source') IS DISTINCT FROM (p_section IS NOT NULL)
 OR (p_code='agent') IS DISTINCT FROM (p_agent IS NOT NULL)
 OR p_reference IS NOT NULL AND p_code<>'source' THEN
  RAISE EXCEPTION 'Evento operacional inválido.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_request;
 IF p_reference IS NOT NULL AND p_section='task_detail' AND NOT EXISTS(SELECT 1 FROM public.tarefas x JOIN public.atlas_team_threads t ON t.id=r.thread_id WHERE x.id=p_reference AND x.client_id=t.client_id) THEN
  RAISE EXCEPTION 'Fonte fora do cliente.' USING ERRCODE='42501';
 END IF;
 IF jsonb_array_length(r.activity)>=96 THEN RETURN false;END IF;
 item:=jsonb_strip_nulls(jsonb_build_object('code',p_code,'status',p_status,'section',p_section,'agent',p_agent,'reference',p_reference));
 previous:=r.activity->-1;
 IF previous-'at'=item THEN RETURN true;END IF;
 UPDATE public.atlas_team_requests SET activity=activity||jsonb_build_array(item||jsonb_build_object('at',clock_timestamp())) WHERE id=p_request;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_record_activity(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_record_activity(uuid,uuid,text,text,text,text,uuid) TO service_role;

CREATE FUNCTION public.atlas_team_activity(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE checked jsonb;items jsonb;total integer;
BEGIN
 -- Reuse current membership, recipient, session and owner checks; do not invent a second ACL.
 checked:=public.atlas_team_context(p_thread);
 SELECT count(*) INTO total FROM public.atlas_team_requests WHERE thread_id=p_thread;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'actor_id',q.actor_id,'actor_name',(SELECT p.full_name FROM public.profiles p WHERE p.id=q.actor_id),'message_id',q.message_id,
  'created_at',q.created_at,'ready_at',q.ready_at,'state',q.state,'lease_until',q.lease_until,'active',q.state='processing' AND q.lease_until>clock_timestamp(),'error_code',q.result->>'error_code',
  'applied',q.applied,'outcome',CASE WHEN q.state='completed' THEN q.result->>'applied_decision' ELSE NULL END,
  'contact_name',CASE WHEN q.state='completed' THEN (SELECT p.full_name FROM public.profiles p WHERE p.id::text=q.result->>'contact_person_id') END,
  'task_id',CASE WHEN q.state='completed' AND q.applied THEN (SELECT x.id FROM public.tarefas x JOIN public.atlas_team_threads t ON t.id=q.thread_id WHERE x.id::text=q.result->>'task_id' AND x.client_id=t.client_id) END,
  'consultation',(SELECT jsonb_build_object('recipient_name',p.full_name,'scheduled',coalesce((c.management_data->>'dispatch_pending')::boolean,false),
   'sent_at',(SELECT min(m.created_at) FROM public.atlas_team_messages m WHERE m.thread_id=c.id AND m.role='atlas'),
   'answers',(SELECT coalesce(jsonb_agg(z ORDER BY z.created_at),'[]') FROM(SELECT m.created_at,p2.full_name actor_name FROM public.atlas_team_messages m LEFT JOIN public.profiles p2 ON p2.id=m.actor_id WHERE m.thread_id=c.id AND m.role='human' ORDER BY m.created_at DESC LIMIT 5)z),
   'returned_at',CASE WHEN parent.management_data->'owner_contact_return'->>'thread_id'=c.id::text THEN parent.management_data->'owner_contact_return'->>'at' END)
   FROM public.atlas_team_threads c JOIN public.atlas_team_threads parent ON parent.id=q.thread_id LEFT JOIN public.profiles p ON p.id::text=q.result->>'owner_contact_person_id'
   WHERE q.state='completed' AND auth.uid()=parent.owner_id AND c.id::text=q.result->>'owner_contact_thread_id' AND c.owner_id=parent.owner_id AND c.client_id=parent.client_id AND c.management_kind='consultation' AND c.management_data->>'owner_contact_request_id'=q.id::text),
  'events',q.activity,'limited',jsonb_array_length(q.activity)>=96) ORDER BY q.created_at DESC,q.id DESC),'[]') INTO items
 FROM(SELECT * FROM public.atlas_team_requests WHERE thread_id=p_thread ORDER BY created_at DESC,id DESC LIMIT 10)q;
 RETURN jsonb_build_object('current',jsonb_build_object('state',checked->'thread'->>'state','dispatch_pending',checked->'thread'->'management_data'->'dispatch_pending','person_name',(SELECT p.full_name FROM public.profiles p WHERE p.id=(checked->'thread'->>'current_person_id')::uuid)), 'messages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m->>'id','role',m->>'role','created_at',m->>'created_at','actor_name',(SELECT p.full_name FROM public.profiles p WHERE p.id::text=m->>'actor_id')) ORDER BY m->>'created_at'),'[]') FROM jsonb_array_elements(checked->'messages')m), 'requests',items,'complete',total<=10,'queried_at',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_activity(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
