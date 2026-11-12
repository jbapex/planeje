-- Production installation, independently tested from the current productive schema.
BEGIN;

-- Original private-stage definition: 20261016225723_atlas_event_context_pipeline.sql
-- Event/context pilot. No webhook path, tarefa or external-message writer is changed.
CREATE TABLE public.atlas_event_config(
 owner_id uuid PRIMARY KEY REFERENCES public.profiles(id),enabled boolean NOT NULL DEFAULT false,
 mode text NOT NULL DEFAULT 'observe' CHECK(mode IN('observe','assist')),
 client_ids uuid[] NOT NULL DEFAULT '{}',history_messages integer NOT NULL DEFAULT 100 CHECK(history_messages BETWEEN 20 AND 300),
 quiet_seconds integer NOT NULL DEFAULT 90 CHECK(quiet_seconds BETWEEN 15 AND 600),max_wait_seconds integer NOT NULL DEFAULT 300 CHECK(max_wait_seconds BETWEEN 60 AND 1800),
 review_seconds integer NOT NULL DEFAULT 3600 CHECK(review_seconds BETWEEN 600 AND 86400),
 max_tokens_per_day integer NOT NULL DEFAULT 60000 CHECK(max_tokens_per_day BETWEEN 1000 AND 1000000),
 started_at timestamptz NOT NULL DEFAULT now(),heartbeat_at timestamptz,last_scan_at timestamptz,last_error text,
 usage_day date,used_tokens integer NOT NULL DEFAULT 0,reserved_tokens integer NOT NULL DEFAULT 0,model_calls integer NOT NULL DEFAULT 0,
 CHECK(max_wait_seconds>=quiet_seconds)
);
CREATE TABLE public.atlas_event_groups(
 owner_id uuid NOT NULL REFERENCES public.profiles(id),conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
 client_id uuid REFERENCES public.clientes(id),state text NOT NULL DEFAULT 'idle',reason text,seen jsonb NOT NULL DEFAULT '{}',
 source_hash text,coverage jsonb NOT NULL DEFAULT '{}',checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,conversation_id)
);
CREATE TABLE public.atlas_event_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
 fingerprint text NOT NULL,kind text NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','completed','error','budget_wait','blocked','superseded')),
 input jsonb NOT NULL,coverage jsonb NOT NULL DEFAULT '{}',result jsonb,source_refs jsonb NOT NULL DEFAULT '[]',ready_at timestamptz NOT NULL,
 lease uuid,lease_until timestamptz,reserved_tokens integer NOT NULL DEFAULT 0,usage jsonb NOT NULL DEFAULT '{}',attempt integer NOT NULL DEFAULT 0,error text,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,UNIQUE(owner_id,fingerprint)
);
CREATE INDEX atlas_event_jobs_queue ON public.atlas_event_jobs(owner_id,ready_at) WHERE state IN('queued','error','budget_wait','processing');
CREATE TABLE public.atlas_event_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.atlas_event_jobs(id),request_key text NOT NULL,intent text NOT NULL,title text NOT NULL,summary text NOT NULL,
 task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,account_id uuid REFERENCES public.profiles(id),thread_id uuid REFERENCES public.atlas_team_threads(id) ON DELETE SET NULL,
 route text NOT NULL CHECK(route IN('account','owner','review','none')),state text NOT NULL DEFAULT 'proposed',question text NOT NULL DEFAULT '',sources jsonb NOT NULL DEFAULT '[]',
 versions jsonb NOT NULL DEFAULT '[]',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,conversation_id,request_key),CHECK(char_length(title) BETWEEN 1 AND 200)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['atlas_event_config','atlas_event_groups','atlas_event_jobs','atlas_event_findings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY atlas_event_owner_read ON public.%I FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()))',tab);
 END LOOP;
END $$;

-- Explicit registered group binding wins; multiple bindings fail closed.
CREATE FUNCTION private.atlas_event_client(p_conversation uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.atendimento_conversas; ids uuid[];
BEGIN
 SELECT * INTO g FROM public.atendimento_conversas WHERE id=p_conversation AND is_group AND NOT bloqueada AND archived_at IS NULL;
 IF g.id IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(id) INTO ids FROM public.clientes WHERE (
 entregaveis->'whatsapp_grupo'->>'conversation_id'=g.id::text OR
 (entregaveis->'whatsapp_grupo'->>'chat_jid'=g.chat_jid AND entregaveis->'whatsapp_grupo'->>'wa_cliente_id'=g.cliente_id::text));
 IF cardinality(ids)=1 THEN RETURN CASE WHEN EXISTS(SELECT 1 FROM public.clientes WHERE id=ids[1] AND etapa='closed') THEN ids[1] ELSE NULL END;ELSIF cardinality(ids)>1 THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.clientes WHERE id=g.cliente_id AND etapa='closed') THEN RETURN g.cliente_id;END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.atlas_event_client(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_event_client(uuid) TO service_role;

CREATE FUNCTION private.atlas_event_settings(p_value jsonb,p_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.atlas_event_config;ids uuid[];
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Gestor atual necessário.' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=auth.uid() FOR UPDATE;
 IF c.owner_id IS NULL THEN RAISE EXCEPTION 'Motor ainda não instalado para esta conta.';END IF;
 IF p_value->>'mode'='assist' AND p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme as chamadas internas para os clientes selecionados.';END IF;
 ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_value->'client_ids',to_jsonb(c.client_ids))));
 IF EXISTS(SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=i AND etapa='closed')) THEN RAISE EXCEPTION 'Cliente fora da carteira atual.';END IF;
 UPDATE public.atlas_event_config SET enabled=coalesce((p_value->>'enabled')::boolean,enabled),mode=coalesce(p_value->>'mode',mode),client_ids=ids,history_messages=coalesce((p_value->>'history_messages')::integer,history_messages),quiet_seconds=coalesce((p_value->>'quiet_seconds')::integer,quiet_seconds),max_wait_seconds=coalesce((p_value->>'max_wait_seconds')::integer,max_wait_seconds),review_seconds=coalesce((p_value->>'review_seconds')::integer,review_seconds),max_tokens_per_day=coalesce((p_value->>'max_tokens_per_day')::integer,max_tokens_per_day) WHERE owner_id=auth.uid() RETURNING * INTO c;
 RETURN to_jsonb(c)-'owner_id';
