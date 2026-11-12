-- Projeções seguras e eventos factuais; não reconstrói trocas anteriores à instalação.
BEGIN;

CREATE FUNCTION planeje_private.gestor_ia_routine_tracking(p_contact public.cliente_whatsapp_contact)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE tracking jsonb:=coalesce(p_contact.tracking_data,'{}'); snapshot jsonb; result jsonb; safe_snapshot jsonb:='{}';
  key text; value text; values_for_key text[]; ids text[]; configured boolean:=false; conflict boolean:=false;
  phone text:=regexp_replace(split_part(coalesce(nullif(p_contact.phone,''),p_contact.from_jid),'@',1),'[^0-9]','','g');
BEGIN
  FOR key,values_for_key IN SELECT * FROM (VALUES
    ('account_id',ARRAY[tracking#>>'{meta_ad_details,ad,account_id}',tracking#>>'{meta_ad_details,ad,campaign,account_id}',tracking->>'account_id']),
    ('campaign_id',ARRAY[tracking#>>'{meta_ad_details,ad,campaign,id}',tracking#>>'{meta_ad_details,ad,campaign_id}',tracking#>>'{meta_ad_details,campaign_id}',tracking->>'campaign_id',tracking->>'campaignId']),
    ('adset_id',ARRAY[tracking#>>'{meta_ad_details,ad,adset,id}',tracking#>>'{meta_ad_details,ad,adset_id}',tracking->>'adset_id']),
    ('ad_id',ARRAY[tracking#>>'{meta_ad_details,ad,id}',tracking->>'ad_id',tracking->>'adId',tracking->>'source_id',tracking->>'sourceID'])
  ) targeting(name,values) LOOP
    SELECT array_agg(DISTINCT CASE WHEN key='account_id' THEN regexp_replace(btrim(item),'^act_','','i') ELSE btrim(item) END)
      INTO ids FROM unnest(values_for_key) item WHERE nullif(btrim(item),'') IS NOT NULL;
    conflict:=conflict OR coalesce(cardinality(ids)>1,false);
    SELECT btrim(item) INTO value FROM unnest(values_for_key) item WHERE nullif(btrim(item),'') IS NOT NULL LIMIT 1;
    IF value ~ '^[a-zA-Z0-9_-]{1,128}$' AND regexp_replace(value,'[^0-9]','','g') IS DISTINCT FROM phone THEN
      result:=coalesce(result,'{}')||jsonb_build_object(key,value);
    END IF;
  END LOOP;
  FOR key,value IN SELECT * FROM (VALUES
    ('campaign_name',coalesce(CASE WHEN jsonb_typeof(tracking#>'{meta_ad_details,ad,campaign,name}')='string' THEN nullif(btrim(tracking#>>'{meta_ad_details,ad,campaign,name}'),'') END,
      CASE WHEN jsonb_typeof(tracking->'campaign_name')='string' THEN tracking->>'campaign_name' END)),
    ('adset_name',coalesce(CASE WHEN jsonb_typeof(tracking#>'{meta_ad_details,ad,adset,name}')='string' THEN nullif(btrim(tracking#>>'{meta_ad_details,ad,adset,name}'),'') END,
      CASE WHEN jsonb_typeof(tracking->'adset_name')='string' THEN tracking->>'adset_name' END)),
    ('ad_name',coalesce(CASE WHEN jsonb_typeof(tracking#>'{meta_ad_details,ad,name}')='string' THEN nullif(btrim(tracking#>>'{meta_ad_details,ad,name}'),'') END,
      CASE WHEN jsonb_typeof(tracking->'ad_name')='string' THEN tracking->>'ad_name' END))
  ) names(name,value) LOOP
    IF nullif(btrim(value),'') IS NOT NULL THEN result:=coalesce(result,'{}')||jsonb_build_object(key,planeje_private.gestor_ia_routine_mask_text(value)); END IF;
  END LOOP;
  IF coalesce(nullif(btrim(tracking->>'planeje_link_id'),''),nullif(btrim(tracking->>'planeje_match_code'),'')) IS NOT NULL
    AND tracking->>'planeje_link_origin' IN ('site','meta_ads','google_ads') THEN
    result:=coalesce(result,'{}')||jsonb_build_object('planeje_link_origin',tracking->>'planeje_link_origin');
  END IF;
  snapshot:=tracking->'planeje_link_attribution';
  IF jsonb_typeof(snapshot)='object' AND snapshot->>'platform' IN ('meta','google','site') THEN
    FOR key,value IN SELECT name,snapshot->>name FROM unnest(ARRAY['campaign_id','campaign_name','adset_id','adset_name']) name
      WHERE jsonb_typeof(snapshot->name)='string'
    LOOP
      IF key IN ('campaign_id','adset_id') THEN
        IF value ~ '^[a-zA-Z0-9_-]{1,128}$' AND regexp_replace(value,'[^0-9]','','g') IS DISTINCT FROM phone THEN
          safe_snapshot:=safe_snapshot||jsonb_build_object(key,value);
        END IF;
      ELSIF nullif(btrim(value),'') IS NOT NULL THEN
        safe_snapshot:=safe_snapshot||jsonb_build_object(key,planeje_private.gestor_ia_routine_mask_text(value));
      END IF;
    END LOOP;
    configured:=safe_snapshot<>'{}';
    result:=coalesce(result,'{}')||jsonb_build_object('planeje_link_attribution',safe_snapshot||jsonb_build_object('platform',snapshot->>'platform'));
  END IF;
  RETURN coalesce(result,'{}')||jsonb_build_object('link_configured',configured,'attribution_conflict',NOT configured AND conflict);
END $$;

CREATE FUNCTION planeje_private.gestor_ia_routine_origin_catalog(p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY item->>'account_id',item->>'campaign_id',item->>'adset_id',item->>'ad_id'),'[]')
  FROM (
    SELECT DISTINCT jsonb_strip_nulls(jsonb_build_object(
      'account_id',cache.conta_id,'campaign_id',day->>'campaign_id','adset_id',day->>'adset_id',
      'campaign_name',planeje_private.gestor_ia_routine_mask_text(CASE WHEN jsonb_typeof(day->'campaign_name')='string' THEN day->>'campaign_name' END),
      'adset_name',planeje_private.gestor_ia_routine_mask_text(CASE WHEN jsonb_typeof(day->'adset_name')='string' THEN day->>'adset_name' END),
      'ad_id',CASE WHEN day->>'ad_id' ~ '^[a-zA-Z0-9_-]{1,128}$' THEN day->>'ad_id' END,
      'ad_name',planeje_private.gestor_ia_routine_mask_text(CASE WHEN jsonb_typeof(day->'ad_name')='string' THEN day->>'ad_name' END),
      'campaign_status',planeje_private.gestor_ia_routine_mask_text(coalesce(
        CASE WHEN jsonb_typeof(cache.dados#>ARRAY['campaignMeta',day->>'campaign_id','status'])='string' THEN cache.dados#>>ARRAY['campaignMeta',day->>'campaign_id','status'] END,
        CASE WHEN jsonb_typeof(cache.dados#>ARRAY['campaignMeta',day->>'campaign_id','effective_status'])='string' THEN cache.dados#>>ARRAY['campaignMeta',day->>'campaign_id','effective_status'] END,
        CASE WHEN jsonb_typeof(cache.dados#>ARRAY['campaignMeta',day->>'campaign_id','configured_status'])='string' THEN cache.dados#>>ARRAY['campaignMeta',day->>'campaign_id','configured_status'] END))
    )) AS item
    FROM public.gestor_ia_meta_cache cache
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(cache.dados->'adDays')='array' THEN cache.dados->'adDays' ELSE '[]' END) day
    WHERE cache.cliente_id=p_client AND cache.janela='historico'
      AND EXISTS(SELECT 1 FROM public.cliente_meta_accounts account WHERE account.cliente_id=p_client AND account.is_active
        AND cache.conta_id='act_'||regexp_replace(account.meta_account_id::text,'^act_','','i'))
      AND day->>'campaign_id' ~ '^[a-zA-Z0-9_-]{1,128}$' AND day->>'adset_id' ~ '^[a-zA-Z0-9_-]{1,128}$'
  ) catalog
$$;

ALTER TABLE public.cliente_rastreamento_links
  ADD COLUMN campaign_id text,
  ADD COLUMN campaign_name text,
  ADD COLUMN adset_id text,
  ADD COLUMN adset_name text,
  ADD CONSTRAINT rastreamento_link_campaign_id_format CHECK(campaign_id IS NULL OR campaign_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  ADD CONSTRAINT rastreamento_link_adset_id_format CHECK(adset_id IS NULL OR adset_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  ADD CONSTRAINT rastreamento_link_campaign_name_length CHECK(campaign_name IS NULL OR length(campaign_name)<=1000),
  ADD CONSTRAINT rastreamento_link_adset_name_length CHECK(adset_name IS NULL OR length(adset_name)<=1000);
ALTER TABLE public.cliente_rastreamento_link_clicks ADD COLUMN link_attribution jsonb
  CHECK(link_attribution IS NULL OR (jsonb_typeof(link_attribution)='object' AND octet_length(link_attribution::text)<=10000));

-- O corpo PL/pgSQL do leitor referencia o ledger criado abaixo, na mesma transação.
CREATE FUNCTION public.gestor_ia_routine_leads_data(p_client uuid,p_week date,p_actor uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original_claims text:=current_setting('request.jwt.claims',true); original_sub text:=current_setting('request.jwt.claim.sub',true);
  result jsonb; week_since timestamptz; week_until timestamptz;
BEGIN
  IF p_actor IS NOT NULL THEN
    IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND session_user<>'service_role' THEN
      RAISE insufficient_privilege USING MESSAGE='Somente o serviço pode indicar o ator.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
    PERFORM set_config('request.jwt.claims',(coalesce(nullif(original_claims,''),'{}')::jsonb||jsonb_build_object('sub',p_actor))::text,true);
  ELSIF current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN
    RAISE insufficient_privilege USING MESSAGE='Informe o ator do serviço ou entre com uma conta da equipe.';
  END IF;
  IF NOT planeje_private.gestor_ia_routine_access(p_client,true) OR p_client IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE='Sem acesso aos leads deste cliente.';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('entrada','agendados_na_semana') OR p_week IS NULL OR extract(isodow FROM p_week)<>1
    OR p_week>public.central_trafego_operational_date() THEN
    RAISE EXCEPTION 'Escolha um modo e uma semana iniciada, de segunda a domingo.' USING ERRCODE='22023';
  END IF;
  week_since:=p_week::timestamp AT TIME ZONE 'America/Sao_Paulo';
  week_until:=(p_week+7)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  WITH appointment_events AS MATERIALIZED (
    SELECT h.contact_id,h.message_at AS at,'automatico'::text AS source,h.appointment_day
    FROM public.mini_crm_message_history h WHERE h.cliente_id=p_client AND h.reason='appointment' AND h.message_at>=week_since AND h.message_at<week_until
    UNION ALL
    SELECT h.contact_id,h.at,'manual',h.appointment_day FROM public.mini_crm_status_history h
    WHERE h.cliente_id=p_client AND h.reason='manual' AND h.actor_type='pessoa' AND h.is_appointment AND h.at>=week_since AND h.at<week_until
  ), contacts AS MATERIALIZED (
    SELECT c.* FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client
      AND ((p_mode='entrada' AND c.first_seen_at>=week_since AND c.first_seen_at<week_until)
        OR (p_mode='agendados_na_semana' AND EXISTS(SELECT 1 FROM appointment_events e WHERE e.contact_id=c.id)))
      AND c.from_jid NOT LIKE '%@g.us'
      AND public.atendimento_user_can_access_atendimento_scope(p_client,NULL,c.whatsapp_config_id)
      AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=c.id
        AND s.privado AND s.assigned_to IS DISTINCT FROM auth.uid()
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='superadmin'))
  ), evidence AS (
    SELECT c.id AS contact_id,i.id,'lead'::text AS direction,planeje_private.gestor_ia_routine_signal_text(i.body) AS text,coalesce(i.msg_timestamp,i.created_at) AS at
    FROM contacts c JOIN public.cliente_whatsapp_config cfg ON cfg.id=c.whatsapp_config_id AND cfg.cliente_id=p_client
    JOIN public.cliente_whatsapp_inbox i ON i.cliente_id=p_client AND i.whatsapp_config_id=cfg.id
      AND (i.chat_jid=c.from_jid OR (nullif(i.chat_jid,'') IS NULL AND i.from_jid=c.from_jid))
    WHERE p_mode='entrada' AND NOT coalesce(i.is_group,false) AND i.from_jid NOT LIKE '%@g.us'
      AND coalesce(i.msg_timestamp,i.created_at)>=c.first_seen_at AND nullif(btrim(i.body),'') IS NOT NULL
    UNION ALL
    SELECT c.id,s.id,'equipe',planeje_private.gestor_ia_routine_signal_text(s.body),s.created_at
    FROM contacts c JOIN public.cliente_whatsapp_config cfg ON cfg.id=c.whatsapp_config_id AND cfg.cliente_id=p_client
    JOIN public.cliente_whatsapp_sent s ON s.cliente_id=p_client AND s.whatsapp_config_id=cfg.id
      AND (s.chat_jid=c.from_jid OR (nullif(s.chat_jid,'') IS NULL AND s.to_jid=c.from_jid))
    WHERE p_mode='entrada' AND s.to_jid NOT LIKE '%@g.us' AND s.created_at>=c.first_seen_at AND nullif(btrim(s.body),'') IS NOT NULL
  )
  SELECT jsonb_build_object(
    'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'cliente_id',c.cliente_id,'phone',planeje_private.gestor_ia_routine_phone(coalesce(nullif(c.phone,''),c.from_jid)),
      'sender_name',planeje_private.gestor_ia_routine_mask_text(c.sender_name),'first_seen_at',c.first_seen_at,'last_message_at',c.last_message_at,
      'origin_source',planeje_private.gestor_ia_routine_origin(c),'tracking_data',planeje_private.gestor_ia_routine_tracking(c),
      'mini_crm',planeje_private.gestor_ia_routine_mini(c.mini_crm,(SELECT m.columns FROM public.mini_crm_config m WHERE m.cliente_id=p_client)),
      'qualificado',c.qualificado,'comprou',c.comprou
    ) ORDER BY c.first_seen_at,c.id) FROM contacts c),'[]'),
    'config',(SELECT jsonb_build_object('statuses',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key',planeje_private.gestor_ia_routine_mask_text(CASE WHEN jsonb_typeof(s)='string' THEN s#>>'{}' ELSE coalesce(s->>'key',s->>'label') END),
      'label',planeje_private.gestor_ia_routine_mask_text(CASE WHEN jsonb_typeof(s)='string' THEN s#>>'{}' ELSE s->>'label' END)
      ) ORDER BY ord) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.statuses)='array' THEN m.statuses ELSE '[]' END) WITH ORDINALITY statuses(s,ord)
      WHERE jsonb_typeof(s)='string' OR (jsonb_typeof(s->'label')='string' AND coalesce(jsonb_typeof(s->'key'),'null') IN ('null','string'))),'[]'),
      'columns',coalesce((SELECT jsonb_agg(jsonb_build_object('key',planeje_private.gestor_ia_routine_mask_text(column_data->>'key'),
        'label',planeje_private.gestor_ia_routine_mask_text(column_data->>'label'),'kind',column_data->>'kind') ORDER BY ord)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.columns)='array' THEN m.columns ELSE '[]' END) WITH ORDINALITY cols(column_data,ord)
        WHERE column_data->>'kind' IN ('day','date') AND jsonb_typeof(column_data->'key')='string' AND jsonb_typeof(column_data->'label')='string' AND column_data->>'key'<>'data_venda'
          AND lower(coalesce(column_data->>'label','')||' '||(column_data->>'key')) ~ 'agend|visita'),'[]')) FROM public.mini_crm_config m WHERE m.cliente_id=p_client),
    'niche',coalesce((SELECT planeje_private.gestor_ia_routine_mask_text(c.nicho) FROM public.clientes c WHERE c.id=p_client),''),
    'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('contact_id',e.contact_id,'text',e.text,'direction',e.direction,'at',e.at,'id',e.id) ORDER BY e.at,e.id) FROM evidence e),'[]'),
    'appointment_events',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('contact_id',e.contact_id,'at',e.at,'source',e.source,'appointment_day',e.appointment_day)) ORDER BY e.at,e.contact_id,e.source)
      FROM appointment_events e JOIN contacts c ON c.id=e.contact_id),'[]'),
    'origin_catalog',planeje_private.gestor_ia_routine_origin_catalog(p_client)
  ) INTO result;
  PERFORM set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.gestor_ia_routine_leads_data(p_client uuid,p_week date,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN public.gestor_ia_routine_leads_data(p_client,p_week,p_actor,'entrada');
END $$;

CREATE TABLE public.mini_crm_status_history(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.cliente_whatsapp_contact(id) ON DELETE CASCADE,
  previous_status text,status text,reason text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('pessoa','automacao')),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_appointment boolean NOT NULL DEFAULT false,appointment_day date,
  CHECK(previous_status IS DISTINCT FROM status)
);
CREATE INDEX mini_crm_status_history_week ON public.mini_crm_status_history(cliente_id,at,contact_id);
CREATE INDEX mini_crm_status_history_contact ON public.mini_crm_status_history(contact_id,at);
CREATE INDEX mini_crm_status_history_actor ON public.mini_crm_status_history(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX mini_crm_message_history_appointment_week ON public.mini_crm_message_history(cliente_id,message_at,contact_id) WHERE reason='appointment';
ALTER TABLE public.mini_crm_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY mini_crm_status_history_read ON public.mini_crm_status_history FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c WHERE c.id=mini_crm_status_history.contact_id AND c.cliente_id=mini_crm_status_history.cliente_id)
);
REVOKE ALL ON public.mini_crm_status_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.mini_crm_status_history TO authenticated,service_role;

