-- CRM IA compõe os registros comerciais existentes. Aplicar somente nesta release.
CREATE TABLE public.crm_ia_config (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data)='object'),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE TABLE public.crm_ia_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 100),
  nicho text NOT NULL DEFAULT '',
  tipo text NOT NULL CHECK (tipo IN ('pipeline','base','agent')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_ia_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.cliente_whatsapp_contact(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  busy_start_at timestamptz NOT NULL,
  busy_end_at timestamptz NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes)<=4000),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  request_id uuid NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at>start_at AND end_at<=start_at+interval '12 hours'),
  UNIQUE(cliente_id,created_by,request_id)
);
CREATE INDEX crm_ia_appointments_owner_time ON public.crm_ia_appointments(owner_id,start_at,end_at) WHERE status IN ('scheduled','confirmed');
CREATE TABLE public.crm_ia_import_receipts (
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),created_by uuid NOT NULL REFERENCES public.profiles(id),request_id uuid NOT NULL,
  payload_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cliente_id,created_by,request_id)
);
ALTER TABLE public.leads ADD COLUMN crm_ia_fields jsonb NOT NULL DEFAULT '{}', ADD COLUMN crm_ia_archived_at timestamptz,
  ADD COLUMN crm_ia_contact_id uuid REFERENCES public.cliente_whatsapp_contact(id) ON DELETE SET NULL;
CREATE INDEX crm_ia_lead_contact ON public.leads(cliente_id,crm_ia_contact_id) WHERE crm_ia_contact_id IS NOT NULL;
ALTER TABLE public.crm_pipelines ADD COLUMN crm_ia_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_stages ADD COLUMN crm_ia_icon text;
ALTER TABLE public.crm_produtos ADD COLUMN crm_ia_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.crm_servicos ADD COLUMN crm_ia_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.crm_ia_outbox ADD COLUMN media_descriptor jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(media_descriptor)='object' AND octet_length(media_descriptor::text)<=8000);
ALTER TABLE public.crm_ia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ia_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ia_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ia_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_ia_config,public.crm_ia_templates,public.crm_ia_appointments,public.crm_ia_import_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.crm_ia_config,public.crm_ia_templates,public.crm_ia_appointments,public.crm_ia_import_receipts TO service_role;

CREATE FUNCTION private.crm_ia_module(p_module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=auth.uid() AND m.module_name::text=p_module),
    (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text=p_module),true)
$$;
CREATE FUNCTION private.crm_ia_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.role::text FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active'
    AND p.role IN ('superadmin','admin','colaborador') AND public.planeje_current_account_access()
    AND private.crm_ia_module('crm')
$$;
CREATE FUNCTION private.crm_ia_client(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p_id AND private.crm_ia_role() IS NOT NULL
    AND (private.crm_ia_role() IN ('superadmin','admin') OR (
      (NOT EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=auth.uid() AND a.module_name::text='clients' AND a.access_level::text='responsible') OR c.responsavel::text=auth.uid()::text)
      AND (NOT EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=auth.uid() AND a.module_name::text='crm' AND a.access_level::text='responsible')
        OR c.responsavel::text=auth.uid()::text OR EXISTS(SELECT 1 FROM public.leads l WHERE l.cliente_id=c.id AND l.responsavel_id=auth.uid()))
    ))),false)
$$;
CREATE FUNCTION private.crm_ia_lead(p_id uuid,p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.crm_ia_client(p_client) AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_id AND l.cliente_id=p_client
    AND (private.crm_ia_role() IN ('superadmin','admin') OR NOT EXISTS(SELECT 1 FROM public.user_module_access a
      WHERE a.user_id=auth.uid() AND a.module_name::text='crm' AND a.access_level::text='responsible') OR l.responsavel_id=auth.uid()))
$$;
CREATE FUNCTION private.crm_ia_channel(p_client uuid,p_channel uuid,p_send boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.crm_ia_client(p_client) AND (private.crm_ia_module('atendimento') OR private.crm_ia_module('rastreamento'))
    AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.id=p_channel AND c.cliente_id=p_client
      AND public.atendimento_user_can_access_atendimento_scope(p_client,NULL,c.id)
      AND c.archived_at IS NULL
      AND (NOT p_send OR (c.provider='uazapi' AND nullif(btrim(c.token),'') IS NOT NULL AND nullif(btrim(c.subdomain),'') IS NOT NULL
        AND public.atendimento_user_can_send_on_whatsapp_config(auth.uid(),p_client,c.id))))
$$;
CREATE FUNCTION private.crm_ia_contact(p_client uuid,p_contact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.crm_ia_client(p_client) AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c
    WHERE c.id=p_contact AND c.cliente_id=p_client AND c.from_jid NOT LIKE '%@g.us'
      AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=c.id
        AND s.privado AND s.assigned_to IS DISTINCT FROM auth.uid() AND private.crm_ia_role()<>'superadmin')
      AND (NOT EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=auth.uid() AND a.module_name::text='crm' AND a.access_level::text='responsible')
        OR private.crm_ia_role() IN ('admin','superadmin') OR EXISTS(SELECT 1 FROM public.cliente_atend_conversas s
          WHERE s.cliente_id=p_client AND s.contact_id=c.id AND s.assigned_to=auth.uid())))
$$;
CREATE FUNCTION private.crm_ia_phone(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT regexp_replace(split_part(coalesce(p_text,''),'@',1),'[^0-9]','','g') $$;
CREATE FUNCTION private.crm_ia_version(p_expected text,p_actual timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF p_expected IS NULL OR p_expected::timestamptz IS DISTINCT FROM p_actual THEN
    RAISE EXCEPTION 'Este registro foi alterado. Atualize a versão antes de salvar.' USING ERRCODE='40001';
  END IF;
END $$;

CREATE FUNCTION private.crm_ia_template(p_type text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb; rules jsonb;
BEGIN
  IF p_type='base' THEN
    RETURN jsonb_build_object('nome',left(coalesce(p_data->>'nome','Base do modelo'),80),'conteudo',left(coalesce(p_data->>'conteudo',''),30000));
  ELSIF p_type='pipeline' THEN
    SELECT jsonb_build_object('nome',left(coalesce(p_data->>'nome','Funil do modelo'),100),'stages',coalesce(jsonb_agg(jsonb_build_object(
      'nome',left(value->>'nome',100),'color',coalesce(value->>'color','#6366f1'),'tipo',coalesce(value->>'tipo','intermediaria'),
      'ordem',ordinality-1,'icon',value->>'icon') ORDER BY ordinality),'[]')) INTO result
      FROM jsonb_array_elements(coalesce(p_data->'stages','[]')) WITH ORDINALITY;
    IF jsonb_array_length(result->'stages') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'O modelo precisa de 1 a 30 etapas.'; END IF;
    RETURN result;
  ELSIF p_type='agent' THEN
    rules:=coalesce(p_data->'funil'->'crm_ia','{}');
    rules:=jsonb_build_object('tipo',coalesce(rules->>'tipo','qualificacao'),'pipeline_id',NULL,'stage_ids','[]'::jsonb,
      'idiomas',coalesce(rules->'idiomas','["pt-BR"]'),'audio','nunca','variaveis',coalesce(rules->'variaveis','[]'),
      'gatilhos',coalesce(rules->'gatilhos','[]'),'janelas',coalesce(rules->'janelas','[]'),'cadencia',coalesce(rules->'cadencia','[]'),
      'destino',jsonb_build_object('tipo',CASE WHEN rules->'destino'->>'tipo'='encerrar' THEN 'encerrar' ELSE 'humano' END),
      'agendamento',jsonb_build_object('assunto',rules->'agendamento'->>'assunto','instrucoes',rules->'agendamento'->>'instrucoes',
        'local',rules->'agendamento'->>'local'));
    RETURN jsonb_build_object('nome',left(coalesce(p_data->>'nome','Agente do modelo'),60),'objetivo',left(coalesce(p_data->>'objetivo',''),500),
      'instrucoes',left(coalesce(p_data->>'instrucoes',''),8000),'tom',coalesce(p_data->>'tom','cordial'),'modelo',coalesce(p_data->>'modelo','openai/gpt-4o-mini'),
      'ativo',false,'auto_responder',false,'base_ids','[]'::jsonb,'funil',jsonb_build_object('crm_ia',rules));
  END IF;
  RAISE EXCEPTION 'Tipo de modelo inválido.';
END $$;

CREATE FUNCTION private.crm_ia_availability(p_client uuid,p_rules jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT c.data->'availability' FROM public.crm_ia_config c WHERE c.cliente_id=p_client),'{}')
    ||jsonb_strip_nulls(jsonb_build_object('duration_minutes',p_rules->'duration_minutes','interval_minutes',p_rules->'interval_minutes',
      'buffer_before',p_rules->'buffer_before','buffer_after',p_rules->'buffer_after','min_notice_hours',p_rules->'min_notice_hours',
      'horizon_days',coalesce(p_rules->'max_future_days',p_rules->'horizon_days'),'max_per_day',coalesce(p_rules->'daily_limit',p_rules->'max_per_day')))
$$;
CREATE FUNCTION private.crm_ia_slots(p_client uuid,p_owner uuid,p_date date,p_ignore uuid DEFAULT NULL,p_rules jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE availability jsonb; zone text; duration_n integer; interval_n integer; before_n integer; after_n integer; notice numeric;
  windows jsonb; exception jsonb; window_row jsonb; local_start timestamp; local_end timestamp; cursor_at timestamp; from_at timestamptz; to_at timestamptz;
  result jsonb:='[]';
BEGIN
  availability:=private.crm_ia_availability(p_client,p_rules);
  zone:=coalesce(availability->>'timezone','America/Sao_Paulo');
  duration_n:=coalesce((availability->>'duration_minutes')::integer,30); interval_n:=coalesce((availability->>'interval_minutes')::integer,30);
  before_n:=coalesce((availability->>'buffer_before')::integer,0); after_n:=coalesce((availability->>'buffer_after')::integer,0);
  notice:=coalesce((availability->>'min_notice_hours')::numeric,1);
  IF p_owner IS NULL OR p_date IS NULL OR p_date<(clock_timestamp() AT TIME ZONE zone)::date
    OR p_date>(clock_timestamp() AT TIME ZONE zone)::date+coalesce((availability->>'horizon_days')::integer,60)
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_owner AND p.status='active' AND p.role IN ('admin','superadmin','colaborador')) THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  IF (SELECT count(*) FROM public.crm_ia_appointments a WHERE a.owner_id=p_owner AND a.id IS DISTINCT FROM p_ignore AND a.status IN ('scheduled','confirmed') AND (a.start_at AT TIME ZONE zone)::date=p_date)
    >=coalesce((availability->>'max_per_day')::integer,8) THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  SELECT value INTO exception FROM jsonb_array_elements(coalesce(availability->'exceptions','[]')) e
    WHERE e->>'owner_id'=p_owner::text AND e->>'date'=p_date::text LIMIT 1;
  IF coalesce((exception->>'blocked')::boolean,false) THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  IF exception IS NOT NULL THEN windows:=jsonb_build_array(exception);
  ELSE
    SELECT coalesce(jsonb_agg(value),'[]') INTO windows FROM jsonb_array_elements(coalesce(availability->'windows','[]')) w
      WHERE w->>'owner_id'=p_owner::text AND (w->'days') @> jsonb_build_array(extract(dow FROM p_date)::integer);
  END IF;
  FOR window_row IN SELECT value FROM jsonb_array_elements(windows) LOOP
    local_start:=p_date+(window_row->>'start')::time; local_end:=p_date+(window_row->>'end')::time;
    cursor_at:=local_start;
    WHILE cursor_at+make_interval(mins=>duration_n)<=local_end LOOP
      from_at:=cursor_at AT TIME ZONE zone; to_at:=(cursor_at+make_interval(mins=>duration_n)) AT TIME ZONE zone;
      IF from_at>=clock_timestamp()+notice*interval '1 hour' AND to_at>from_at AND (from_at AT TIME ZONE zone)=cursor_at
        AND NOT EXISTS(SELECT 1 FROM public.crm_ia_appointments a WHERE a.owner_id=p_owner AND a.id IS DISTINCT FROM p_ignore
          AND a.status IN ('scheduled','confirmed') AND a.busy_start_at<to_at+make_interval(mins=>after_n) AND a.busy_end_at>from_at-make_interval(mins=>before_n)) THEN
        result:=result||jsonb_build_array(jsonb_build_object('start_at',from_at,'end_at',to_at,'owner_id',p_owner));
      END IF;
      cursor_at:=cursor_at+make_interval(mins=>interval_n);
    END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'start_at'),'[]') INTO result FROM(SELECT DISTINCT value FROM jsonb_array_elements(result)) s;
  RETURN jsonb_build_object('rows',result,'total',jsonb_array_length(result));