END $$;
CREATE FUNCTION public.atlas_event_settings(p_value jsonb,p_confirmed boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.atlas_event_settings(p_value,p_confirmed);$$;

REVOKE ALL ON FUNCTION private.atlas_event_settings(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_event_settings(jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_event_settings(jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_event_settings(jsonb,boolean) TO authenticated;

CREATE FUNCTION public.atlas_event_enqueue(p_owner uuid,p_conversation uuid,p_client uuid,p_fingerprint text,p_input jsonb,p_coverage jsonb,p_sources jsonb,p_kind text,p_ready timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=p_owner AND c.enabled AND p.status='active' AND p.role IN('admin','superadmin') AND p_client=ANY(c.client_ids)) OR private.atlas_event_client(p_conversation) IS DISTINCT FROM p_client THEN RAISE EXCEPTION 'Fonte fora do cliente autorizado.';END IF;
 IF char_length(p_fingerprint) NOT BETWEEN 1 AND 150 OR octet_length(p_input::text)>250000 OR jsonb_typeof(p_input)<>'object' OR jsonb_typeof(p_sources)<>'array' THEN RAISE EXCEPTION 'Contexto fora do limite.';END IF;
 UPDATE public.atlas_event_jobs SET state='superseded',error='Agrupado em versão mais recente da conversa.' WHERE owner_id=p_owner AND conversation_id=p_conversation AND state IN('queued','budget_wait','blocked') AND fingerprint<>p_fingerprint AND kind='messages' AND p_kind='messages';
 INSERT INTO public.atlas_event_jobs(owner_id,client_id,conversation_id,fingerprint,kind,input,coverage,source_refs,ready_at) VALUES(p_owner,p_client,p_conversation,p_fingerprint,p_kind,p_input,p_coverage,p_sources,p_ready) ON CONFLICT(owner_id,fingerprint) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.atlas_event_jobs WHERE owner_id=p_owner AND fingerprint=p_fingerprint;END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.atlas_event_claim(p_owner uuid,p_estimate integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;c public.atlas_event_config;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled FOR UPDATE;
 IF c.owner_id IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND ready_at<=now() AND (state IN('queued','error','budget_wait') OR state='processing' AND lease_until<now()) AND attempt<3 ORDER BY ready_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 IF c.usage_day IS DISTINCT FROM day THEN UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,reserved_tokens=0,model_calls=0 WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 -- Expired/unknown calls retain their conservative reservation instead of becoming free retries.
 IF j.state='processing' THEN UPDATE public.atlas_event_config SET used_tokens=used_tokens+j.reserved_tokens,reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 IF c.used_tokens+c.reserved_tokens+p_estimate>c.max_tokens_per_day THEN UPDATE public.atlas_event_jobs SET state='budget_wait',ready_at=now()+interval '15 minutes',error='Limite de tokens do piloto; fonte preservada na fila.' WHERE id=j.id;RETURN NULL;END IF;
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=p_owner;
 UPDATE public.atlas_event_jobs SET state='processing',attempt=attempt+1,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',reserved_tokens=p_estimate,error=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.atlas_event_finish(p_job uuid,p_lease uuid,p_result jsonb,p_usage jsonb,p_error text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;tokens integer;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='processing' AND lease=p_lease FOR UPDATE;
 IF j.id IS NULL THEN RETURN false;END IF;
 tokens:=CASE WHEN (p_usage->>'total_tokens')~'^[0-9]+$' THEN (p_usage->>'total_tokens')::integer ELSE j.reserved_tokens END;
 UPDATE public.atlas_event_config SET used_tokens=used_tokens+greatest(tokens,0),reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=j.owner_id;
 UPDATE public.atlas_event_jobs SET state=CASE WHEN p_error IS NULL THEN 'completed' ELSE 'error' END,result=p_result,usage=p_usage,error=left(p_error,500),lease=NULL,lease_until=NULL,reserved_tokens=0,finished_at=now(),ready_at=now()+interval '5 minutes' WHERE id=j.id;
 RETURN true;
END $$;

CREATE FUNCTION public.atlas_event_publish(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;item jsonb;old public.atlas_event_findings;total integer:=0;task uuid;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' FOR UPDATE;
 IF j.id IS NULL OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=j.owner_id AND c.enabled AND j.client_id=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin')) THEN RAISE EXCEPTION 'Fonte atual indisponível.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(j.result->'items') LOOP
  task:=nullif(item->>'task_id','')::uuid;
  IF task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND client_id=j.client_id) THEN RAISE EXCEPTION 'Tarefa fora do cliente atual.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sources') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input->'messages') m WHERE m->>'id'=x.value)) THEN RAISE EXCEPTION 'Fonte fora do contexto.';END IF;
  SELECT * INTO old FROM public.atlas_event_findings WHERE owner_id=j.owner_id AND conversation_id=j.conversation_id AND request_key=item->>'request_key' FOR UPDATE;
  IF old.job_id=j.id THEN CONTINUE;END IF;
  IF item->>'route' NOT IN('account','owner','review','none') OR char_length(item->>'title') NOT BETWEEN 1 AND 200 OR char_length(item->>'summary') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Assunto inválido.';END IF;
  INSERT INTO public.atlas_event_findings(owner_id,client_id,conversation_id,job_id,request_key,intent,title,summary,task_id,route,question,sources,versions,state)
   VALUES(j.owner_id,j.client_id,j.conversation_id,j.id,item->>'request_key',item->>'intent',item->>'title',item->>'summary',task,item->>'route',item->>'question',item->'sources',jsonb_build_array(jsonb_build_object('job_id',j.id,'result',item,'at',now())),CASE WHEN item->>'route'='none' THEN 'no_action' ELSE 'observed' END)
   ON CONFLICT(owner_id,conversation_id,request_key) DO UPDATE SET job_id=excluded.job_id,intent=excluded.intent,title=excluded.title,summary=excluded.summary,task_id=excluded.task_id,route=excluded.route,question=excluded.question,sources=excluded.sources,versions=public.atlas_event_findings.versions||excluded.versions,state=CASE WHEN public.atlas_event_findings.thread_id IS NOT NULL THEN 'update_for_review' ELSE excluded.state END,revision=public.atlas_event_findings.revision+1,updated_at=now();
  total:=total+1;
 END LOOP;
 RETURN total;
END $$;

-- Opening an internal question never changes a tarefa or sends WhatsApp.
CREATE FUNCTION public.atlas_event_open_account(p_finding uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;c public.atlas_event_config;t public.tarefas;account uuid;result uuid;names uuid[];text text;
BEGIN
 SELECT * INTO f FROM public.atlas_event_findings WHERE id=p_finding FOR UPDATE;
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=f.owner_id AND enabled AND mode='assist';
 IF c.owner_id IS NULL OR NOT f.client_id=ANY(c.client_ids) OR f.route<>'account' OR f.state NOT IN('proposed','observed') OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM f.client_id THEN RAISE EXCEPTION 'Pergunta automática não autorizada.';END IF;
 SELECT array_agg(p.id) INTO names FROM public.clientes cl JOIN public.profiles p ON lower(btrim(p.full_name))=lower(btrim(cl.responsavel)) AND p.status='active' AND p.role IN('admin','superadmin','colaborador') WHERE cl.id=f.client_id AND cl.etapa='closed';
 IF cardinality(names) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Responsável da conta precisa ser confirmado.';END IF;account:=names[1];
 SELECT * INTO t FROM public.tarefas WHERE id=f.task_id AND client_id=f.client_id FOR SHARE;
 IF t.id IS NULL OR EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa candidata indisponível; revisão necessária.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=f.owner_id AND enabled) THEN RAISE EXCEPTION 'Conversa interna indisponível.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team-start:'||f.owner_id::text||t.id::text,0));
 SELECT id INTO result FROM public.atlas_team_threads WHERE owner_id=f.owner_id AND task_id=t.id AND state<>'closed';
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE id=result AND client_id=f.client_id AND account_person_id=account) THEN RAISE EXCEPTION 'Acompanhamento existente exige revisão.';END IF;
 ELSE
  SELECT 'Pedido recebido no grupo: '||coalesce(string_agg(left(m->>'body',900),E'\n'),'Fonte pendente de conferência')||E'\nTarefa candidata: '||left(t.title,200) INTO text FROM public.atlas_event_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.input->'messages') m WHERE j.id=f.job_id AND f.sources ? (m->>'id');
  text:=left(text,3500);
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at) VALUES(f.owner_id,f.client_id,t.id,account,account,left(t.title,200),jsonb_build_object('text',text,'label','Pedido do grupo para esclarecimento interno','at',now(),'event_finding',f.id),'event-finding:'||f.id,now()+interval '1 hour') RETURNING id INTO result;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(result,'atlas','Oi! Chegou um pedido relacionado a '||left(t.title,200)||'. '||'Confirma se o pedido se refere a esta tarefa e o que precisa ser ajustado? A origem está no contexto deste assunto. Estou pedindo esclarecimento; o responsável e o prazo oficial da tarefa permanecem iguais.');
 END IF;
 UPDATE public.atlas_event_findings SET thread_id=result,account_id=account,state='account_contacted',revision=revision+1,updated_at=now() WHERE id=f.id;RETURN result;