CREATE FUNCTION planeje_private.mini_crm_capture_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_role text:=nullif(current_setting('role',true),'none');
  service boolean:=actual_role='service_role' OR (actual_role IS NULL AND session_user='service_role');
  context jsonb; reason text; actor_type text; actor uuid:=auth.uid(); label text; scheduled boolean:=false;
  appointment_day date; date_value text; columns jsonb;
BEGIN
  IF (OLD.mini_crm->>'status') IS NOT DISTINCT FROM (NEW.mini_crm->>'status') THEN RETURN NEW; END IF;
  actor_type:=CASE WHEN actual_role='authenticated' AND actor IS NOT NULL THEN 'pessoa' ELSE 'automacao' END;
  reason:=CASE WHEN actor_type='pessoa' THEN 'manual' ELSE 'system' END;
  IF service AND current_setting('planeje.mini_message_auto',true)='on' THEN
    BEGIN context:=nullif(current_setting('planeje.mini_status_context',true),'')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN context:=NULL; END;
    IF context->>'contact_id'=NEW.id::text AND jsonb_typeof(context->'reason')='string' THEN reason:=context->>'reason'; END IF;
  END IF;
  SELECT m.columns,coalesce((SELECT CASE WHEN jsonb_typeof(s)='string' THEN s#>>'{}' ELSE s->>'label' END
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.statuses)='array' THEN m.statuses ELSE '[]' END) s
    WHERE (CASE WHEN jsonb_typeof(s)='string' THEN s#>>'{}' ELSE coalesce(s->>'key',s->>'label') END)=NEW.mini_crm->>'status' LIMIT 1),NEW.mini_crm->>'status')
    INTO columns,label FROM public.mini_crm_config m WHERE m.cliente_id=NEW.cliente_id;
  label:=translate(lower(normalize(coalesce(label,NEW.mini_crm->>'status',''),NFC)),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc');
  scheduled:=reason='appointment' OR (coalesce(NEW.mini_crm->>'status','')<>'Follow Up'
    AND label ~ '\m(re)?agendad[oa]s?\M' AND label !~ '\m(nao|sem|desmarc\w*|cancel\w*)\M');
  IF scheduled THEN
    FOR date_value IN SELECT value FROM jsonb_each_text(planeje_private.gestor_ia_routine_mini(NEW.mini_crm,columns))
      WHERE key NOT IN ('status','contato_nome') AND key NOT LIKE '%\_hora' ESCAPE '\'
    LOOP
      BEGIN
        IF date_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN appointment_day:=date_value::date;
        ELSIF date_value ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN
          appointment_day:=make_date(split_part(date_value,'/',3)::integer,split_part(date_value,'/',2)::integer,split_part(date_value,'/',1)::integer);
        END IF;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN appointment_day:=NULL; END;
      EXIT WHEN appointment_day IS NOT NULL;
    END LOOP;
  END IF;
  INSERT INTO public.mini_crm_status_history(cliente_id,contact_id,previous_status,status,reason,actor_id,actor_type,is_appointment,appointment_day)
    VALUES(NEW.cliente_id,NEW.id,OLD.mini_crm->>'status',NEW.mini_crm->>'status',reason,actor,actor_type,scheduled,appointment_day);
  RETURN NEW;
END $$;
CREATE TRIGGER mini_crm_status_capture AFTER UPDATE OF mini_crm ON public.cliente_whatsapp_contact
  FOR EACH ROW EXECUTE FUNCTION planeje_private.mini_crm_capture_status();

-- Canonical replacements below retain their existing OIDs, attributes and grants.
CREATE OR REPLACE FUNCTION public.gestor_ia_routine_mcp(p_actor uuid,p_action text,p_client uuid DEFAULT NULL,p_week date DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original_claims text:=current_setting('request.jwt.claims',true); original_sub text:=current_setting('request.jwt.claim.sub',true);
  week date:=coalesce(p_week,date_trunc('week',public.central_trafego_operational_date()::timestamp)::date);
  result jsonb; review public.traffic_weekly_reviews; before_row jsonb; task uuid; review_id uuid; rows jsonb; payload jsonb; created boolean:=false;
BEGIN
  IF (current_setting('role',true) IS DISTINCT FROM 'service_role' AND session_user<>'service_role') OR p_actor IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE='A rotina MCP exige serviço com ator identificado.';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('panel','read','save','suggest','leads') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR extract(isodow FROM week)<>1 OR week>public.central_trafego_operational_date() THEN
    RAISE EXCEPTION 'Confira a ação, a semana e os dados da rotina.' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  PERFORM set_config('request.jwt.claims',(coalesce(nullif(original_claims,''),'{}')::jsonb||jsonb_build_object('sub',p_actor))::text,true);
  IF NOT planeje_private.gestor_ia_routine_access(p_client) OR (p_action<>'panel' AND p_client IS NULL) THEN
    RAISE insufficient_privilege USING MESSAGE='Sem acesso à rotina deste cliente.';
  END IF;
  IF p_action IN ('save','suggest') AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p_client AND c.etapa='closed') THEN
    RAISE EXCEPTION 'Cliente não está ativo para preenchimento da rotina.' USING ERRCODE='22023';
  END IF;
  IF p_action='panel' THEN
    SELECT jsonb_build_object('semana',week,'clientes',coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id',c.id,'empresa',c.empresa,'status',CASE WHEN r.id IS NULL OR (r.revision=0 AND r.finalized_at IS NULL
        AND r.analysis='' AND r.ai_suggestion='' AND r.campaign_metrics='[]'::jsonb AND r.investment IS NULL AND r.contacts IS NULL AND r.results IS NULL)
        THEN 'a_preencher' ELSE r.validation_state END,
      'fill_origin',r.fill_origin,'revision',r.revision,'investment',r.investment,
      'appointments',(SELECT sum((m->>'appointments')::numeric) FROM jsonb_array_elements(coalesce(r.campaign_metrics,'[]')) m),
      'review_id',r.id) ORDER BY c.empresa,c.id),'[]')) INTO result
    FROM public.clientes c LEFT JOIN public.traffic_weekly_reviews r ON r.client_id=c.id AND r.week_start=week AND r.kind='review'
    WHERE (p_client IS NULL OR c.id=p_client) AND (c.etapa='closed' OR r.id IS NOT NULL) AND planeje_private.gestor_ia_routine_access(c.id);
  ELSIF p_action='leads' THEN
    result:=public.gestor_ia_routine_leads_data(p_client,week,p_actor,coalesce(p_payload->>'modo','entrada'));
  ELSE
    IF p_action IN ('save','suggest') THEN
      IF (p_action='save' AND EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) key WHERE key NOT IN ('linhas','analise','revision')))
        OR (p_action='suggest' AND EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) key WHERE key NOT IN ('texto','revision'))) THEN
        RAISE EXCEPTION 'Dados não permitidos no rascunho IA.' USING ERRCODE='22023';
      END IF;
      IF p_payload ? 'revision' AND (jsonb_typeof(p_payload->'revision')<>'number' OR (p_payload->>'revision') !~ '^[0-9]{1,9}$') THEN
        RAISE EXCEPTION 'Informe a versão inteira da revisão.' USING ERRCODE='22023';
      END IF;
      IF p_action='save' AND (jsonb_typeof(p_payload->'linhas') IS DISTINCT FROM 'array'
        OR (p_payload ? 'analise' AND jsonb_typeof(p_payload->'analise') IS DISTINCT FROM 'string')) THEN
        RAISE EXCEPTION 'Confira as linhas e a análise da revisão.' USING ERRCODE='22023';
      END IF;
      IF p_action='suggest' AND (jsonb_typeof(p_payload->'texto') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'texto')) NOT BETWEEN 1 AND 10000) THEN
        RAISE EXCEPTION 'A sugestão precisa ter de 1 a 10000 caracteres.' USING ERRCODE='22023';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly:'||p_client::text||':'||week::text||':review',0));
    END IF;
    SELECT r.id,r.task_id INTO review_id,task FROM public.traffic_weekly_reviews r WHERE r.client_id=p_client AND r.week_start=week AND r.kind='review';
    IF p_action IN ('save','suggest') THEN
      IF review_id IS NULL THEN
        IF p_payload ? 'revision' AND (p_payload->>'revision')::integer<>0 THEN
          RAISE EXCEPTION 'A versão da revisão mudou. Leia a semana novamente.' USING ERRCODE='40001';
        END IF;
        review_id:=public.start_traffic_week_record(p_client,week,'review');
        SELECT r.task_id INTO task FROM public.traffic_weekly_reviews r WHERE r.id=review_id;
        created:=true;
      END IF;
      -- Mesmo ordenamento do save canônico: tarefa antes da revisão.
      PERFORM 1 FROM public.tarefas t WHERE t.id=task FOR UPDATE;
      SELECT * INTO review FROM public.traffic_weekly_reviews r WHERE r.id=review_id FOR UPDATE;
      IF review.finalized_at IS NOT NULL THEN
        RAISE EXCEPTION 'Semana validada. A equipe precisa reabrir a revisão.' USING ERRCODE='55000';
      END IF;
      IF (NOT created AND NOT p_payload ? 'revision') OR (p_payload ? 'revision' AND (p_payload->>'revision')::integer IS DISTINCT FROM review.revision) THEN
        RAISE EXCEPTION 'A versão da revisão mudou. Leia a semana novamente.' USING ERRCODE='40001';
      END IF;
      IF NOT planeje_private.traffic_weekly_can_edit(review.task_id) THEN
        RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode preencher esta semana.';
      END IF;
      IF p_action='save' THEN
        SELECT coalesce(jsonb_agg(CASE WHEN value ? 'id' THEN value ELSE value||jsonb_build_object('id',gen_random_uuid()) END ORDER BY ord),'[]') INTO rows
          FROM jsonb_array_elements(p_payload->'linhas') WITH ORDINALITY AS item(value,ord);
        payload:=to_jsonb(review)||jsonb_build_object('metric_mode','campaign','campaign_metrics',rows);
        IF p_payload ? 'analise' THEN payload:=payload||jsonb_build_object('analysis',p_payload->>'analise'); END IF;
        PERFORM public.save_traffic_weekly_review(review.id,review.revision,payload,false);
      ELSE
        before_row:=to_jsonb(review);
        UPDATE public.traffic_weekly_reviews SET ai_suggestion=btrim(p_payload->>'texto'),revision=revision+1,updated_at=now() WHERE id=review.id RETURNING * INTO review;
        INSERT INTO public.traffic_weekly_history(client_id,review_id,event,actor_id,snapshot)
          VALUES(p_client,review.id,'draft',p_actor,jsonb_build_object('before',before_row,'after',to_jsonb(review)));
      END IF;
    END IF;
    SELECT * INTO review FROM public.traffic_weekly_reviews r WHERE r.id=review_id;
    result:=jsonb_build_object('cliente_id',p_client,'semana',week,'review',CASE WHEN review.id IS NOT NULL THEN to_jsonb(review) ELSE 'null'::jsonb END);
  END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mini_crm_apply_message(p_cliente_id uuid,p_contact_id uuid,p_rules_at timestamptz,p_config_at timestamptz,p_expected jsonb,p_patch jsonb,p_channel text,p_message text,p_at timestamptz,p_reason text,p_day date default null,p_time text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.mini_crm_message_rules%rowtype;c public.cliente_whatsapp_contact%rowtype;cfg public.mini_crm_config%rowtype;m jsonb;k text;v jsonb;
 original_auto text:=current_setting('planeje.mini_message_auto',true);original_context text:=current_setting('planeje.mini_status_context',true);
begin
 select * into r from public.mini_crm_message_rules where cliente_id=p_cliente_id for share;
 if not found or r.settings->>'enabled' is distinct from 'true' or r.updated_at<>p_rules_at then return '{"applied":false,"reason":"rules_changed"}';end if;
 select * into cfg from public.mini_crm_config where cliente_id=p_cliente_id for share;
 if cfg.updated_at is distinct from p_config_at then return '{"applied":false,"reason":"config_changed"}';end if;
 select * into c from public.cliente_whatsapp_contact where id=p_contact_id and cliente_id=p_cliente_id for update;
 if not found then return '{"applied":false,"reason":"contact_missing"}';end if;
 m=coalesce(c.mini_crm,'{}');
 if m<>p_expected then return '{"applied":false,"reason":"contact_changed"}';end if;
 if m#>>'{_planeje_message_status,manual}'='true' or p_at<r.updated_at or p_at>clock_timestamp()+interval '5 minutes' then return '{"applied":false,"reason":"manual_or_old"}';end if;
 if exists(select 1 from public.mini_crm_message_history where contact_id=c.id and channel_id=p_channel and message_id=p_message) then return '{"applied":false,"reason":"duplicate"}';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) t(key) where key<>'status' and key<>'_planeje_message_status' and key<>coalesce(r.settings->>'appointmentField','') and key<>(coalesce(r.settings->>'appointmentField','')||'_hora')) then raise exception 'Campo de automação inválido';end if;
 if p_patch->>'status' in ('Venda Realizada','Lead Qualificado','Follow Up','Repescagem') then raise exception 'Esta etapa exige ação manual';end if;
 for k,v in select * from jsonb_each(p_patch) loop
   if v='null'::jsonb then m=m-k;else m=jsonb_set(m,array[k],v,true);end if;
 end loop;
 perform set_config('planeje.mini_status_context',jsonb_build_object('contact_id',c.id,'reason',p_reason)::text,true);
 perform set_config('planeje.mini_message_auto','on',true);
 update public.cliente_whatsapp_contact set mini_crm=m,updated_at=clock_timestamp() where id=c.id;
 perform set_config('planeje.mini_message_auto',coalesce(original_auto,'off'),true);
 perform set_config('planeje.mini_status_context',coalesce(original_context,''),true);
 insert into public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day,appointment_time)
 values(p_cliente_id,c.id,p_channel,p_message,p_at,c.mini_crm->>'status',p_patch->>'status',p_reason,p_day,p_time);
 return '{"applied":true}';