END $$;

CREATE FUNCTION private.crm_ia_book(p_client uuid,p_payload jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment public.crm_ia_appointments; availability jsonb; owner_key uuid:=(p_payload->>'owner_id')::uuid;
  item_key uuid:=nullif(p_payload->>'id','')::uuid; lead_key uuid:=nullif(p_payload->>'lead_id','')::uuid;
  contact_key uuid:=nullif(p_payload->>'contact_id','')::uuid; start_time timestamptz:=(p_payload->>'start_at')::timestamptz;
  end_time timestamptz:=(p_payload->>'end_at')::timestamptz; request_key uuid:=nullif(p_payload->>'request_id','')::uuid;
  slots jsonb; zone text; same_time boolean:=false; agent_rules jsonb;
BEGIN
  IF p_actor IS NULL OR owner_key IS NULL OR start_time IS NULL OR end_time IS NULL OR request_key IS NULL
    OR length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 200 OR length(coalesce(p_payload->>'notes',''))>4000
    OR end_time<=start_time OR end_time>start_time+interval '12 hours' THEN RAISE EXCEPTION 'Agendamento inválido.'; END IF;
  IF lead_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.leads WHERE id=lead_key AND cliente_id=p_client AND crm_ia_archived_at IS NULL) THEN RAISE EXCEPTION 'Lead indisponível.'; END IF;
  IF contact_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact WHERE id=contact_key AND cliente_id=p_client) THEN RAISE EXCEPTION 'Contato indisponível.'; END IF;
  SELECT * INTO appointment FROM public.crm_ia_appointments a WHERE a.cliente_id=p_client AND a.created_by=p_actor AND a.request_id=request_key;
  IF appointment.id IS NOT NULL AND item_key IS NULL THEN
    IF auth.uid() IS NOT NULL AND ((appointment.lead_id IS NOT NULL AND NOT private.crm_ia_lead(appointment.lead_id,p_client))
      OR (appointment.contact_id IS NOT NULL AND NOT private.crm_ia_contact(p_client,appointment.contact_id))) THEN RAISE EXCEPTION 'Compromisso indisponível.' USING ERRCODE='42501'; END IF;
    IF appointment.start_at<>start_time OR appointment.end_at<>end_time OR appointment.owner_id<>owner_key OR appointment.lead_id IS DISTINCT FROM lead_key THEN RAISE EXCEPTION 'Identificador usado em outro compromisso.'; END IF;
    RETURN to_jsonb(appointment);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-agenda:'||owner_key::text,0));
  IF item_key IS NOT NULL THEN
    SELECT * INTO appointment FROM public.crm_ia_appointments WHERE id=item_key AND cliente_id=p_client FOR UPDATE;
    IF appointment.id IS NULL THEN RAISE EXCEPTION 'Compromisso indisponível.'; END IF;
    IF auth.uid() IS NOT NULL AND ((appointment.lead_id IS NOT NULL AND NOT private.crm_ia_lead(appointment.lead_id,p_client))
      OR (appointment.contact_id IS NOT NULL AND NOT private.crm_ia_contact(p_client,appointment.contact_id))) THEN RAISE EXCEPTION 'Compromisso indisponível.' USING ERRCODE='42501'; END IF;
    IF (p_payload ? 'lead_id' AND lead_key IS DISTINCT FROM appointment.lead_id)
      OR (p_payload ? 'contact_id' AND contact_key IS DISTINCT FROM appointment.contact_id) THEN RAISE EXCEPTION 'Reagende mantendo o lead e o contato originais.'; END IF;
    lead_key:=appointment.lead_id; contact_key:=appointment.contact_id;
    PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',appointment.updated_at);
    same_time:=appointment.start_at=start_time AND appointment.end_at=end_time AND appointment.owner_id=owner_key AND appointment.status IN ('scheduled','confirmed');
  END IF;
  IF nullif(p_payload->>'crm_ia_agent_id','') IS NOT NULL THEN
    SELECT a.funil->'crm_ia'->'agendamento' INTO agent_rules FROM public.cliente_atend_ia_agentes a
      WHERE a.id=(p_payload->>'crm_ia_agent_id')::uuid AND a.cliente_id=p_client
        AND a.funil->'crm_ia'->>'tipo'='agendamento' AND a.ativo
        AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_key AND l.cliente_id=p_client AND l.pipeline_id=nullif(a.funil->'crm_ia'->>'pipeline_id','')::uuid);
    IF agent_rules IS NULL THEN RAISE EXCEPTION 'Agente de agendamento indisponível.'; END IF;
  END IF;
  availability:=private.crm_ia_availability(p_client,agent_rules);
  zone:=coalesce(availability->>'timezone','America/Sao_Paulo');
  slots:=private.crm_ia_slots(p_client,owner_key,(start_time AT TIME ZONE zone)::date,item_key,agent_rules);
  IF NOT same_time AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(slots->'rows') s WHERE (s->>'start_at')::timestamptz=start_time AND (s->>'end_at')::timestamptz=end_time) THEN
    RAISE EXCEPTION 'Horário indisponível. Atualize a agenda.' USING ERRCODE='40001';
  END IF;
  IF item_key IS NULL THEN
    INSERT INTO public.crm_ia_appointments(cliente_id,lead_id,contact_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,notes,request_id,created_by)
      VALUES(p_client,lead_key,contact_key,owner_key,start_time,end_time,start_time-make_interval(mins=>coalesce((availability->>'buffer_before')::integer,0)),
        end_time+make_interval(mins=>coalesce((availability->>'buffer_after')::integer,0)),btrim(p_payload->>'title'),coalesce(p_payload->>'notes',''),request_key,p_actor) RETURNING * INTO appointment;
  ELSE
    UPDATE public.crm_ia_appointments SET owner_id=owner_key,start_at=start_time,end_at=end_time,
      busy_start_at=start_time-make_interval(mins=>coalesce((availability->>'buffer_before')::integer,0)),busy_end_at=end_time+make_interval(mins=>coalesce((availability->>'buffer_after')::integer,0)),
      title=btrim(p_payload->>'title'),notes=coalesce(p_payload->>'notes',''),status=coalesce(p_payload->>'status',status),updated_at=clock_timestamp() WHERE id=item_key RETURNING * INTO appointment;
  END IF;
  IF lead_key IS NOT NULL THEN
    UPDATE public.leads SET agendamento=start_time,proxima_acao=start_time,updated_at=clock_timestamp() WHERE id=lead_key AND cliente_id=p_client;
    INSERT INTO public.crm_lead_interacoes(lead_id,cliente_id,tipo,descricao,user_id) VALUES(lead_key,p_client,'agendamento',appointment.title,p_actor);
  END IF;
  RETURN to_jsonb(appointment);
END $$;

-- Toda alteração de etapa usa esta transação, inclusive a edição da ficha.
CREATE FUNCTION private.crm_ia_move(p_client uuid,p_id uuid,p_stage uuid,p_reason text,p_expected text,p_worker_actor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.leads; target public.crm_stages; source public.crm_stages; action jsonb; interaction_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    IF p_worker_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_worker_actor AND p.status='active' AND p.role IN ('admin','superadmin','colaborador'))
      OR NOT EXISTS(SELECT 1 FROM public.leads scoped_lead WHERE scoped_lead.id=p_id AND scoped_lead.cliente_id=p_client) THEN RAISE EXCEPTION 'Ação automática sem titular ou lead válido.'; END IF;
  ELSIF NOT private.crm_ia_lead(p_id,p_client) THEN RAISE EXCEPTION 'Lead indisponível ou sem acesso.' USING ERRCODE='42501'; END IF;
  SELECT * INTO l FROM public.leads WHERE id=p_id AND cliente_id=p_client FOR UPDATE;
  PERFORM private.crm_ia_version(p_expected,l.updated_at);
  SELECT s.* INTO target FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id
    WHERE s.id=p_stage AND p.cliente_id=p_client;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
  IF l.stage_id IS NOT DISTINCT FROM target.id THEN RETURN to_jsonb(l); END IF;
  SELECT * INTO source FROM public.crm_stages WHERE id=l.stage_id;
  IF jsonb_typeof(source.etapas_permitidas)='array' AND jsonb_array_length(source.etapas_permitidas)>0
    AND NOT source.etapas_permitidas ? p_stage::text THEN RAISE EXCEPTION 'Avanço não permitido pela etapa atual.'; END IF;
  SELECT count(*) INTO interaction_count FROM public.crm_lead_interacoes WHERE lead_id=l.id AND cliente_id=p_client;
  FOR action IN SELECT value FROM jsonb_array_elements(coalesce(target.acoes_obrigatorias,'[]')) LOOP
    IF coalesce(action->>'type',action->>'tipo') IN ('interaction','interacao') AND interaction_count<coalesce((action->>'min_count')::integer,(action->>'minCount')::integer,1) THEN
      RAISE EXCEPTION 'Registre as interações obrigatórias antes de avançar.';
    ELSIF coalesce(action->>'type',action->>'tipo')='follow_up' AND l.proxima_acao IS NULL THEN RAISE EXCEPTION 'Agende a próxima ação antes de avançar.';
    ELSIF coalesce(action->>'type',action->>'tipo')='field' AND coalesce(btrim(to_jsonb(l)->>(action->>'field')),'')='' THEN
      RAISE EXCEPTION 'Preencha o campo obrigatório: %.',coalesce(action->>'label',action->>'field');
    END IF;
  END LOOP;
  IF target.tipo IN ('ganho','perdido') AND coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'Informe o motivo de ganho ou perda.'; END IF;
  UPDATE public.leads SET stage_id=target.id,pipeline_id=target.pipeline_id,status=target.nome,
    status_vida=CASE WHEN target.tipo='ganho' THEN 'ganho' WHEN target.tipo='perdido' THEN 'perdido' ELSE 'ativo' END,
    stage_entered_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=l.id RETURNING * INTO l;
  INSERT INTO public.crm_funnel_events(lead_id,stage_anterior_id,stage_nova_id,user_id,motivo_ganho_perdido,metadados)
    VALUES(l.id,source.id,target.id,coalesce(auth.uid(),p_worker_actor),nullif(btrim(p_reason),''),'{"source":"crm-ia"}');
  RETURN to_jsonb(l);