END $$;
DO $$ DECLARE p record;BEGIN
 FOR p IN SELECT oid::regprocedure name FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('atlas_event_enqueue','atlas_event_claim','atlas_event_finish','atlas_event_publish','atlas_event_open_account') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p.name);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.name);END LOOP;
END $$;
CREATE TABLE public.atlas_event_signals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,kind text NOT NULL,source_id text NOT NULL,source_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.atlas_event_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_event_signals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_event_signals TO authenticated;
GRANT ALL ON public.atlas_event_signals TO service_role;
CREATE POLICY atlas_event_signal_owner ON public.atlas_event_signals FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.atlas_is_owner() AND private.planeje_live_session());
CREATE INDEX atlas_event_signal_source ON public.atlas_event_signals(owner_id,client_id,created_at,id);
CREATE FUNCTION private.atlas_event_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row jsonb:=to_jsonb(NEW);prior jsonb;signature jsonb;old_signature jsonb;g uuid;cl uuid;t uuid;own uuid;
BEGIN
 signature:=row-ARRAY['raw_payload','unread_count','ack_status','lease_token','lease_until','attempt','retry_at'];
 IF TG_OP='UPDATE' THEN prior:=to_jsonb(OLD);old_signature:=prior-ARRAY['raw_payload','unread_count','ack_status','lease_token','lease_until','attempt','retry_at'];IF signature=old_signature THEN RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME IN('cliente_whatsapp_inbox','cliente_whatsapp_sent','atlas_audio_transcripts') THEN
  g:=nullif(row->>'conversation_id','')::uuid;cl:=private.atlas_event_client(g);
 ELSIF TG_TABLE_NAME='tarefas' THEN cl:=nullif(row->>'client_id','')::uuid;t:=(row->>'id')::uuid;
 ELSIF TG_TABLE_NAME='task_comments' THEN t:=(row->>'task_id')::uuid;SELECT client_id INTO cl FROM public.tarefas WHERE id=t;
 END IF;
 IF cl IS NULL THEN RETURN NEW;END IF;
 FOR own IN SELECT c.owner_id FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.enabled AND cl=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin') LOOP
  INSERT INTO public.atlas_event_signals(owner_id,client_id,conversation_id,task_id,kind,source_id,source_version) VALUES(own,cl,g,t,TG_TABLE_NAME,coalesce(row->>'id',row->>'inbox_id'),md5(signature::text));
 END LOOP;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- A reconciliation scan remains available; queue maintenance never rejects WhatsApp ingress.
 RAISE WARNING 'Atlas event signal unavailable; reconciliation required';RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_event_signal() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER atlas_event_inbox AFTER INSERT OR UPDATE ON public.cliente_whatsapp_inbox FOR EACH ROW EXECUTE FUNCTION private.atlas_event_signal();
CREATE TRIGGER atlas_event_sent AFTER INSERT OR UPDATE ON public.cliente_whatsapp_sent FOR EACH ROW EXECUTE FUNCTION private.atlas_event_signal();
CREATE TRIGGER atlas_event_audio AFTER INSERT OR UPDATE ON public.atlas_audio_transcripts FOR EACH ROW EXECUTE FUNCTION private.atlas_event_signal();
CREATE TRIGGER atlas_event_task AFTER INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION private.atlas_event_signal();
CREATE TRIGGER atlas_event_comment AFTER INSERT OR UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION private.atlas_event_signal();