end $$;

CREATE OR REPLACE FUNCTION planeje_private.gestor_ia_routine_origin(p_contact public.cliente_whatsapp_contact)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE tracking jsonb:=coalesce(p_contact.tracking_data,'{}'); origin text:=p_contact.origin_source; hint text; event_data jsonb;
BEGIN
  IF origin IN ('google_ads','google','manual') THEN RETURN CASE WHEN origin='google' THEN 'google_ads' ELSE origin END; END IF;
  IF origin IN ('meta','facebook_ads') THEN origin:='meta_ads'; END IF;
  IF origin IS NULL OR origin NOT IN ('google_ads','meta_ads','site') THEN origin:=tracking->>'planeje_link_origin'; END IF;
  IF origin='google_ads' THEN RETURN origin; END IF;
  -- O snapshot explícito do Linktree corrige só a apresentação; não regrava a primeira origem.
  IF coalesce(nullif(tracking->>'planeje_link_id',''),nullif(tracking->>'planeje_match_code','')) IS NOT NULL
    AND lower(coalesce(nullif(btrim(p_contact.utm_source),''),nullif(btrim(tracking->>'utm_source'),''),''))='linktree' THEN
    IF nullif(btrim(tracking->>'gclid'),'') IS NOT NULL THEN RETURN 'google_ads'; END IF;
    IF nullif(btrim(tracking->>'ctwaClid'),'') IS NULL AND nullif(btrim(tracking->>'ctwa_clid'),'') IS NULL
      AND tracking->>'planeje_link_origin' IN ('meta_ads','site') THEN RETURN tracking->>'planeje_link_origin'; END IF;
  END IF;
  IF origin IN ('meta_ads','site') THEN RETURN origin; END IF;
  IF tracking->>'source' IN ('google','google_ads') THEN RETURN 'google_ads'; END IF;
  IF tracking->>'source' IN ('meta','meta_ads') OR jsonb_typeof(tracking#>'{meta_ad_details,ad}')='object'
    OR nullif(btrim(tracking->>'source_id'),'') IS NOT NULL OR nullif(btrim(tracking->>'ad_id'),'') IS NOT NULL
    OR nullif(btrim(tracking->>'fbclid'),'') IS NOT NULL OR nullif(btrim(tracking->>'ctwaClid'),'') IS NOT NULL THEN RETURN 'meta_ads'; END IF;
  FOREACH hint IN ARRAY ARRAY[p_contact.utm_source,p_contact.utm_medium,p_contact.utm_campaign,p_contact.utm_content,p_contact.utm_term,
    tracking->>'utm_source',tracking->>'utm_medium',tracking->>'utm_campaign',tracking->>'utm_content',tracking->>'utm_term',tracking->>'campaign_name'] LOOP
    IF lower(hint) LIKE ANY(ARRAY['%facebook%','%meta%','%fb%','%instagram%','%ig%','%anúncio%','%anuncio%']) THEN RETURN 'meta_ads'; END IF;
  END LOOP;
  FOR event_data IN SELECT item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tracking->'events_by_date')='array' THEN tracking->'events_by_date' ELSE '[]' END) item LOOP
    IF coalesce(nullif(event_data->>'source_id',''),nullif(event_data->>'ad_id',''),nullif(event_data->>'fbclid',''),nullif(event_data->>'ctwaClid',''),
      nullif(event_data#>>'{tracking_data,source_id}',''),nullif(event_data#>>'{tracking_data,ad_id}','')) IS NOT NULL THEN RETURN 'meta_ads'; END IF;
  END LOOP;
  RETURN 'nao_identificado';
END $$;


REVOKE ALL ON FUNCTION planeje_private.gestor_ia_routine_tracking(public.cliente_whatsapp_contact),
  planeje_private.gestor_ia_routine_origin_catalog(uuid),planeje_private.mini_crm_capture_status() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestor_ia_routine_leads_data(uuid,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gestor_ia_routine_leads_data(uuid,date,uuid,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