END $$;

CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text; client_id uuid:=p_client_id; item_id uuid; v_owner_id uuid; channel_id uuid; v_contact_id uuid;
  result jsonb; rows jsonb; total bigint; cfg public.crm_ia_config; lead public.leads; stage public.crm_stages; pipeline public.crm_pipelines;
  config_data jsonb; section text; item jsonb; old jsonb; field_row jsonb; stamp timestamptz; source_id uuid; target_client uuid; v_request_id uuid;
  offset_n integer:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
  limit_n integer:=greatest(1,least(coalesce((p_payload->>'limit')::integer,50),200));
  search_text text:=left(btrim(coalesce(p_payload->>'search','')),200);
  since_date date:=coalesce(nullif(p_payload->>'since','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date-6);
  until_date date:=coalesce(nullif(p_payload->>'until','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
  role:=private.crm_ia_role();
  IF role IS NULL THEN RAISE EXCEPTION 'Acesso ao CRM IA indisponível.' USING ERRCODE='42501'; END IF;
  IF coalesce(jsonb_typeof(p_payload),'')<>'object' OR octet_length(p_payload::text)>2000000 THEN RAISE EXCEPTION 'Dados inválidos.'; END IF;
  IF until_date<since_date OR until_date-since_date>366 THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  IF p_action='bootstrap' THEN
    RETURN jsonb_build_object('clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'empresa',c.empresa) ORDER BY c.empresa)
      FROM public.clientes c WHERE private.crm_ia_client(c.id)),'[]'),'permissions',jsonb_build_object('manage',role IN ('admin','superadmin')));
  END IF;
  IF NOT private.crm_ia_client(client_id) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501'; END IF;
  item_id:=nullif(p_payload->>'id','')::uuid;
  channel_id:=nullif(coalesce(p_payload->>'channel_id',p_payload->>'whatsapp_config_id'),'')::uuid;
  v_contact_id:=nullif(p_payload->>'contact_id','')::uuid;
  v_owner_id:=nullif(coalesce(p_payload->>'owner_id',p_payload->>'responsavel_id',p_payload->>'assigned_to'),'')::uuid;
  IF v_owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_owner_id AND p.status='active' AND p.role IN ('admin','superadmin','colaborador')) THEN
    RAISE EXCEPTION 'Responsável indisponível.';
  END IF;
  SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=client_id;
  config_data:=coalesce(cfg.data,'{}');
  IF p_action='workspace' THEN
    RETURN jsonb_build_object(
      'client',(SELECT jsonb_build_object('id',c.id,'empresa',c.empresa) FROM public.clientes c WHERE c.id=client_id),
      'pipelines',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('is_default',p.crm_ia_default) ORDER BY p.created_at) FROM public.crm_pipelines p WHERE p.cliente_id=client_id),'[]'),
      'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordem,s.id) FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE p.cliente_id=client_id),'[]'),
      'agents',CASE WHEN role IN ('admin','superadmin') THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=client_id),'[]') ELSE '[]'::jsonb END,
      'bases',CASE WHEN role IN ('admin','superadmin') THEN coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.nome) FROM public.cliente_atend_ia_bases b WHERE b.cliente_id=client_id),'[]') ELSE '[]'::jsonb END,
      'products',coalesce((SELECT jsonb_agg(x) FROM (SELECT to_jsonb(p)||'{"item_tipo":"produto"}'::jsonb x FROM public.crm_produtos p WHERE p.cliente_id=client_id
        UNION ALL SELECT to_jsonb(s)||'{"item_tipo":"servico"}'::jsonb FROM public.crm_servicos s WHERE s.cliente_id=client_id) p),'[]'),
      'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) ORDER BY p.full_name) FROM public.profiles p WHERE p.status='active' AND p.role IN ('admin','superadmin','colaborador')),'[]'),
      'channels',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'instance_name',coalesce(nullif(c.name,''),'Número WhatsApp'),
        'instance_status',c.instance_status,'is_active',c.archived_at IS NULL,'can_send',private.crm_ia_channel(client_id,c.id,true)))
        FROM public.cliente_whatsapp_config c WHERE c.cliente_id=client_id AND private.crm_ia_channel(client_id,c.id)),'[]'),
      'config',jsonb_build_object('data',config_data,'revision',cfg.revision),
      'templates',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.nome) FROM public.crm_ia_templates t WHERE t.owner_id=auth.uid()),'[]'),
      'provisioned',public.cliente_atend_loja_habilitada(client_id),
      'permissions',jsonb_build_object('manage',role IN ('admin','superadmin'),'provision',role='superadmin',
        'conversations',private.crm_ia_module('atendimento') OR private.crm_ia_module('rastreamento'),'tracking',private.crm_ia_module('rastreamento')));
  ELSIF p_action='authorize_ai' THEN
    IF p_payload->>'mode'='testar' AND role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Somente a gestão testa os agentes.' USING ERRCODE='42501'; END IF;
    IF coalesce(p_payload->>'mode','') NOT IN ('testar','sugerir') THEN RAISE EXCEPTION 'Ação de IA inválida.'; END IF;
    IF p_payload->>'mode'='sugerir' AND (NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT private.crm_ia_channel(client_id,channel_id)) THEN RAISE EXCEPTION 'Sem acesso à conversa.' USING ERRCODE='42501'; END IF;
    IF nullif(p_payload->>'agent_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_agentes a WHERE a.id=(p_payload->>'agent_id')::uuid AND a.cliente_id=client_id) THEN RAISE EXCEPTION 'Agente indisponível.'; END IF;
    RETURN jsonb_build_object('allowed',true,'manage',role IN ('admin','superadmin'));
  ELSIF p_action='authorize_media' THEN
    IF NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT private.crm_ia_channel(client_id,channel_id) THEN RAISE EXCEPTION 'Sem acesso a esta mídia.' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c JOIN public.cliente_whatsapp_inbox i ON i.cliente_id=c.cliente_id AND (i.from_jid=c.from_jid OR i.chat_jid=c.from_jid)
      WHERE c.id=v_contact_id AND c.cliente_id=client_id AND i.whatsapp_config_id=channel_id AND i.media_purged_at IS NULL
        AND (i.message_id=p_payload->>'message_id' OR i.raw_payload->'message'->>'messageid'=p_payload->>'message_id'))
      AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c JOIN public.cliente_whatsapp_sent s ON s.cliente_id=c.cliente_id AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid)
        WHERE c.id=v_contact_id AND c.cliente_id=client_id AND s.whatsapp_config_id=channel_id AND (s.message_id=p_payload->>'message_id' OR s.uazapi_internal_id=p_payload->>'message_id')) THEN
      RAISE EXCEPTION 'Arquivo indisponível neste contato e canal.' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('allowed',true,'chat_jid',(SELECT from_jid FROM public.cliente_whatsapp_contact WHERE id=v_contact_id));
  ELSIF p_action=ANY(ARRAY['overview','conversations','lead','usage']) THEN
    RETURN private.crm_ia_read(p_action,client_id,p_payload);
  ELSIF p_action='leads' THEN
    WITH filtered AS (
      SELECT l.* FROM public.leads l WHERE l.cliente_id=client_id AND private.crm_ia_lead(l.id,client_id)
        AND (CASE WHEN p_payload->>'archived'='true' THEN l.crm_ia_archived_at IS NOT NULL ELSE l.crm_ia_archived_at IS NULL END)
        AND (search_text='' OR l.nome ILIKE '%'||search_text||'%' OR l.whatsapp ILIKE '%'||search_text||'%' OR l.email ILIKE '%'||search_text||'%')
        AND (nullif(p_payload->>'pipeline_id','') IS NULL OR l.pipeline_id=(p_payload->>'pipeline_id')::uuid)
        AND (nullif(p_payload->>'stage_id','') IS NULL OR l.stage_id=(p_payload->>'stage_id')::uuid)
        AND (nullif(p_payload->>'owner_id','') IS NULL OR l.responsavel_id=(p_payload->>'owner_id')::uuid)
        AND (nullif(p_payload->>'origin','') IS NULL OR l.origem=p_payload->>'origin')
        AND (nullif(p_payload->>'since','') IS NULL OR coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date)>=since_date)
        AND (nullif(p_payload->>'until','') IS NULL OR coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date)<=until_date)
        AND (nullif(p_payload->>'qualified','') IS NULL OR coalesce((to_jsonb(l)->>'qualificado')::boolean,(to_jsonb(l)->>'comercial_qualificado')::boolean,false)=(p_payload->>'qualified'='true'))
    ), page AS (SELECT * FROM filtered ORDER BY
      CASE WHEN p_payload->>'sort'='name' THEN nome END ASC,
      CASE WHEN p_payload->>'sort'='value' THEN valor END DESC NULLS LAST,
      CASE WHEN p_payload->>'sort'='oldest' THEN created_at END ASC,
      created_at DESC,id DESC LIMIT limit_n OFFSET offset_n)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('contact_id',p.crm_ia_contact_id,'archived_at',p.crm_ia_archived_at)) FROM page p),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
    RETURN result;
  ELSIF p_action='messages' THEN
    IF NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT private.crm_ia_channel(client_id,channel_id) THEN
      RAISE EXCEPTION 'Sem acesso ao contato ou canal.' USING ERRCODE='42501'; END IF;
    WITH target AS (SELECT * FROM public.cliente_whatsapp_contact WHERE id=v_contact_id AND cliente_id=client_id), messages AS (
      SELECT i.id,i.body,i.created_at,false AS from_me,NULL::text AS media_url,coalesce(to_jsonb(i)->>'type','text') AS media_type,
        i.message_id,coalesce(i.raw_payload->'message'->>'messageid',i.message_id) AS download_id,i.media_purged_at,
        'contact'::text AS sender_kind
      FROM public.cliente_whatsapp_inbox i,target c WHERE i.cliente_id=client_id AND i.whatsapp_config_id=channel_id
        AND NOT coalesce(i.is_group,false) AND (i.from_jid=c.from_jid OR i.chat_jid=c.from_jid)
      UNION ALL
      SELECT s.id,s.body,s.created_at,true,NULL::text,'text',s.message_id,coalesce(s.uazapi_internal_id,s.message_id),NULL::timestamptz,coalesce(s.sender_kind,'human')
      FROM public.cliente_whatsapp_sent s,target c WHERE s.cliente_id=client_id AND s.whatsapp_config_id=channel_id AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid)
    ), page AS (SELECT * FROM messages ORDER BY created_at DESC,id DESC LIMIT limit_n OFFSET offset_n)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at,p.id) FROM page p),'[]'),'total',(SELECT count(*) FROM messages),
      'state',(SELECT jsonb_build_object('nome',coalesce(nullif(c.mini_crm->>'contato_nome',''),c.sender_name),'contact_id',c.id,'channel_id',channel_id,
        'attendance',CASE WHEN s.status='finalizado' THEN 'resolved' WHEN coalesce(s.ia_pausada,true) THEN 'human' ELSE 'ai' END,'updated_at',s.updated_at)
        FROM target c LEFT JOIN public.cliente_atend_conversas s ON s.cliente_id=client_id AND s.contact_id=c.id)) INTO result;
    RETURN result;
  ELSIF p_action='queue' THEN
    WITH filtered AS(SELECT o.id,o.contact_id,o.whatsapp_config_id,o.body,o.scheduled_at,o.status,o.kind,o.created_at,o.error_code,o.sent_at
      FROM public.crm_ia_outbox o WHERE o.cliente_id=client_id AND private.crm_ia_contact(client_id,o.contact_id)
        AND private.crm_ia_channel(client_id,o.whatsapp_config_id)
        AND (role IN ('admin','superadmin') OR o.created_by=auth.uid())
        AND (v_contact_id IS NULL OR o.contact_id=v_contact_id) AND (channel_id IS NULL OR o.whatsapp_config_id=channel_id)),
    page AS(SELECT * FROM filtered ORDER BY scheduled_at DESC,id DESC LIMIT limit_n OFFSET offset_n)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page p),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
    RETURN result;
  ELSIF p_action='slots' THEN
    IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Selecione o atendente.'; END IF;
    source_id:=nullif(p_payload->>'appointment_id','')::uuid;
    IF source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_ia_appointments a WHERE a.id=source_id AND a.cliente_id=client_id
      AND (a.lead_id IS NULL OR private.crm_ia_lead(a.lead_id,client_id))
      AND (a.contact_id IS NULL OR private.crm_ia_contact(client_id,a.contact_id))) THEN RAISE EXCEPTION 'Compromisso indisponível.'; END IF;
    RETURN private.crm_ia_slots(client_id,v_owner_id,(p_payload->>'date')::date,source_id);
  ELSIF p_action='agenda' THEN
    WITH filtered AS(SELECT a.* FROM public.crm_ia_appointments a WHERE a.cliente_id=client_id
      AND (a.lead_id IS NULL OR private.crm_ia_lead(a.lead_id,client_id)) AND (a.contact_id IS NULL OR private.crm_ia_contact(client_id,a.contact_id))
      AND (nullif(p_payload->>'owner_id','') IS NULL OR a.owner_id=(p_payload->>'owner_id')::uuid)
      AND a.start_at>=since_date::timestamp AT TIME ZONE 'America/Sao_Paulo' AND a.start_at<(until_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    page AS(SELECT * FROM filtered ORDER BY start_at,id LIMIT limit_n OFFSET offset_n)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page p),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
    RETURN result;
  END IF;
  IF p_action=ANY(ARRAY['save_config','save_lead','move_lead','archive_lead','restore_lead','bulk_assign','save_pipeline','save_stage',
    'reorder_stages','delete_stage','delete_pipeline','save_agent','save_base','save_product','save_template','apply_template',
    'save_conversation','open_conversation','save_appointment','cancel_appointment','schedule_message','prepare_media','cancel_message','provision','import_leads']) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||client_id::text,0));
    SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=client_id FOR UPDATE;
    config_data:=coalesce(cfg.data,'{}');
  END IF;
  IF p_action=ANY(ARRAY['save_config','save_pipeline','save_stage','reorder_stages','delete_stage','delete_pipeline','save_agent',
    'save_base','save_product','save_template','apply_template','provision']) AND role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Somente a gestão configura o CRM IA.' USING ERRCODE='42501';
  END IF;
  IF p_action='save_config' THEN
    section:=p_payload->>'section'; item:=p_payload->'data';
    IF NOT coalesce(section,'')=ANY(ARRAY['knowledge','concierge','availability','distribution','entry','custom_fields','test_mode','attendance'])
      OR coalesce(jsonb_typeof(item),'')<>'object' OR octet_length(item::text)>50000 THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
    IF nullif(p_payload->>'revision','')::uuid IS DISTINCT FROM cfg.revision THEN RAISE EXCEPTION 'A configuração foi alterada. Atualize a versão.' USING ERRCODE='40001'; END IF;
    IF section='availability' THEN
      IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=coalesce(item->>'timezone','America/Sao_Paulo'))
        OR coalesce((item->>'duration_minutes')::integer,30) NOT BETWEEN 5 AND 720
        OR coalesce((item->>'interval_minutes')::integer,30) NOT BETWEEN 5 AND 720
        OR coalesce((item->>'buffer_before')::integer,0) NOT BETWEEN 0 AND 240
        OR coalesce((item->>'buffer_after')::integer,0) NOT BETWEEN 0 AND 240
        OR coalesce((item->>'min_notice_hours')::numeric,1) NOT BETWEEN 0 AND 720
        OR coalesce((item->>'horizon_days')::integer,60) NOT BETWEEN 1 AND 366
        OR coalesce((item->>'max_per_day')::integer,8) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Disponibilidade inválida.'; END IF;
      FOR old IN SELECT value FROM jsonb_array_elements(coalesce(item->'windows','[]')) LOOP
        IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(old->>'owner_id')::uuid AND p.status='active' AND p.role IN ('admin','superadmin','colaborador'))
          OR (old->>'start')::time >= (old->>'end')::time OR jsonb_array_length(coalesce(old->'days','[]'))=0
          OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(old->'days') d WHERE d::integer NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Janela de atendimento inválida.'; END IF;
      END LOOP;
    ELSIF section='test_mode' AND (jsonb_typeof(coalesce(item->'phones','[]'))<>'array' OR
      EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(item->'phones','[]')) p WHERE private.crm_ia_phone(p) !~ '^[0-9]{10,15}$')) THEN
      RAISE EXCEPTION 'Informe os números de teste com país e DDD.';
    ELSIF section='custom_fields' THEN
      IF jsonb_array_length(coalesce(item->'fields','[]'))>50 OR (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(coalesce(item->'fields','[]')))<>jsonb_array_length(coalesce(item->'fields','[]')) THEN RAISE EXCEPTION 'Limite de 50 campos com chaves únicas.'; END IF;
      FOR field_row IN SELECT value FROM jsonb_array_elements(coalesce(item->'fields','[]')) LOOP
        IF coalesce(field_row->>'key','') !~ '^[a-z][a-z0-9_]{0,49}$' OR length(btrim(coalesce(field_row->>'name',''))) NOT BETWEEN 1 AND 100
          OR field_row->>'type' NOT IN ('text','textarea','number','date','select') THEN RAISE EXCEPTION 'Campo personalizado inválido.'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(config_data->'custom_fields'->'fields','[]')) f WHERE f->>'key'=field_row->>'key' AND f->>'type' IS DISTINCT FROM field_row->>'type') THEN
          RAISE EXCEPTION 'O tipo de um campo existente não pode mudar.';
        END IF;
      END LOOP;
    ELSIF section='knowledge' THEN
      FOR field_row IN SELECT value FROM jsonb_array_elements(coalesce(item->'assignments','[]')) LOOP
        IF NOT EXISTS(SELECT 1 FROM public.crm_pipelines p WHERE p.id=(field_row->>'pipeline_id')::uuid AND p.cliente_id=client_id)
          OR NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_bases b WHERE b.id=(field_row->>'base_id')::uuid AND b.cliente_id=client_id) THEN RAISE EXCEPTION 'Funil ou base indisponível.'; END IF;
      END LOOP;
      IF nullif(item->>'concierge_base_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_bases b WHERE b.id=(item->>'concierge_base_id')::uuid AND b.cliente_id=client_id) THEN RAISE EXCEPTION 'Base do Concierge indisponível.'; END IF;
    ELSIF section='entry' THEN
      FOR field_row IN SELECT value FROM jsonb_array_elements(coalesce(item->'channels','[]')) LOOP
        IF NOT private.crm_ia_channel(client_id,(field_row->>'channel_id')::uuid,true) THEN RAISE EXCEPTION 'Canal de entrada indisponível.'; END IF;
        IF coalesce((field_row->>'enabled')::boolean,false) AND (NOT EXISTS(SELECT 1 FROM public.crm_pipelines p WHERE p.id=(field_row->>'pipeline_id')::uuid AND p.cliente_id=client_id)
          OR NOT EXISTS(SELECT 1 FROM public.crm_stages s WHERE s.id=(field_row->>'stage_id')::uuid AND s.pipeline_id=(field_row->>'pipeline_id')::uuid)) THEN RAISE EXCEPTION 'Escolha o funil e a etapa de entrada.'; END IF;
      END LOOP;
    ELSIF section='distribution' THEN
      FOR field_row IN SELECT value FROM jsonb_array_elements(coalesce(item->'people','[]')) LOOP
        IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(field_row->>'owner_id')::uuid AND p.status='active' AND p.role IN ('admin','superadmin','colaborador'))
          OR coalesce((field_row->>'weight')::integer,1) NOT BETWEEN 1 AND 5 OR coalesce((field_row->>'limit')::integer,0)<0 THEN RAISE EXCEPTION 'Participante ou peso de distribuição inválido.'; END IF;
      END LOOP;
    END IF;
    config_data:=jsonb_set(config_data,ARRAY[section],item,true);
    INSERT INTO public.crm_ia_config(cliente_id,data,updated_by) VALUES(client_id,config_data,auth.uid())
      ON CONFLICT(cliente_id) DO UPDATE SET data=excluded.data,revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid()
      RETURNING * INTO cfg;
    RETURN jsonb_build_object('data',cfg.data,'revision',cfg.revision);
  ELSIF p_action='save_pipeline' THEN
    IF length(btrim(coalesce(p_payload->>'nome',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Informe o nome do funil.'; END IF;
    IF item_id IS NOT NULL THEN
      SELECT * INTO pipeline FROM public.crm_pipelines WHERE id=item_id AND cliente_id=client_id FOR UPDATE;
      IF pipeline.id IS NULL THEN RAISE EXCEPTION 'Funil indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',pipeline.updated_at);
      UPDATE public.crm_pipelines SET nome=btrim(p_payload->>'nome'),updated_at=clock_timestamp(),
        crm_ia_default=coalesce((p_payload->>'is_default')::boolean,crm_ia_default) WHERE id=item_id RETURNING * INTO pipeline;
    ELSE
      INSERT INTO public.crm_pipelines(cliente_id,nome,crm_ia_default) VALUES(client_id,btrim(p_payload->>'nome'),coalesce((p_payload->>'is_default')::boolean,false)) RETURNING * INTO pipeline;
    END IF;
    IF pipeline.crm_ia_default THEN UPDATE public.crm_pipelines SET crm_ia_default=false,updated_at=clock_timestamp() WHERE cliente_id=client_id AND id<>pipeline.id AND crm_ia_default; END IF;
    RETURN to_jsonb(pipeline)||jsonb_build_object('is_default',pipeline.crm_ia_default);
  ELSIF p_action='save_stage' THEN
    SELECT * INTO pipeline FROM public.crm_pipelines WHERE id=(p_payload->>'pipeline_id')::uuid AND cliente_id=client_id;
    IF pipeline.id IS NULL OR length(btrim(coalesce(p_payload->>'nome',''))) NOT BETWEEN 1 AND 100
      OR coalesce(p_payload->>'color','#6366f1') !~ '^#[0-9a-fA-F]{6}$'
      OR coalesce(p_payload->>'tipo','intermediaria') NOT IN ('intermediaria','ganho','perdido') THEN RAISE EXCEPTION 'Etapa inválida.'; END IF;
    IF item_id IS NOT NULL THEN
      SELECT * INTO stage FROM public.crm_stages WHERE id=item_id AND pipeline_id=pipeline.id FOR UPDATE;
      IF stage.id IS NULL THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',stage.updated_at);
      UPDATE public.crm_stages SET nome=btrim(p_payload->>'nome'),color=coalesce(p_payload->>'color',color),
        tipo=coalesce(p_payload->>'tipo',tipo),crm_ia_icon=coalesce(p_payload->>'icon',crm_ia_icon),updated_at=clock_timestamp()
        WHERE id=item_id RETURNING * INTO stage;
    ELSE
      INSERT INTO public.crm_stages(pipeline_id,nome,color,tipo,ordem,crm_ia_icon) VALUES(pipeline.id,btrim(p_payload->>'nome'),coalesce(p_payload->>'color','#6366f1'),
        coalesce(p_payload->>'tipo','intermediaria'),coalesce((p_payload->>'ordem')::integer,0),p_payload->>'icon') RETURNING * INTO stage;
    END IF;
    RETURN to_jsonb(stage);
  ELSIF p_action='reorder_stages' THEN
    SELECT * INTO pipeline FROM public.crm_pipelines WHERE id=(p_payload->>'pipeline_id')::uuid AND cliente_id=client_id FOR UPDATE;
    IF pipeline.id IS NULL THEN RAISE EXCEPTION 'Funil indisponível.'; END IF;
    PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',pipeline.updated_at);
    IF jsonb_typeof(p_payload->'stage_ids')<>'array' OR (SELECT count(*) FROM public.crm_stages WHERE pipeline_id=pipeline.id)<>jsonb_array_length(p_payload->'stage_ids')
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload->'stage_ids'))<>jsonb_array_length(p_payload->'stage_ids')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'stage_ids') x WHERE NOT EXISTS(SELECT 1 FROM public.crm_stages s WHERE s.pipeline_id=pipeline.id AND s.id=x::uuid)) THEN RAISE EXCEPTION 'Ordem de etapas inválida.'; END IF;
    UPDATE public.crm_stages s SET ordem=x.n-1,updated_at=clock_timestamp() FROM
      (SELECT value::uuid id,ordinality::integer n FROM jsonb_array_elements_text(p_payload->'stage_ids') WITH ORDINALITY) x WHERE s.id=x.id;
    UPDATE public.crm_pipelines SET updated_at=clock_timestamp() WHERE id=pipeline.id;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action IN ('delete_stage','delete_pipeline') THEN
    IF p_action='delete_stage' THEN
      SELECT s.* INTO stage FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE s.id=item_id AND p.cliente_id=client_id FOR UPDATE OF s;
      IF stage.id IS NULL THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',stage.updated_at);
      IF EXISTS(SELECT 1 FROM public.leads WHERE stage_id=item_id) OR EXISTS(SELECT 1 FROM public.crm_funnel_events WHERE stage_anterior_id=item_id OR stage_nova_id=item_id) THEN
        RAISE EXCEPTION 'Etapa com leads ou histórico. Mova os registros; o histórico deve ser preservado.'; END IF;
      DELETE FROM public.crm_stages WHERE id=item_id;
    ELSE
      SELECT * INTO pipeline FROM public.crm_pipelines WHERE id=item_id AND cliente_id=client_id FOR UPDATE;
      IF pipeline.id IS NULL THEN RAISE EXCEPTION 'Funil indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',pipeline.updated_at);
      IF EXISTS(SELECT 1 FROM public.leads WHERE pipeline_id=item_id) OR EXISTS(SELECT 1 FROM public.crm_stages WHERE pipeline_id=item_id) THEN
        RAISE EXCEPTION 'O funil ainda possui etapas ou leads.'; END IF;
      DELETE FROM public.crm_pipelines WHERE id=item_id;
    END IF;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='move_lead' THEN
    RETURN private.crm_ia_move(client_id,item_id,(p_payload->>'stage_id')::uuid,coalesce(p_payload->>'reason',p_payload->>'motivo_ganho_perdido'),p_payload->>'expected_updated_at');
  ELSIF p_action='save_lead' THEN
    IF item_id IS NOT NULL THEN
      IF NOT private.crm_ia_lead(item_id,client_id) THEN RAISE EXCEPTION 'Lead indisponível.' USING ERRCODE='42501'; END IF;
      SELECT * INTO lead FROM public.leads WHERE id=item_id AND cliente_id=client_id FOR UPDATE;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',lead.updated_at);
      IF p_payload ? 'stage_id' AND nullif(p_payload->>'stage_id','')::uuid IS DISTINCT FROM lead.stage_id THEN
        result:=private.crm_ia_move(client_id,item_id,nullif(p_payload->>'stage_id','')::uuid,p_payload->>'reason',p_payload->>'expected_updated_at');
        SELECT * INTO lead FROM public.leads WHERE id=item_id;
      END IF;
      item:=to_jsonb(lead)||p_payload;
    ELSE item:=p_payload; END IF;
    IF role='colaborador' AND item_id IS NOT NULL AND nullif(item->>'responsavel_id','')::uuid IS DISTINCT FROM lead.responsavel_id
      AND nullif(item->>'responsavel_id','')::uuid IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente a gestão pode transferir a oportunidade para outra pessoa.' USING ERRCODE='42501'; END IF;
    IF length(btrim(coalesce(item->>'nome',''))) NOT BETWEEN 1 AND 200 OR private.crm_ia_phone(item->>'whatsapp') !~ '^[0-9]{10,15}$'
      OR length(coalesce(item->>'email',''))>254 OR (coalesce(item->>'email','')<>'' AND item->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      OR coalesce((item->>'valor')::numeric,0)<0 OR length(coalesce(item->>'observacoes',''))>10000 THEN RAISE EXCEPTION 'Revise nome, telefone, e-mail e valor do lead.'; END IF;
    IF nullif(item->>'pipeline_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_pipelines WHERE id=(item->>'pipeline_id')::uuid AND cliente_id=client_id) THEN RAISE EXCEPTION 'Funil indisponível.'; END IF;
    IF nullif(item->>'stage_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE s.id=(item->>'stage_id')::uuid AND p.cliente_id=client_id AND (nullif(item->>'pipeline_id','') IS NULL OR s.pipeline_id=(item->>'pipeline_id')::uuid)) THEN RAISE EXCEPTION 'Etapa indisponível.'; END IF;
    IF nullif(item->>'responsavel_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(item->>'responsavel_id')::uuid AND p.status='active' AND p.role IN ('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
    IF nullif(item->>'contact_id','') IS NOT NULL THEN
      v_contact_id:=(item->>'contact_id')::uuid;
      IF NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c WHERE c.id=v_contact_id AND private.crm_ia_phone(coalesce(nullif(c.phone,''),c.from_jid))=private.crm_ia_phone(item->>'whatsapp')) THEN RAISE EXCEPTION 'Contato indisponível para este telefone.'; END IF;
    ELSE
      SELECT CASE WHEN count(*)=1 THEN min(c.id::text)::uuid END INTO v_contact_id FROM public.cliente_whatsapp_contact c
        WHERE c.cliente_id=client_id AND private.crm_ia_phone(coalesce(nullif(c.phone,''),c.from_jid))=private.crm_ia_phone(item->>'whatsapp');
    END IF;
    IF jsonb_typeof(coalesce(item->'crm_ia_fields','{}'))<>'object' OR octet_length(coalesce(item->'crm_ia_fields','{}')::text)>30000 THEN RAISE EXCEPTION 'Campos personalizados inválidos.'; END IF;
    FOR field_row IN SELECT value FROM jsonb_array_elements(coalesce(config_data->'custom_fields'->'fields','[]')) LOOP
      IF item->'crm_ia_fields' ? (field_row->>'key') AND item->'crm_ia_fields'->>(field_row->>'key')<>'' THEN
        IF field_row->>'type'='number' AND item->'crm_ia_fields'->>(field_row->>'key') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Informe um número no campo %.',field_row->>'name'; END IF;
        IF field_row->>'type'='date' AND item->'crm_ia_fields'->>(field_row->>'key') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Informe uma data no campo %.',field_row->>'name'; END IF;
        IF field_row->>'type'='select' AND NOT coalesce(field_row->'options','[]') ? (item->'crm_ia_fields'->>(field_row->>'key')) THEN RAISE EXCEPTION 'Opção inválida no campo %.',field_row->>'name'; END IF;
      END IF;
    END LOOP;
    IF item_id IS NULL THEN
      INSERT INTO public.leads(cliente_id,nome,whatsapp,email,valor,origem,observacoes,pipeline_id,stage_id,status,responsavel_id,crm_ia_contact_id,crm_ia_fields)
      VALUES(client_id,btrim(item->>'nome'),private.crm_ia_phone(item->>'whatsapp'),nullif(item->>'email',''),coalesce((item->>'valor')::numeric,0),
        coalesce(nullif(item->>'origem',''),'manual'),coalesce(item->>'observacoes',''),nullif(item->>'pipeline_id','')::uuid,nullif(item->>'stage_id','')::uuid,
        coalesce((SELECT nome FROM public.crm_stages WHERE id=nullif(item->>'stage_id','')::uuid),'novo'),
        CASE WHEN role='colaborador' THEN auth.uid() ELSE nullif(item->>'responsavel_id','')::uuid END,v_contact_id,coalesce(item->'crm_ia_fields','{}')) RETURNING * INTO lead;
    ELSE
      UPDATE public.leads SET nome=btrim(item->>'nome'),whatsapp=private.crm_ia_phone(item->>'whatsapp'),email=nullif(item->>'email',''),
        valor=coalesce((item->>'valor')::numeric,0),origem=item->>'origem',observacoes=item->>'observacoes',
        responsavel_id=nullif(item->>'responsavel_id','')::uuid,crm_ia_contact_id=v_contact_id,crm_ia_fields=coalesce(item->'crm_ia_fields',crm_ia_fields),updated_at=clock_timestamp()
        WHERE id=item_id AND cliente_id=client_id RETURNING * INTO lead;
    END IF;
    RETURN to_jsonb(lead)||jsonb_build_object('contact_id',lead.crm_ia_contact_id,'archived_at',lead.crm_ia_archived_at);
  ELSIF p_action IN ('archive_lead','restore_lead') THEN
    IF NOT private.crm_ia_lead(item_id,client_id) THEN RAISE EXCEPTION 'Lead indisponível.'; END IF;
    SELECT * INTO lead FROM public.leads WHERE id=item_id FOR UPDATE;
    IF p_action='archive_lead' THEN PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',lead.updated_at); END IF;
    UPDATE public.leads SET crm_ia_archived_at=CASE WHEN p_action='archive_lead' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=item_id RETURNING * INTO lead;
    IF p_action='archive_lead' THEN UPDATE public.crm_ia_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE lead_id=item_id AND cliente_id=client_id AND kind<>'manual' AND status='pending'; END IF;
    RETURN to_jsonb(lead)||jsonb_build_object('archived_at',lead.crm_ia_archived_at);
  ELSIF p_action='bulk_assign' THEN
    IF jsonb_array_length(p_payload->'ids') NOT BETWEEN 1 AND 200 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'ids') x WHERE NOT private.crm_ia_lead(x::uuid,client_id)) THEN RAISE EXCEPTION 'Seleção de leads inválida.'; END IF;
    IF role='colaborador' AND v_owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente a gestão transfere leads.'; END IF;
    UPDATE public.leads SET responsavel_id=v_owner_id,updated_at=clock_timestamp() WHERE cliente_id=client_id AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'ids'));
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action IN ('schedule_message','prepare_media') THEN
    IF NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT private.crm_ia_channel(client_id,channel_id,true) THEN RAISE EXCEPTION 'Sem acesso de envio para este contato e canal.' USING ERRCODE='42501'; END IF;
    IF length(btrim(coalesce(p_payload->>'body',''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Escreva uma mensagem de até 4.000 caracteres.'; END IF;
    stamp:=coalesce((p_payload->>'scheduled_at')::timestamptz,clock_timestamp());
    IF stamp<clock_timestamp()-interval '2 minutes' OR stamp>clock_timestamp()+interval '366 days' THEN RAISE EXCEPTION 'Data de envio inválida.'; END IF;
    v_request_id:=nullif(p_payload->>'request_id','')::uuid;
    IF v_request_id IS NULL THEN RAISE EXCEPTION 'Identificador de envio obrigatório.'; END IF;
    item:=CASE WHEN p_action='prepare_media' THEN p_payload->'media_descriptor' ELSE '{}'::jsonb END;
    IF p_action='prepare_media' AND (coalesce(jsonb_typeof(item),'')<>'object' OR coalesce(item->>'hash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(item->>'media_type','') NOT IN ('image','video','audio','ptt','document') OR coalesce((item->>'size')::integer,0) NOT BETWEEN 1 AND 4194304
      OR length(coalesce(item->>'file_name',''))>200 OR length(coalesce(item->>'mimetype',''))>100 OR length(coalesce(item->>'caption',''))>4000
      OR p_payload ? 'scheduled_at') THEN RAISE EXCEPTION 'Anexo inválido. Envie até 4 MB, sem agendamento.'; END IF;
    IF nullif(p_payload->>'lead_id','') IS NOT NULL AND NOT private.crm_ia_lead((p_payload->>'lead_id')::uuid,client_id) THEN RAISE EXCEPTION 'Lead indisponível.'; END IF;
    INSERT INTO public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,media_descriptor)
      VALUES(client_id,channel_id,v_contact_id,nullif(p_payload->>'lead_id','')::uuid,'manual',btrim(p_payload->>'body'),stamp,v_request_id,auth.uid(),item)
      ON CONFLICT(cliente_id,created_by,request_id) DO NOTHING RETURNING to_jsonb(crm_ia_outbox) INTO result;
    IF result IS NULL THEN
      SELECT to_jsonb(o) INTO result FROM public.crm_ia_outbox o WHERE o.cliente_id=client_id AND o.created_by=auth.uid() AND o.request_id=v_request_id;
      IF result->>'body'<>btrim(p_payload->>'body') OR result->>'contact_id'<>v_contact_id::text OR result->>'whatsapp_config_id'<>channel_id::text OR result->'media_descriptor' IS DISTINCT FROM item THEN RAISE EXCEPTION 'Identificador já usado em outro envio.'; END IF;
    END IF;
    UPDATE public.cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE cliente_id=client_id AND cliente_atend_conversas.contact_id=v_contact_id;
    RETURN result-'claim_token';
  ELSIF p_action='cancel_message' THEN
    SELECT to_jsonb(o) INTO old FROM public.crm_ia_outbox o WHERE o.id=item_id AND o.cliente_id=client_id
      AND (o.created_by=auth.uid() OR role IN ('admin','superadmin')) FOR UPDATE;
    IF old IS NULL OR NOT private.crm_ia_contact(client_id,(old->>'contact_id')::uuid) OR NOT private.crm_ia_channel(client_id,(old->>'whatsapp_config_id')::uuid) THEN RAISE EXCEPTION 'Envio indisponível.'; END IF;
    IF old->>'status'<>'pending' THEN RAISE EXCEPTION 'O envio já saiu da fila pendente. Confira o resultado antes de agir.'; END IF;
    UPDATE public.crm_ia_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE id=item_id;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='save_base' THEN
    IF length(btrim(coalesce(p_payload->>'nome',''))) NOT BETWEEN 1 AND 80 OR length(coalesce(p_payload->>'conteudo',''))>30000 THEN RAISE EXCEPTION 'Revise nome e conteúdo da base.'; END IF;
    IF NOT public.cliente_atend_loja_habilitada(client_id) THEN RAISE EXCEPTION 'Prepare o CRM IA desta conta antes de criar agentes e bases.'; END IF;
    IF item_id IS NOT NULL THEN
      SELECT to_jsonb(b) INTO old FROM public.cliente_atend_ia_bases b WHERE b.id=item_id AND b.cliente_id=client_id FOR UPDATE;
      IF old IS NULL THEN RAISE EXCEPTION 'Base indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',(old->>'updated_at')::timestamptz);
      UPDATE public.cliente_atend_ia_bases SET nome=btrim(p_payload->>'nome'),conteudo=coalesce(p_payload->>'conteudo',''),updated_at=clock_timestamp()
        WHERE id=item_id AND cliente_id=client_id RETURNING to_jsonb(cliente_atend_ia_bases) INTO result;
    ELSE
      INSERT INTO public.cliente_atend_ia_bases(cliente_id,nome,conteudo,created_by) VALUES(client_id,btrim(p_payload->>'nome'),coalesce(p_payload->>'conteudo',''),auth.uid()) RETURNING to_jsonb(cliente_atend_ia_bases) INTO result;
    END IF;
    UPDATE public.crm_ia_config SET revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE cliente_id=client_id;
    RETURN result;
  ELSIF p_action='save_agent' THEN
    IF NOT public.cliente_atend_loja_habilitada(client_id) THEN RAISE EXCEPTION 'Prepare o CRM IA desta conta antes de criar agentes.'; END IF;
    IF item_id IS NOT NULL THEN
      SELECT to_jsonb(a) INTO old FROM public.cliente_atend_ia_agentes a WHERE a.id=item_id AND a.cliente_id=client_id FOR UPDATE;
      IF old IS NULL THEN RAISE EXCEPTION 'Agente indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',(old->>'updated_at')::timestamptz);
    ELSE old:='{}'; END IF;
    item:=old||p_payload;
    IF length(btrim(coalesce(item->>'nome',''))) NOT BETWEEN 1 AND 60 OR length(coalesce(item->>'objetivo',''))>500 OR length(coalesce(item->>'instrucoes',''))>8000
      OR coalesce(item->>'tom','cordial') NOT IN ('cordial','formal','descontraido') OR coalesce(item->>'modelo','openai/gpt-4o-mini') NOT IN ('openai/gpt-4o-mini','openai/gpt-4o') THEN RAISE EXCEPTION 'Revise identidade e modelo do agente.'; END IF;
    IF jsonb_typeof(coalesce(item->'base_ids','[]'))<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(item->'base_ids','[]')) x
      WHERE NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_bases b WHERE b.id=x::uuid AND b.cliente_id=client_id)) THEN RAISE EXCEPTION 'Base de conhecimento indisponível.'; END IF;
    IF coalesce(jsonb_typeof(item->'funil'->'crm_ia'),'')<>'object' OR coalesce(item->'funil'->'crm_ia'->>'tipo','') NOT IN ('qualificacao','followup','agendamento') THEN RAISE EXCEPTION 'Informe o tipo do agente.'; END IF;
    old:=item->'funil'->'crm_ia';
    IF coalesce(old->>'audio','nunca')<>'nunca' THEN RAISE EXCEPTION 'Resposta com áudio ainda não está disponível nesta instalação.'; END IF;
    IF nullif(old->>'pipeline_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_pipelines p WHERE p.id=(old->>'pipeline_id')::uuid AND p.cliente_id=client_id) THEN RAISE EXCEPTION 'Funil do agente indisponível.'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(old->'stage_ids','[]')) x WHERE NOT EXISTS(SELECT 1 FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id
      WHERE s.id=x::uuid AND p.cliente_id=client_id AND p.id=nullif(old->>'pipeline_id','')::uuid)) THEN RAISE EXCEPTION 'Etapa do agente indisponível.'; END IF;
    IF nullif(old->'destino'->>'agente_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_agentes a WHERE a.id=(old->'destino'->>'agente_id')::uuid AND a.cliente_id=client_id AND a.id IS DISTINCT FROM item_id) THEN RAISE EXCEPTION 'Agente de destino indisponível.'; END IF;
    IF nullif(old->'destino'->>'stage_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE s.id=(old->'destino'->>'stage_id')::uuid AND p.cliente_id=client_id) THEN RAISE EXCEPTION 'Etapa de destino indisponível.'; END IF;
    IF jsonb_array_length(coalesce(old->'variaveis','[]'))>30 OR jsonb_array_length(coalesce(old->'cadencia','[]'))>10 OR length(old::text)>30000 THEN RAISE EXCEPTION 'Configuração do agente excede o limite.'; END IF;
    -- Setores pertencem a outro controle oficial; o editor novo preserva os existentes.
    IF item_id IS NULL THEN
      INSERT INTO public.cliente_atend_ia_agentes(cliente_id,nome,objetivo,instrucoes,tom,modelo,base_ids,ativo,auto_responder,funil,created_by)
        VALUES(client_id,btrim(item->>'nome'),coalesce(item->>'objetivo',''),coalesce(item->>'instrucoes',''),coalesce(item->>'tom','cordial'),coalesce(item->>'modelo','openai/gpt-4o-mini'),
          ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(item->'base_ids','[]'))),coalesce((item->>'ativo')::boolean,true),coalesce((item->>'auto_responder')::boolean,false),item->'funil',auth.uid())
        RETURNING to_jsonb(cliente_atend_ia_agentes) INTO result;
    ELSE
      UPDATE public.cliente_atend_ia_agentes SET nome=btrim(item->>'nome'),objetivo=coalesce(item->>'objetivo',''),instrucoes=coalesce(item->>'instrucoes',''),tom=coalesce(item->>'tom','cordial'),modelo=coalesce(item->>'modelo','openai/gpt-4o-mini'),
        base_ids=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(item->'base_ids','[]'))),ativo=coalesce((item->>'ativo')::boolean,true),auto_responder=coalesce((item->>'auto_responder')::boolean,false),
        funil=item->'funil',updated_at=clock_timestamp() WHERE id=item_id AND cliente_id=client_id RETURNING to_jsonb(cliente_atend_ia_agentes) INTO result;
    END IF;
    UPDATE public.crm_ia_config SET revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE cliente_id=client_id;
    RETURN result;
  ELSIF p_action='save_product' THEN
    IF length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 200 OR jsonb_typeof(coalesce(p_payload->'crm_ia_details','{}'))<>'object'
      OR coalesce((p_payload->'crm_ia_details'->>'price')::numeric,0)<0 OR length(coalesce(p_payload->'crm_ia_details'->>'description',''))>5000
      OR (coalesce(p_payload->'crm_ia_details'->>'url','')<>'' AND p_payload->'crm_ia_details'->>'url' !~ '^https://') THEN RAISE EXCEPTION 'Produto inválido. Use um link HTTPS.'; END IF;
    section:=CASE WHEN p_payload->>'item_tipo' IN ('servico','serviço') THEN 'crm_servicos' ELSE 'crm_produtos' END;
    IF item_id IS NOT NULL THEN
      EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND cliente_id=$2 FOR UPDATE',section) INTO old USING item_id,client_id;
      IF old IS NULL THEN RAISE EXCEPTION 'Item indisponível.'; END IF;
      PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',(old->>'updated_at')::timestamptz);
      EXECUTE format('UPDATE public.%I SET name=$1,code=$2,crm_ia_details=crm_ia_details||$3,updated_at=clock_timestamp() WHERE id=$4 AND cliente_id=$5 RETURNING to_jsonb(%I)',section,section)
        INTO result USING btrim(p_payload->>'name'),p_payload->>'code',coalesce(p_payload->'crm_ia_details','{}'),item_id,client_id;
    ELSE
      EXECUTE format('INSERT INTO public.%I(cliente_id,name,code,crm_ia_details) VALUES($1,$2,$3,$4) RETURNING to_jsonb(%I)',section,section)
        INTO result USING client_id,btrim(p_payload->>'name'),p_payload->>'code',coalesce(p_payload->'crm_ia_details','{}');
    END IF;
    UPDATE public.crm_ia_config SET revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE cliente_id=client_id;
    RETURN result||jsonb_build_object('item_tipo',CASE WHEN section='crm_servicos' THEN 'servico' ELSE 'produto' END);
  ELSIF p_action='open_conversation' THEN
    IF NOT private.crm_ia_lead(item_id,client_id) OR NOT private.crm_ia_channel(client_id,channel_id,true)
      OR NOT public.cliente_atend_loja_habilitada(client_id) THEN RAISE EXCEPTION 'Lead ou canal indisponível para conversar.' USING ERRCODE='42501'; END IF;
    SELECT * INTO lead FROM public.leads WHERE id=item_id AND cliente_id=client_id AND crm_ia_archived_at IS NULL FOR UPDATE;
    search_text:=ltrim(private.crm_ia_phone(lead.whatsapp),'0');
    IF length(search_text) IN (10,11) THEN search_text:='55'||search_text; END IF;
    IF search_text LIKE '550%' THEN search_text:='55'||substr(search_text,4); END IF;
    IF lead.id IS NULL OR search_text !~ '^[0-9]{10,15}$' OR p_payload->>'chat_jid' IS DISTINCT FROM search_text||'@s.whatsapp.net' THEN RAISE EXCEPTION 'Confira o telefone do lead.'; END IF;
    v_contact_id:=lead.crm_ia_contact_id;
    IF v_contact_id IS NULL THEN
      SELECT count(*),min(c.id::text)::uuid INTO total,v_contact_id FROM public.cliente_whatsapp_contact c
        WHERE c.cliente_id=client_id AND (c.from_jid=p_payload->>'chat_jid'
          OR private.crm_ia_phone(coalesce(nullif(c.phone,''),c.from_jid)) IN (search_text,private.crm_ia_phone(lead.whatsapp)));
      IF total>1 THEN RAISE EXCEPTION 'Há mais de um contato para este telefone. Confira o vínculo antes de conversar.'; END IF;
    END IF;
    IF v_contact_id IS NULL THEN
      INSERT INTO public.cliente_whatsapp_contact(cliente_id,from_jid,phone,sender_name,whatsapp_config_id)
        VALUES(client_id,p_payload->>'chat_jid',search_text,lead.nome,channel_id) RETURNING id INTO v_contact_id;
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,updated_by)
        VALUES(client_id,v_contact_id,'entrada',true,auth.uid(),auth.uid());
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c WHERE c.id=v_contact_id AND c.cliente_id=client_id
      AND (c.from_jid=p_payload->>'chat_jid' OR private.crm_ia_phone(coalesce(nullif(c.phone,''),c.from_jid)) IN (search_text,private.crm_ia_phone(lead.whatsapp)))) THEN RAISE EXCEPTION 'O telefone e o contato vinculado não correspondem. Confira o cadastro.'; END IF;
    IF NOT private.crm_ia_contact(client_id,v_contact_id) THEN RAISE EXCEPTION 'Contato privado ou indisponível.' USING ERRCODE='42501'; END IF;
    SELECT to_jsonb(c) INTO old FROM public.cliente_atend_conversas c WHERE c.cliente_id=client_id AND c.contact_id=v_contact_id FOR UPDATE;
    IF old IS NULL THEN
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,updated_by)
        VALUES(client_id,v_contact_id,'entrada',true,auth.uid(),auth.uid());
    END IF;
    UPDATE public.leads SET crm_ia_contact_id=v_contact_id,updated_at=clock_timestamp() WHERE id=lead.id AND crm_ia_contact_id IS DISTINCT FROM v_contact_id;
    RETURN jsonb_build_object('contact_id',v_contact_id,'channel_id',channel_id);
  ELSIF p_action='save_conversation' THEN
    IF NOT private.crm_ia_contact(client_id,v_contact_id) OR NOT private.crm_ia_channel(client_id,channel_id,true) THEN RAISE EXCEPTION 'Sem acesso a este contato e canal.' USING ERRCODE='42501'; END IF;
    IF NOT public.cliente_atend_loja_habilitada(client_id) THEN RAISE EXCEPTION 'Prepare o CRM IA desta conta antes de alterar o atendimento.'; END IF;
    IF coalesce(p_payload->>'attendance','') NOT IN ('ai','human','resolved') THEN RAISE EXCEPTION 'Situação de atendimento inválida.'; END IF;
    SELECT to_jsonb(c) INTO old FROM public.cliente_atend_conversas c WHERE c.cliente_id=client_id AND c.contact_id=v_contact_id FOR UPDATE;
    IF old IS NOT NULL THEN PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',(old->>'updated_at')::timestamptz); END IF;
    IF p_payload->>'attendance'='ai' AND coalesce((config_data->'attendance'->>'auto_send')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Ative a autonomia geral e configure um agente antes de devolver à IA.'; END IF;
    INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,updated_by)
      VALUES(client_id,v_contact_id,CASE WHEN p_payload->>'attendance'='resolved' THEN 'finalizado' ELSE 'entrada' END,p_payload->>'attendance'<>'ai',v_owner_id,auth.uid())
      ON CONFLICT(cliente_id,contact_id) DO UPDATE SET status=excluded.status,ia_pausada=excluded.ia_pausada,
        assigned_to=CASE WHEN p_payload ? 'assigned_to' THEN excluded.assigned_to ELSE cliente_atend_conversas.assigned_to END,
        status_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=auth.uid(),
        finalizado_at=CASE WHEN excluded.status='finalizado' THEN clock_timestamp() END,
        finalizado_by=CASE WHEN excluded.status='finalizado' THEN auth.uid() END
      RETURNING to_jsonb(cliente_atend_conversas) INTO result;
    RETURN result;
  ELSIF p_action='save_appointment' THEN
    IF nullif(p_payload->>'lead_id','') IS NOT NULL AND NOT private.crm_ia_lead((p_payload->>'lead_id')::uuid,client_id) THEN RAISE EXCEPTION 'Lead indisponível.'; END IF;
    IF v_contact_id IS NOT NULL AND NOT private.crm_ia_contact(client_id,v_contact_id) THEN RAISE EXCEPTION 'Contato indisponível.'; END IF;
    RETURN private.crm_ia_book(client_id,p_payload,auth.uid());
  ELSIF p_action='cancel_appointment' THEN
    SELECT to_jsonb(a) INTO old FROM public.crm_ia_appointments a WHERE a.id=item_id AND a.cliente_id=client_id FOR UPDATE;
    IF old IS NULL OR (nullif(old->>'lead_id','') IS NOT NULL AND NOT private.crm_ia_lead((old->>'lead_id')::uuid,client_id))
      OR (nullif(old->>'contact_id','') IS NOT NULL AND NOT private.crm_ia_contact(client_id,(old->>'contact_id')::uuid)) THEN RAISE EXCEPTION 'Compromisso indisponível.'; END IF;
    PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',(old->>'updated_at')::timestamptz);
    UPDATE public.crm_ia_appointments SET status='cancelled',updated_at=clock_timestamp() WHERE id=item_id;
    IF nullif(old->>'lead_id','') IS NOT NULL THEN UPDATE public.leads SET agendamento=NULL,proxima_acao=NULL,updated_at=clock_timestamp()
      WHERE id=(old->>'lead_id')::uuid AND agendamento=(old->>'start_at')::timestamptz; END IF;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='save_template' THEN
    IF length(btrim(coalesce(p_payload->>'nome',''))) NOT BETWEEN 1 AND 100 OR length(coalesce(p_payload->>'nicho',''))>100
      OR coalesce(jsonb_typeof(p_payload->'data'),'')<>'object' OR octet_length((p_payload->'data')::text)>100000 THEN RAISE EXCEPTION 'Modelo inválido.'; END IF;
    item:=private.crm_ia_template(p_payload->>'tipo',p_payload->'data');
    IF item_id IS NOT NULL THEN
      SELECT to_jsonb(t) INTO old FROM public.crm_ia_templates t WHERE t.id=item_id AND t.owner_id=auth.uid() FOR UPDATE;
      IF old IS NULL THEN RAISE EXCEPTION 'Modelo indisponível.'; END IF;
      IF (p_payload->>'revision')::uuid IS DISTINCT FROM (old->>'revision')::uuid THEN RAISE EXCEPTION 'O modelo foi alterado. Atualize a versão.'; END IF;
      UPDATE public.crm_ia_templates SET nome=btrim(p_payload->>'nome'),nicho=coalesce(p_payload->>'nicho',''),data=item,revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE id=item_id RETURNING to_jsonb(crm_ia_templates) INTO result;
    ELSE
      INSERT INTO public.crm_ia_templates(owner_id,nome,nicho,tipo,data) VALUES(auth.uid(),btrim(p_payload->>'nome'),coalesce(p_payload->>'nicho',''),p_payload->>'tipo',item) RETURNING to_jsonb(crm_ia_templates) INTO result;
    END IF;
    RETURN result;
  ELSIF p_action='apply_template' THEN
    SELECT to_jsonb(t) INTO old FROM public.crm_ia_templates t WHERE t.id=item_id AND t.owner_id=auth.uid() FOR SHARE;
    IF old IS NULL OR (p_payload->>'revision')::uuid IS DISTINCT FROM (old->>'revision')::uuid THEN RAISE EXCEPTION 'Modelo indisponível ou alterado.'; END IF;
    target_client:=coalesce(nullif(p_payload->>'target_client_id','')::uuid,client_id);
    IF NOT private.crm_ia_client(target_client) THEN RAISE EXCEPTION 'Sem acesso à conta de destino.'; END IF;
    item:=private.crm_ia_template(old->>'tipo',old->'data');
    IF old->>'tipo'='base' THEN
      PERFORM public.crm_ia_workspace('save_base',target_client,item);
    ELSIF old->>'tipo'='agent' THEN
      PERFORM public.crm_ia_workspace('save_agent',target_client,item);
    ELSE
      result:=public.crm_ia_workspace('save_pipeline',target_client,jsonb_build_object('nome',coalesce(item->>'nome',old->>'nome')));
      source_id:=(result->>'id')::uuid;
      FOR item IN SELECT value FROM jsonb_array_elements(item->'stages') LOOP
        PERFORM public.crm_ia_workspace('save_stage',target_client,item||jsonb_build_object('pipeline_id',source_id));
      END LOOP;
    END IF;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='provision' THEN
    IF role<>'superadmin' THEN RAISE EXCEPTION 'Somente o Super Admin habilita o módulo por cliente.' USING ERRCODE='42501'; END IF;
    INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES(client_id,'atendimento_loja',true)
      ON CONFLICT(cliente_id,module_name) DO UPDATE SET is_enabled=true;
    INSERT INTO public.crm_ia_config(cliente_id,data,updated_by) VALUES(client_id,'{"attendance":{"auto_send":false,"pause_on_human":true},"entry":{"enabled":false},"test_mode":{"enabled":false,"phones":[]}}',auth.uid()) ON CONFLICT(cliente_id) DO NOTHING;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='import_leads' THEN
    IF jsonb_typeof(p_payload->'rows')<>'array' OR jsonb_array_length(p_payload->'rows') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Importe de 1 a 1.000 linhas por arquivo.'; END IF;
    v_request_id:=nullif(p_payload->>'request_id','')::uuid;
    IF v_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da importação obrigatório.'; END IF;
    SELECT to_jsonb(i) INTO old FROM public.crm_ia_import_receipts i WHERE i.cliente_id=client_id AND i.created_by=auth.uid() AND i.request_id=v_request_id;
    IF old IS NOT NULL THEN
      IF old->>'payload_hash'<>md5((p_payload->'rows')::text) THEN RAISE EXCEPTION 'Identificador usado em outra importação.'; END IF;
      RETURN old->'result';
    END IF;
    total:=0;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
      IF EXISTS(SELECT 1 FROM public.leads l WHERE l.cliente_id=client_id AND private.crm_ia_phone(l.whatsapp)=private.crm_ia_phone(item->>'whatsapp')) THEN CONTINUE; END IF;
      PERFORM public.crm_ia_workspace('save_lead',client_id,item-'id'-'expected_updated_at'-'auto_responder');
      total:=total+1;
    END LOOP;
    result:=jsonb_build_object('created',total,'preserved',jsonb_array_length(p_payload->'rows')-total,'ok',true);
    INSERT INTO public.crm_ia_import_receipts(cliente_id,created_by,request_id,payload_hash,result) VALUES(client_id,auth.uid(),v_request_id,md5((p_payload->'rows')::text),result);
    RETURN result;
  END IF;
  RAISE EXCEPTION 'Ação do CRM IA indisponível: %.',p_action;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.crm_ia_module(text),private.crm_ia_role(),private.crm_ia_client(uuid),private.crm_ia_lead(uuid,uuid),
  private.crm_ia_channel(uuid,uuid,boolean),private.crm_ia_contact(uuid,uuid),private.crm_ia_phone(text),private.crm_ia_version(text,timestamptz),
  private.crm_ia_move(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.crm_ia_availability(uuid,jsonb),private.crm_ia_slots(uuid,uuid,date,uuid,jsonb),private.crm_ia_book(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.crm_ia_template(text,jsonb) FROM PUBLIC,anon,authenticated;

-- File bytes are transient in the immediate request; the cron never dispatches an unavailable payload.
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_claim(p_now timestamptz DEFAULT clock_timestamp(),p_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  UPDATE public.crm_ia_outbox SET status='uncertain',error_code='lease_expired' WHERE status='sending' AND claimed_at<clock_timestamp()-interval '5 minutes';
  UPDATE public.crm_ia_outbox SET status='failed',error_code='file_not_dispatched',updated_at=clock_timestamp()
    WHERE status='pending' AND media_descriptor<>'{}'::jsonb AND created_at<clock_timestamp()-interval '5 minutes';
  WITH picked AS(SELECT id FROM public.crm_ia_outbox WHERE status='pending' AND attempts=0 AND scheduled_at<=p_now
    AND (p_ids IS NOT NULL OR media_descriptor='{}'::jsonb) AND (p_ids IS NULL OR id=ANY(p_ids)) ORDER BY scheduled_at,id LIMIT 25 FOR UPDATE SKIP LOCKED),
  claimed AS(UPDATE public.crm_ia_outbox o SET status='sending',claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),attempts=attempts+1
    FROM picked p WHERE o.id=p.id RETURNING o.*)
  SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]') INTO result FROM claimed;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_claim(timestamptz,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_claim(timestamptz,uuid[]) TO service_role;

-- A scheduled action rechecks the initiating person's present permissions, without impersonating a JWT.
CREATE FUNCTION public.crm_ia_delivery_actor_check(p_id uuid,p_kind text DEFAULT 'outbox') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; client_key uuid; channel_key uuid; contact_key uuid; human boolean:=true; actor_role text;
BEGIN
  IF p_kind='outbox' THEN
    SELECT o.created_by,o.cliente_id,o.whatsapp_config_id,o.contact_id,o.kind='manual' INTO actor,client_key,channel_key,contact_key,human
      FROM public.crm_ia_outbox o WHERE o.id=p_id AND o.status='sending';
  ELSIF p_kind='reminder' THEN
    SELECT o.created_by,o.cliente_id,o.whatsapp_config_id INTO actor,client_key,channel_key
      FROM public.atendimento_conversa_planejamento o WHERE o.id=p_id AND o.status='pendente' AND o.delivery_state='sending';
  ELSE RETURN '{"allowed":false}'; END IF;
  SELECT p.role::text INTO actor_role FROM public.profiles p WHERE p.id=actor AND p.status='active';
  IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('superadmin','admin','colaborador')
    OR NOT (coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=actor AND m.module_name::text='atendimento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='atendimento'),true)
      OR coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=actor AND m.module_name::text='rastreamento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='rastreamento'),true))
    OR NOT public.atendimento_user_can_send_on_whatsapp_config(actor,client_key,channel_key)
    OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.id=channel_key AND c.cliente_id=client_key AND c.archived_at IS NULL AND c.provider='uazapi')
    OR EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=client_key AND s.contact_id=contact_key AND s.privado AND s.assigned_to IS DISTINCT FROM actor AND actor_role<>'superadmin') THEN RETURN '{"allowed":false}'; END IF;
  IF p_kind='outbox' THEN
    IF NOT coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=actor AND m.module_name::text='crm'),
      (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='crm'),true) THEN RETURN '{"allowed":false}'; END IF;
    IF actor_role='colaborador' AND (
      EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=actor AND a.module_name::text='clients' AND a.access_level::text='responsible')
        AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client_key AND c.responsavel::text=actor::text)
      OR EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=actor AND a.module_name::text='crm' AND a.access_level::text='responsible')
        AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=client_key AND s.contact_id=contact_key AND s.assigned_to=actor)
    ) THEN RETURN '{"allowed":false}'; END IF;
  END IF;
  RETURN jsonb_build_object('allowed',true,'actor_id',actor,'human',human);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_actor_check(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_actor_check(uuid,text) TO service_role;

-- A provider call consumes its lease once, including retries of the HTTP request itself.
CREATE TABLE public.crm_ia_transport_claims (
  kind text NOT NULL CHECK(kind IN ('outbox','reminder','followup')),
  source_id uuid NOT NULL, claim_token uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(kind,source_id,claim_token)
);
ALTER TABLE public.crm_ia_transport_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_ia_transport_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.crm_ia_transport_claims TO service_role;
CREATE FUNCTION public.crm_ia_delivery_start(p_kind text,p_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target jsonb;
BEGIN
  IF p_kind='outbox' THEN target:=public.crm_ia_delivery_recheck(p_id,p_claim_token);
  ELSIF p_kind IN ('reminder','followup') THEN target:=public.crm_ia_legacy_delivery_recheck(p_kind,p_id,p_claim_token);
  ELSE RETURN false; END IF;
  IF target->>'allowed' IS DISTINCT FROM 'true' OR
    (p_kind<>'followup' AND public.crm_ia_delivery_actor_check(p_id,p_kind)->>'allowed' IS DISTINCT FROM 'true') THEN RETURN false; END IF;
  INSERT INTO public.crm_ia_transport_claims(kind,source_id,claim_token) VALUES(p_kind,p_id,p_claim_token) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_start(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_start(text,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