-- Original private-stage definition: 20261016231835_atlas_event_context_guards.sql
-- Recheck the current Atlas owner at every worker write; preserve sources across retries.
CREATE FUNCTION private.atlas_event_enabled(p_owner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.atlas_settings s ON s.id='atlas' AND s.owner_id=c.owner_id JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=p_owner AND c.enabled AND s.enabled AND p.status='active' AND p.role IN('admin','superadmin'));
$$;
REVOKE ALL ON FUNCTION private.atlas_event_enabled(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_event_enabled(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.atlas_event_enqueue(p_owner uuid,p_conversation uuid,p_client uuid,p_fingerprint text,p_input jsonb,p_coverage jsonb,p_sources jsonb,p_kind text,p_ready timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT private.atlas_event_enabled(p_owner) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=p_owner AND c.enabled AND p.status='active' AND p.role IN('admin','superadmin') AND p_client=ANY(c.client_ids)) OR private.atlas_event_client(p_conversation) IS DISTINCT FROM p_client THEN RAISE EXCEPTION 'Fonte fora do cliente autorizado.';END IF;
 IF char_length(p_fingerprint) NOT BETWEEN 1 AND 150 OR octet_length(p_input::text)>250000 OR jsonb_typeof(p_input)<>'object' OR jsonb_typeof(p_sources)<>'array' THEN RAISE EXCEPTION 'Contexto fora do limite.';END IF;
 UPDATE public.atlas_event_jobs SET state='superseded',error='Agrupado em versão mais recente da conversa.' WHERE owner_id=p_owner AND conversation_id=p_conversation AND state IN('queued','budget_wait','blocked','error') AND fingerprint<>p_fingerprint AND kind='messages' AND p_kind='messages';
 INSERT INTO public.atlas_event_jobs(owner_id,client_id,conversation_id,fingerprint,kind,input,coverage,source_refs,ready_at) VALUES(p_owner,p_client,p_conversation,p_fingerprint,p_kind,p_input,p_coverage,p_sources,p_ready) ON CONFLICT(owner_id,fingerprint) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.atlas_event_jobs WHERE owner_id=p_owner AND fingerprint=p_fingerprint;END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.atlas_event_claim(p_owner uuid,p_estimate integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;c public.atlas_event_config;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND private.atlas_event_enabled(p_owner) FOR UPDATE;
 IF c.owner_id IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND ready_at<=now() AND (state IN('queued','error','budget_wait') OR state='processing' AND lease_until<now()) AND attempt<3 ORDER BY ready_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 IF c.usage_day IS DISTINCT FROM day THEN UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,reserved_tokens=0,model_calls=0 WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 -- Expired/unknown calls retain their conservative reservation instead of becoming free retries.
 IF j.state='processing' THEN UPDATE public.atlas_event_config SET used_tokens=used_tokens+j.reserved_tokens,reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 IF c.used_tokens+c.reserved_tokens+p_estimate>c.max_tokens_per_day THEN UPDATE public.atlas_event_jobs SET state='budget_wait',ready_at=now()+interval '15 minutes',error='Limite de tokens do piloto; fonte preservada na fila.' WHERE id=j.id;RETURN NULL;END IF;
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=p_owner;
 UPDATE public.atlas_event_jobs SET state='processing',attempt=attempt+1,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',reserved_tokens=p_estimate,error=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE OR REPLACE FUNCTION public.atlas_event_publish(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;item jsonb;old public.atlas_event_findings;total integer:=0;task uuid;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' FOR UPDATE;
 IF j.id IS NULL OR NOT private.atlas_event_enabled(j.owner_id) OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=j.owner_id AND c.enabled AND j.client_id=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin')) THEN RAISE EXCEPTION 'Fonte atual indisponível.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(j.result->'items') LOOP
  task:=nullif(item->>'task_id','')::uuid;
  IF task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND client_id=j.client_id) THEN RAISE EXCEPTION 'Tarefa fora do cliente atual.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sources') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input->'messages') m WHERE m->>'id'=x.value)) THEN RAISE EXCEPTION 'Fonte fora do contexto.';END IF;
  SELECT * INTO old FROM public.atlas_event_findings WHERE owner_id=j.owner_id AND conversation_id=j.conversation_id AND request_key=item->>'request_key' FOR UPDATE;
  IF old.job_id=j.id THEN CONTINUE;END IF;
  IF item->>'route' NOT IN('account','owner','review','none') OR char_length(item->>'title') NOT BETWEEN 1 AND 200 OR char_length(item->>'summary') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Assunto inválido.';END IF;
  INSERT INTO public.atlas_event_findings(owner_id,client_id,conversation_id,job_id,request_key,intent,title,summary,task_id,route,question,sources,versions,state)
   VALUES(j.owner_id,j.client_id,j.conversation_id,j.id,item->>'request_key',item->>'intent',item->>'title',item->>'summary',task,item->>'route',item->>'question',item->'sources',jsonb_build_array(jsonb_build_object('job_id',j.id,'result',item,'at',now())),CASE WHEN item->>'route'='none' THEN 'no_action' ELSE 'observed' END)
   ON CONFLICT(owner_id,conversation_id,request_key) DO UPDATE SET job_id=excluded.job_id,intent=excluded.intent,title=excluded.title,summary=excluded.summary,task_id=excluded.task_id,route=excluded.route,question=excluded.question,sources=excluded.sources,versions=public.atlas_event_findings.versions||excluded.versions,state=CASE WHEN public.atlas_event_findings.thread_id IS NOT NULL THEN 'update_for_review' ELSE excluded.state END,revision=public.atlas_event_findings.revision+1,updated_at=now();
  total:=total+1;
 END LOOP;
 RETURN total;
END $$;
CREATE OR REPLACE FUNCTION public.atlas_event_open_account(p_finding uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;c public.atlas_event_config;t public.tarefas;account uuid;result uuid;names uuid[];text text;
BEGIN
 SELECT * INTO f FROM public.atlas_event_findings WHERE id=p_finding FOR UPDATE;
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=f.owner_id AND enabled AND mode='assist';
 IF c.owner_id IS NULL OR NOT private.atlas_event_enabled(f.owner_id) OR NOT f.client_id=ANY(c.client_ids) OR f.route<>'account' OR f.state NOT IN('proposed','observed','account_contacted') OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM f.client_id THEN RAISE EXCEPTION 'Pergunta automática não autorizada.';END IF;
 IF f.thread_id IS NOT NULL AND f.state='account_contacted' THEN RETURN f.thread_id;END IF;
 SELECT array_agg(p.id) INTO names FROM public.clientes cl JOIN public.profiles p ON lower(btrim(p.full_name))=lower(btrim(cl.responsavel)) AND p.status='active' AND p.role IN('admin','superadmin','colaborador') WHERE cl.id=f.client_id AND cl.etapa='closed';
 IF cardinality(names) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Responsável da conta precisa ser confirmado.';END IF;account:=names[1];
 SELECT * INTO t FROM public.tarefas WHERE id=f.task_id AND client_id=f.client_id FOR SHARE;
 IF t.id IS NULL OR EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa candidata indisponível; revisão necessária.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=f.owner_id AND enabled) THEN RAISE EXCEPTION 'Conversa interna indisponível.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team-start:'||f.owner_id::text||t.id::text,0));
 SELECT id INTO result FROM public.atlas_team_threads WHERE owner_id=f.owner_id AND task_id=t.id AND state<>'closed';
 IF result IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE id=result AND client_id=f.client_id AND account_person_id=account AND state NOT IN('delivery_review','needs_owner')) THEN RAISE EXCEPTION 'Acompanhamento existente exige revisão.';END IF;
 ELSE
  SELECT 'Pedido recebido no grupo: '||coalesce(string_agg(left(m->>'body',900),E'\n'),'Fonte pendente de conferência')||E'\nTarefa candidata: '||left(t.title,200) INTO text FROM public.atlas_event_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.input->'messages') m WHERE j.id=f.job_id AND f.sources ? (m->>'id');
  text:=left(text,3500);
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at) VALUES(f.owner_id,f.client_id,t.id,account,account,left(t.title,200),jsonb_build_object('text',text,'label','Pedido do grupo para esclarecimento interno','at',now(),'event_finding',f.id),'event-finding:'||f.id,now()+interval '1 hour') RETURNING id INTO result;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(result,'atlas','Oi! Chegou um pedido relacionado a '||left(t.title,200)||'. '||'Confirma se o pedido se refere a esta tarefa e o que precisa ser ajustado? A origem está no contexto deste assunto. Estou pedindo esclarecimento; o responsável e o prazo oficial da tarefa permanecem iguais.');
 END IF;
 UPDATE public.atlas_event_findings SET thread_id=result,account_id=account,state='account_contacted',revision=revision+1,updated_at=now() WHERE id=f.id;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.atlas_event_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row jsonb:=to_jsonb(NEW);prior jsonb;signature jsonb;old_signature jsonb;g uuid;cl uuid;t uuid;own uuid;
BEGIN
 signature:=row-ARRAY['raw_payload','unread_count','ack_status','lease_token','lease_until','attempt','retry_at'];
 IF TG_OP='UPDATE' THEN prior:=to_jsonb(OLD);old_signature:=prior-ARRAY['raw_payload','unread_count','ack_status','lease_token','lease_until','attempt','retry_at'];IF signature=old_signature THEN RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME IN('cliente_whatsapp_inbox','cliente_whatsapp_sent','atlas_audio_transcripts') THEN
  g:=nullif(row->>'conversation_id','')::uuid;cl:=private.atlas_event_client(g);
 ELSIF TG_TABLE_NAME='tarefas' THEN cl:=nullif(row->>'client_id','')::uuid;t:=(row->>'id')::uuid;
 ELSIF TG_TABLE_NAME='task_comments' THEN t:=(row->>'task_id')::uuid;SELECT client_id INTO cl FROM public.tarefas WHERE id=t;
 END IF;
 IF cl IS NULL THEN RETURN NEW;END IF;
 FOR own IN SELECT c.owner_id FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE private.atlas_event_enabled(c.owner_id) AND cl=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin') LOOP
  INSERT INTO public.atlas_event_signals(owner_id,client_id,conversation_id,task_id,kind,source_id,source_version) VALUES(own,cl,g,t,TG_TABLE_NAME,coalesce(row->>'id',row->>'inbox_id'),md5(signature::text));
 END LOOP;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- A reconciliation scan remains available; queue maintenance never rejects WhatsApp ingress.
 RAISE WARNING 'Atlas event signal unavailable; reconciliation required';RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';

-- Original private-stage definition: 20261016232925_atlas_event_queue_recovery.sql
-- Per-job budget reservation; no model or operational write during this migration.
CREATE OR REPLACE FUNCTION public.atlas_event_claim(p_owner uuid,p_estimate integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;c public.atlas_event_config;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND private.atlas_event_enabled(p_owner) FOR UPDATE;
 IF c.owner_id IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND ready_at<=now() AND (state IN('queued','error','budget_wait') OR state='processing' AND lease_until<now()) AND attempt<3 ORDER BY ready_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 -- The estimate belongs to the claimed input, not the largest job of another client.
 p_estimate:=p_estimate+octet_length(j.input::text);
 IF c.usage_day IS DISTINCT FROM day THEN UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,reserved_tokens=0,model_calls=0 WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 -- Expired/unknown calls retain their conservative reservation instead of becoming free retries.
 IF j.state='processing' THEN UPDATE public.atlas_event_config SET used_tokens=used_tokens+j.reserved_tokens,reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 IF c.used_tokens+c.reserved_tokens+p_estimate>c.max_tokens_per_day THEN UPDATE public.atlas_event_jobs SET state='budget_wait',ready_at=now()+interval '15 minutes',error='Limite de tokens do piloto; fonte preservada na fila.' WHERE id=j.id;RETURN NULL;END IF;
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=p_owner;
 UPDATE public.atlas_event_jobs SET state='processing',attempt=attempt+1,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',reserved_tokens=p_estimate,error=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
NOTIFY pgrst,'reload schema';

-- Original private-stage definition: 20261016234141_atlas_event_source_freshness.sql
-- Source/policy rechecks and one-time result projection.
ALTER TABLE public.atlas_event_jobs ADD COLUMN published_at timestamptz;
UPDATE public.atlas_event_jobs j SET published_at=coalesce(j.finished_at,now()) WHERE state='completed' AND (jsonb_array_length(coalesce(j.result->'items','[]'))=0 OR EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.owner_id=j.owner_id AND f.versions @> jsonb_build_array(jsonb_build_object('job_id',j.id))));
CREATE OR REPLACE FUNCTION public.atlas_event_claim(p_owner uuid,p_estimate integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;c public.atlas_event_config;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND private.atlas_event_enabled(p_owner) FOR UPDATE;
 IF c.owner_id IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN RETURN NULL;END IF;
 UPDATE public.atlas_event_jobs x SET state='blocked',error='Cliente ou grupo fora da política atual; fonte preservada para revisão.' WHERE x.owner_id=p_owner AND x.state IN('queued','error','budget_wait') AND (NOT x.client_id=ANY(c.client_ids) OR private.atlas_event_client(x.conversation_id) IS DISTINCT FROM x.client_id);
 SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=ANY(c.client_ids) AND private.atlas_event_client(conversation_id)=client_id AND ready_at<=now() AND (state IN('queued','error','budget_wait') OR state='processing' AND lease_until<now()) AND attempt<3 ORDER BY ready_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 -- The estimate belongs to the claimed input, not the largest job of another client.
 p_estimate:=p_estimate+octet_length(j.input::text);
 IF c.usage_day IS DISTINCT FROM day THEN UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,reserved_tokens=0,model_calls=0 WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 -- Expired/unknown calls retain their conservative reservation instead of becoming free retries.
 IF j.state='processing' THEN UPDATE public.atlas_event_config SET used_tokens=used_tokens+j.reserved_tokens,reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=p_owner RETURNING * INTO c;END IF;
 IF c.used_tokens+c.reserved_tokens+p_estimate>c.max_tokens_per_day THEN UPDATE public.atlas_event_jobs SET state='budget_wait',ready_at=now()+interval '15 minutes',error='Limite de tokens do piloto; fonte preservada na fila.' WHERE id=j.id;RETURN NULL;END IF;
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=p_owner;
 UPDATE public.atlas_event_jobs SET state='processing',attempt=attempt+1,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',reserved_tokens=p_estimate,error=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE OR REPLACE FUNCTION public.atlas_event_publish(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;item jsonb;old public.atlas_event_findings;total integer:=0;task uuid;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' FOR UPDATE;
 IF j.published_at IS NOT NULL THEN RETURN 0;END IF;
 IF j.id IS NULL OR NOT private.atlas_event_enabled(j.owner_id) OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=j.owner_id AND c.enabled AND j.client_id=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin')) THEN RAISE EXCEPTION 'Fonte atual indisponível.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(j.result->'items') LOOP
  task:=nullif(item->>'task_id','')::uuid;
  IF task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND client_id=j.client_id) THEN RAISE EXCEPTION 'Tarefa fora do cliente atual.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sources') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input->'messages') m WHERE m->>'id'=x.value)) THEN RAISE EXCEPTION 'Fonte fora do contexto.';END IF;
  SELECT * INTO old FROM public.atlas_event_findings WHERE owner_id=j.owner_id AND conversation_id=j.conversation_id AND request_key=item->>'request_key' FOR UPDATE;
  IF old.job_id=j.id THEN CONTINUE;END IF;
  IF item->>'route' NOT IN('account','owner','review','none') OR char_length(item->>'title') NOT BETWEEN 1 AND 200 OR char_length(item->>'summary') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Assunto inválido.';END IF;
  INSERT INTO public.atlas_event_findings(owner_id,client_id,conversation_id,job_id,request_key,intent,title,summary,task_id,route,question,sources,versions,state)
   VALUES(j.owner_id,j.client_id,j.conversation_id,j.id,item->>'request_key',item->>'intent',item->>'title',item->>'summary',task,item->>'route',item->>'question',item->'sources',jsonb_build_array(jsonb_build_object('job_id',j.id,'result',item,'at',now())),CASE WHEN item->>'route'='none' THEN 'no_action' ELSE 'observed' END)
   ON CONFLICT(owner_id,conversation_id,request_key) DO UPDATE SET job_id=excluded.job_id,intent=excluded.intent,title=excluded.title,summary=excluded.summary,task_id=excluded.task_id,route=excluded.route,question=excluded.question,sources=excluded.sources,versions=public.atlas_event_findings.versions||excluded.versions,state=CASE WHEN public.atlas_event_findings.thread_id IS NOT NULL THEN 'update_for_review' ELSE excluded.state END,revision=public.atlas_event_findings.revision+1,updated_at=now();
  total:=total+1;
 END LOOP;
 UPDATE public.atlas_event_jobs SET published_at=now() WHERE id=j.id;
 RETURN total;
END $$;
CREATE OR REPLACE FUNCTION public.atlas_event_enqueue(p_owner uuid,p_conversation uuid,p_client uuid,p_fingerprint text,p_input jsonb,p_coverage jsonb,p_sources jsonb,p_kind text,p_ready timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT private.atlas_event_enabled(p_owner) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=p_owner AND c.enabled AND p.status='active' AND p.role IN('admin','superadmin') AND p_client=ANY(c.client_ids)) OR private.atlas_event_client(p_conversation) IS DISTINCT FROM p_client THEN RAISE EXCEPTION 'Fonte fora do cliente autorizado.';END IF;
 IF char_length(p_fingerprint) NOT BETWEEN 1 AND 150 OR octet_length(p_input::text)>250000 OR jsonb_typeof(p_input)<>'object' OR jsonb_typeof(p_sources)<>'array' THEN RAISE EXCEPTION 'Contexto fora do limite.';END IF;
 UPDATE public.atlas_event_jobs SET state='superseded',error='Agrupado em versão mais recente da conversa.' WHERE owner_id=p_owner AND conversation_id=p_conversation AND state IN('queued','budget_wait','blocked','error') AND fingerprint<>p_fingerprint AND kind='messages' AND p_kind='messages';
 INSERT INTO public.atlas_event_jobs(owner_id,client_id,conversation_id,fingerprint,kind,input,coverage,source_refs,ready_at) VALUES(p_owner,p_client,p_conversation,p_fingerprint,p_kind,p_input,p_coverage,p_sources,p_ready) ON CONFLICT(owner_id,fingerprint) DO UPDATE SET input=excluded.input,coverage=excluded.coverage,source_refs=excluded.source_refs,state='queued',error=NULL,ready_at=excluded.ready_at WHERE public.atlas_event_jobs.state='blocked' AND public.atlas_event_jobs.attempt<3 RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.atlas_event_jobs WHERE owner_id=p_owner AND fingerprint=p_fingerprint;END IF;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
-- Human sessions and server delegations remain distinct authorities.
CREATE FUNCTION public.atlas_event_worker_access() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() WHERE public.atlas_is_owner() AND private.planeje_live_session() AND auth.jwt()->>'planeje_server_delegate'='atlas';
$$;
REVOKE ALL ON FUNCTION public.atlas_event_worker_access() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_event_worker_access() TO authenticated;

ALTER TABLE public.atlas_event_config ADD COLUMN legacy_tokens integer NOT NULL DEFAULT 0;
ALTER TABLE public.atlas_event_config ADD COLUMN legacy_model_calls integer NOT NULL DEFAULT 0;
ALTER TABLE public.atlas_event_findings ADD COLUMN demand_id uuid REFERENCES public.atlas_demands(id);
CREATE INDEX atlas_event_findings_job ON public.atlas_event_findings(job_id);
CREATE INDEX atlas_event_jobs_client ON public.atlas_event_jobs(owner_id,client_id,created_at DESC);

DROP FUNCTION public.atlas_event_claim(uuid,integer);
GRANT EXECUTE ON FUNCTION private.atlas_demand_task_title(text,text) TO service_role;
CREATE FUNCTION public.atlas_event_claim(p_owner uuid,p_estimate integer,p_client uuid DEFAULT NULL,p_job uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;c public.atlas_event_config;s public.atlas_office_state;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;expired integer;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND private.atlas_event_enabled(p_owner) FOR UPDATE;
 IF c.owner_id IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 OR p_client IS NOT NULL AND NOT p_client=ANY(c.client_ids) THEN RETURN NULL;END IF;
 IF c.usage_day IS DISTINCT FROM day THEN
  UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,model_calls=0,legacy_tokens=0,legacy_model_calls=0 WHERE owner_id=p_owner RETURNING * INTO c;
 END IF;
 SELECT * INTO s FROM public.atlas_office_state WHERE owner_id=p_owner FOR SHARE;
 UPDATE public.atlas_event_config SET legacy_tokens=CASE WHEN s.usage_day=day THEN s.tokens_today ELSE 0 END,legacy_model_calls=CASE WHEN s.usage_day=day THEN s.calls_today ELSE 0 END WHERE owner_id=p_owner RETURNING * INTO c;
 SELECT coalesce(sum(reserved_tokens),0) INTO expired FROM public.atlas_event_jobs WHERE owner_id=p_owner AND state='processing' AND lease_until<now() AND attempt>=3;
 UPDATE public.atlas_event_config SET used_tokens=used_tokens+expired,reserved_tokens=greatest(0,reserved_tokens-expired) WHERE owner_id=p_owner RETURNING * INTO c;
 UPDATE public.atlas_event_jobs SET state='error',error='Tentativas esgotadas; uso desconhecido contabilizado e fonte preservada.',lease=NULL,lease_until=NULL,reserved_tokens=0 WHERE owner_id=p_owner AND state='processing' AND lease_until<now() AND attempt>=3;
 UPDATE public.atlas_event_jobs x SET state='blocked',error='Cliente ou grupo fora da política atual; fonte preservada para revisão.' WHERE x.owner_id=p_owner AND x.state IN('queued','error','budget_wait') AND (NOT x.client_id=ANY(c.client_ids) OR private.atlas_event_client(x.conversation_id) IS DISTINCT FROM x.client_id);
 SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND (p_job IS NULL OR id=p_job) AND (p_client IS NULL OR client_id=p_client) AND client_id=ANY(c.client_ids) AND private.atlas_event_client(conversation_id)=client_id AND ready_at<=now() AND (state IN('queued','error','budget_wait') OR state='processing' AND lease_until<now()) AND attempt<3 ORDER BY ready_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 IF j.state='processing' THEN
  UPDATE public.atlas_event_config SET used_tokens=used_tokens+j.reserved_tokens,reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=p_owner RETURNING * INTO c;
  UPDATE public.atlas_event_jobs SET reserved_tokens=0,lease=NULL,lease_until=NULL WHERE id=j.id;
 END IF;
 -- Production reserves the exact selected input tokenizer estimate plus output/format headroom.
 IF c.used_tokens+c.reserved_tokens+c.legacy_tokens+(CASE WHEN s.usage_day=day AND s.analysis_reservation IS NOT NULL THEN s.reservation_tokens ELSE 0 END)+p_estimate>c.max_tokens_per_day THEN
  UPDATE public.atlas_event_jobs SET state='budget_wait',ready_at=now()+interval '15 minutes',error='Teto compartilhado de análises dos grupos/escritório; pedido preservado na fila.' WHERE id=j.id;RETURN NULL;
 END IF;
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=p_owner;
 UPDATE public.atlas_event_jobs SET state='processing',attempt=attempt+1,lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',reserved_tokens=p_estimate,error=NULL WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.atlas_event_claim(uuid,integer,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_event_claim(uuid,integer,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_event_finish(p_job uuid,p_lease uuid,p_result jsonb,p_usage jsonb,p_error text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;own uuid;tokens integer;
BEGIN
 SELECT owner_id INTO own FROM public.atlas_event_jobs WHERE id=p_job;
 PERFORM 1 FROM public.atlas_event_config WHERE owner_id=own FOR UPDATE;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='processing' AND lease=p_lease FOR UPDATE;
 IF j.id IS NULL THEN RETURN false;END IF;
 tokens:=CASE WHEN (p_usage->>'total_tokens')~'^[0-9]+$' THEN (p_usage->>'total_tokens')::integer ELSE j.reserved_tokens END;
 UPDATE public.atlas_event_config SET used_tokens=used_tokens+greatest(tokens,0),reserved_tokens=greatest(0,reserved_tokens-j.reserved_tokens) WHERE owner_id=j.owner_id;
 UPDATE public.atlas_event_jobs SET state=CASE WHEN p_error IS NULL THEN 'completed' ELSE 'error' END,result=p_result,usage=p_usage,error=left(p_error,500),lease=NULL,lease_until=NULL,reserved_tokens=0,finished_at=now(),ready_at=now()+interval '5 minutes' WHERE id=j.id;
 RETURN true;
END $$;

-- Keep the old function for rollback, but its public worker gate prevents two automatic readers.
ALTER FUNCTION public.atlas_office_reserve(uuid,date,integer) RENAME TO atlas_office_reserve_before_events;
CREATE FUNCTION public.atlas_office_reserve(p_owner_id uuid,p_day date,p_tokens integer) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=p_owner_id AND enabled) THEN RETURN NULL;END IF;
 RETURN public.atlas_office_reserve_before_events(p_owner_id,p_day,p_tokens);
END $$;
REVOKE ALL ON FUNCTION public.atlas_office_reserve(uuid,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_office_reserve(uuid,date,integer) TO service_role;

CREATE OR REPLACE FUNCTION private.atlas_event_settings(p_value jsonb,p_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.atlas_event_config;ids uuid[];
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Gestor atual necessário.' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=auth.uid() FOR UPDATE;
 IF c.owner_id IS NULL THEN RAISE EXCEPTION 'Motor ainda não instalado para esta conta.';END IF;
 IF coalesce(p_value->>'mode',c.mode)='assist' AND coalesce((p_value->>'enabled')::boolean,c.enabled) AND p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirme as chamadas internas para os clientes selecionados.';END IF;
 ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_value->'client_ids',to_jsonb(c.client_ids))));
 IF EXISTS(SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=i AND etapa='closed')) THEN RAISE EXCEPTION 'Cliente fora da carteira atual.';END IF;
 UPDATE public.atlas_event_config SET enabled=coalesce((p_value->>'enabled')::boolean,enabled),mode=coalesce(p_value->>'mode',mode),client_ids=ids,history_messages=coalesce((p_value->>'history_messages')::integer,history_messages),quiet_seconds=coalesce((p_value->>'quiet_seconds')::integer,quiet_seconds),max_wait_seconds=coalesce((p_value->>'max_wait_seconds')::integer,max_wait_seconds),review_seconds=coalesce((p_value->>'review_seconds')::integer,review_seconds),max_tokens_per_day=coalesce((p_value->>'max_tokens_per_day')::integer,max_tokens_per_day) WHERE owner_id=auth.uid() RETURNING * INTO c;
 RETURN to_jsonb(c)-'owner_id';
END $$;

-- An event creates only an owner-private inbox draft. Existing approval RPCs
-- remain the sole path to create/link/reassign an official task.
CREATE FUNCTION public.atlas_event_project_demands(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;j public.atlas_event_jobs;d uuid;body text;count integer:=0;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' AND published_at IS NOT NULL;
 IF j.id IS NULL OR NOT private.atlas_event_enabled(j.owner_id) OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id THEN RETURN 0;END IF;
 FOR f IN SELECT * FROM public.atlas_event_findings WHERE job_id=j.id AND route IN('owner','review') AND demand_id IS NULL FOR UPDATE LOOP
  IF f.task_id IS NOT NULL THEN SELECT id INTO d FROM public.atlas_demands WHERE owner_id=f.owner_id AND client_id=f.client_id AND task_id=f.task_id AND state='linked' ORDER BY created_at LIMIT 1;END IF;
  IF d IS NULL THEN
   SELECT 'Pedido identificado em grupo do cliente. Fontes para revisão:'||E'\n'||coalesce(string_agg(left(m->>'created_at',32)||' · '||left(coalesce(m->>'body','Fonte sem transcrição'),1800),E'\n'),'Fonte pendente') INTO body FROM jsonb_array_elements(j.input->'messages') m WHERE f.sources ? (m->>'id');
   body:=left(body||E'\n\nEsclarecimento sugerido: '||f.question||CASE WHEN f.task_id IS NULL THEN '' ELSE E'\nTarefa candidata: '||f.task_id::text END,12000);
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,state,analysis,proposal) SELECT f.owner_id,f.client_id,f.id,private.atlas_demand_task_title(c.empresa,left(f.title,greatest(1,177-char_length(c.empresa)))),body,'draft',f.summary,jsonb_build_object('source','atlas_event','finding_id',f.id,'candidate_task_id',f.task_id) FROM public.clientes c WHERE c.id=f.client_id ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING id INTO d;
   IF d IS NULL THEN SELECT id INTO d FROM public.atlas_demands WHERE owner_id=f.owner_id AND request_id=f.id;END IF;
   INSERT INTO public.atlas_demand_events(demand_id,kind,body) SELECT d,'event_received','Pedido do WhatsApp identificado pelo Atlas. Confira as fontes e prepare o repasse; nenhuma tarefa foi criada.' WHERE NOT EXISTS(SELECT 1 FROM public.atlas_demand_events WHERE demand_id=d AND kind='event_received');
  END IF;
  UPDATE public.atlas_event_findings SET demand_id=d WHERE id=f.id;count:=count+1;d:=NULL;
 END LOOP;
 RETURN count;
END $$;
REVOKE ALL ON FUNCTION public.atlas_event_project_demands(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_event_project_demands(uuid) TO service_role;

-- Store only metadata in the outbox; bound retention of obsolete contexts.
CREATE FUNCTION public.atlas_event_maintenance(p_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT private.atlas_event_enabled(p_owner) THEN RETURN;END IF;
 DELETE FROM public.atlas_event_signals WHERE owner_id=p_owner AND created_at<now()-interval '30 days';
 DELETE FROM public.atlas_event_jobs j WHERE owner_id=p_owner AND state='superseded' AND created_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.job_id=j.id OR f.versions @> jsonb_build_array(jsonb_build_object('job_id',j.id)));
END $$;
REVOKE ALL ON FUNCTION public.atlas_event_maintenance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_event_maintenance(uuid) TO service_role;

INSERT INTO public.atlas_event_config(owner_id,enabled,mode,client_ids,max_tokens_per_day)
 SELECT a.owner_id,false,'observe',ARRAY(SELECT id FROM public.clientes WHERE etapa='closed' ORDER BY id),coalesce(c.max_tokens_per_day,60000)
 FROM public.atlas_settings a LEFT JOIN public.atlas_office_config c ON c.owner_id=a.owner_id WHERE a.id='atlas' AND a.owner_id IS NOT NULL;

CREATE FUNCTION public.atlas_event_sync_office(p_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.atlas_event_config;cl uuid;j public.atlas_event_jobs;g public.atlas_event_groups;status text;note text;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND private.atlas_event_enabled(p_owner);
 IF c.owner_id IS NULL THEN RETURN;END IF;
 FOR cl IN SELECT unnest(c.client_ids) LOOP
  SELECT * INTO j FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=cl AND state<>'superseded' ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO g FROM public.atlas_event_groups WHERE owner_id=p_owner AND client_id=cl ORDER BY checked_at DESC LIMIT 1;
  status:=CASE WHEN EXISTS(SELECT 1 FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=cl AND state='processing') THEN 'analyzing'
   WHEN EXISTS(SELECT 1 FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=cl AND state='budget_wait') THEN 'budget_wait'
   WHEN EXISTS(SELECT 1 FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=cl AND state IN('error','blocked')) OR g.state='audio_pending' THEN 'error'
   WHEN EXISTS(SELECT 1 FROM public.atlas_event_jobs WHERE owner_id=p_owner AND client_id=cl AND state='queued') THEN 'queued'
   WHEN EXISTS(SELECT 1 FROM public.atlas_event_findings f LEFT JOIN public.atlas_demands d ON d.id=f.demand_id WHERE f.owner_id=p_owner AND f.client_id=cl AND f.route IN('owner','review') AND coalesce(d.state,'draft') NOT IN('linked','archived') AND f.state<>'closed') THEN 'waiting_context'
   WHEN g.conversation_id IS NULL THEN 'error' ELSE 'ready' END;
  note:=CASE WHEN g.conversation_id IS NULL THEN 'Nenhum grupo disponível com vínculo inequívoco para este cliente.' WHEN status IN('error','budget_wait') THEN coalesce(j.error,g.reason,'Fonte pendente de conferência.') END;
  INSERT INTO public.atlas_office_clients(owner_id,client_id,status,last_observed_at,analyzed_at,summary,last_error,retry_after)
   VALUES(p_owner,cl,status,g.checked_at,j.finished_at,coalesce(j.result->>'summary','Leitura por acontecimentos. Confira os pedidos e a cobertura em Demandas.'),note,CASE WHEN status='analyzing' THEN j.lease_until END)
   ON CONFLICT(owner_id,client_id) DO UPDATE SET status=excluded.status,last_observed_at=excluded.last_observed_at,analyzed_at=coalesce(excluded.analyzed_at,public.atlas_office_clients.analyzed_at),summary=excluded.summary,last_error=excluded.last_error,retry_after=excluded.retry_after;
 END LOOP;
 UPDATE public.atlas_event_config e SET legacy_tokens=coalesce((SELECT tokens_today FROM public.atlas_office_state WHERE owner_id=p_owner AND usage_day=day),0),legacy_model_calls=coalesce((SELECT calls_today FROM public.atlas_office_state WHERE owner_id=p_owner AND usage_day=day),0) WHERE e.owner_id=p_owner;
END $$;
REVOKE ALL ON FUNCTION public.atlas_event_sync_office(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_event_sync_office(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
