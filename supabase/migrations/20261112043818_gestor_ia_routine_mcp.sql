-- IA preenche a revisão existente; somente a equipe autenticada a valida pelo save oficial.
BEGIN;

ALTER TABLE public.traffic_weekly_reviews
  ADD COLUMN fill_origin text NOT NULL DEFAULT 'pessoa' CHECK (fill_origin IN ('pessoa','ia')),
  ADD COLUMN validation_state text NOT NULL DEFAULT 'em_revisao' CHECK (validation_state IN ('rascunho_ia','em_revisao','validado')),
  ADD COLUMN ai_suggestion text NOT NULL DEFAULT '' CHECK (length(ai_suggestion)<=10000);
UPDATE public.traffic_weekly_reviews SET validation_state='validado' WHERE finalized_at IS NOT NULL;
ALTER TABLE public.traffic_weekly_reviews ADD CONSTRAINT traffic_weekly_validation_matches_finalized
  CHECK ((validation_state='validado')=(finalized_at IS NOT NULL));
ALTER TABLE public.traffic_weekly_history
  ADD COLUMN actor_type text NOT NULL DEFAULT 'pessoa' CHECK (actor_type IN ('pessoa','ia'));

CREATE FUNCTION planeje_private.gestor_ia_routine_access(p_client uuid DEFAULT NULL,p_leads boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(EXISTS(
    SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.id=auth.uid() AND p.status='active' AND p.role IN ('superadmin','admin','colaborador')
      AND (u.banned_until IS NULL OR u.banned_until<=now())
      AND (current_setting('role',true)='service_role' OR session_user='service_role' OR public.planeje_current_account_access())
      AND (p.role='superadmin' OR (private.gestor_ia_modulo_decisao('paid_traffic') AND (NOT p_leads OR private.gestor_ia_modulo_decisao('rastreamento'))))
      AND (p_client IS NULL OR EXISTS(
        SELECT 1 FROM public.clientes c WHERE c.id=p_client
          AND public.central_trafego_can_access_client(c.id)
          AND (p.role IN ('superadmin','admin') OR c.responsavel::text=p.id::text OR EXISTS(
            SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id=c.id AND o.primary_assignee_id=p.id AND coalesce(o.situation,'active')<>'closed'))
      ))
  ),false)
$$;

CREATE FUNCTION planeje_private.gestor_ia_routine_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE is_service boolean := current_setting('role',true)='service_role' OR session_user='service_role';
BEGIN
  IF is_service THEN
    -- O gerador canônico abre fichas vazias sem um ator; isso não constitui preenchimento IA.
    IF TG_OP='INSERT' AND auth.uid() IS NULL AND NEW.finalized_at IS NULL AND NEW.finalized_by IS NULL
      AND NEW.fill_origin='pessoa' AND NEW.validation_state='em_revisao' AND NEW.revision=0
      AND NEW.campaign_metrics='[]'::jsonb AND NEW.investment IS NULL AND NEW.contacts IS NULL AND NEW.results IS NULL
      AND NEW.analysis='' AND NEW.data_note='' AND NEW.ai_suggestion='' AND NEW.action_mode='undecided'
      AND NEW.action_task_id IS NULL AND NEW.action_draft='{}'::jsonb THEN
      RETURN NEW;
    END IF;
    IF NOT planeje_private.gestor_ia_routine_access(NEW.client_id) THEN
      RAISE insufficient_privilege USING MESSAGE='Sem acesso à rotina deste cliente.';
    END IF;
    IF TG_OP='UPDATE' AND OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Semana validada. A equipe precisa reabrir a revisão.' USING ERRCODE='55000';
    END IF;
    IF NEW.finalized_at IS NOT NULL OR NEW.finalized_by IS NOT NULL OR NEW.validation_state='validado' THEN
      RAISE insufficient_privilege USING MESSAGE='Somente uma pessoa autenticada pode validar a revisão.';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.client_id,NEW.week_start,NEW.kind,NEW.task_id,NEW.action_mode,NEW.action_task_id,NEW.action_draft)
      IS DISTINCT FROM (OLD.client_id,OLD.week_start,OLD.kind,OLD.task_id,OLD.action_mode,OLD.action_task_id,OLD.action_draft) THEN
      RAISE insufficient_privilege USING MESSAGE='A IA não altera a execução ou a próxima ação da revisão.';
    END IF;
    NEW.fill_origin:='ia';
    NEW.validation_state:='rascunho_ia';
  ELSE
    IF NEW.finalized_at IS NOT NULL THEN
      IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR NOT public.planeje_current_account_access()
        OR NOT planeje_private.traffic_weekly_staff() OR NEW.finalized_by IS DISTINCT FROM auth.uid() THEN
        RAISE insufficient_privilege USING MESSAGE='Somente uma pessoa autenticada pode validar a revisão.';
      END IF;
      NEW.validation_state:='validado';
    ELSE
      NEW.validation_state:='em_revisao';
    END IF;
    NEW.fill_origin:=CASE WHEN TG_OP='UPDATE' THEN OLD.fill_origin ELSE 'pessoa' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gestor_ia_routine_guard BEFORE INSERT OR UPDATE ON public.traffic_weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION planeje_private.gestor_ia_routine_guard();

CREATE FUNCTION planeje_private.gestor_ia_routine_history_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE change_type text; changed_fields jsonb;
BEGIN
  NEW.actor_type:=CASE WHEN (current_setting('role',true)='service_role' OR session_user='service_role') AND auth.uid() IS NOT NULL THEN 'ia' ELSE 'pessoa' END;
  IF NEW.actor_type='ia' THEN NEW.actor_id:=auth.uid(); END IF;
  IF NEW.event='created' AND NEW.review_id IS NOT NULL THEN
    NEW.snapshot:=NEW.snapshot||jsonb_build_object('before',NULL,'after',(SELECT to_jsonb(r) FROM public.traffic_weekly_reviews r WHERE r.id=NEW.review_id));
  END IF;
  SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') INTO changed_fields
    FROM jsonb_each(coalesce(NEW.snapshot->'after','{}'))
    WHERE value IS DISTINCT FROM NEW.snapshot->'before'->key;
  change_type:=CASE WHEN NEW.event='settings' THEN 'settings' WHEN NEW.event='created' THEN 'created'
    WHEN NEW.snapshot->'after'->>'finalized_at' IS NOT NULL THEN 'validated'
    WHEN NEW.snapshot->'before'->>'finalized_at' IS NOT NULL THEN 'reopened'
    WHEN changed_fields ? 'ai_suggestion' THEN 'suggestion'
    WHEN NEW.actor_type='ia' THEN 'ai_draft' ELSE 'human_edit' END;
  NEW.snapshot:=NEW.snapshot||jsonb_build_object('actor_type',NEW.actor_type,'change_type',change_type,'changed_fields',changed_fields);
  RETURN NEW;
END $$;
CREATE TRIGGER gestor_ia_routine_history_actor BEFORE INSERT ON public.traffic_weekly_history
  FOR EACH ROW EXECUTE FUNCTION planeje_private.gestor_ia_routine_history_actor();

CREATE FUNCTION planeje_private.gestor_ia_routine_phone(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN length(digits)>=4 THEN '•••• '||right(digits,4) WHEN digits<>'' THEN '••••' ELSE 'Não informado' END
    FROM (SELECT regexp_replace(split_part(coalesce(p_value,''),'@',1),'[^0-9]','','g') AS digits) value
$$;

CREATE FUNCTION planeje_private.gestor_ia_routine_mask_text(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE token text;
BEGIN
  FOR token IN SELECT match[1] FROM regexp_matches(p_value,'([[:alnum:]_.:+-]+@(?:s\.whatsapp\.net|c\.us|lid|g\.us))','gi') match LOOP
    p_value:=replace(p_value,token,planeje_private.gestor_ia_routine_phone(token));
  END LOOP;
  FOR token IN SELECT match[1] FROM regexp_matches(p_value,'(\+?[0-9][0-9[:space:]().-]{7,}[0-9])','g') match LOOP
    p_value:=replace(p_value,token,planeje_private.gestor_ia_routine_phone(token));
  END LOOP;
  RETURN p_value;
END $$;

CREATE FUNCTION planeje_private.gestor_ia_routine_signal_text(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  -- Apenas o vocabulário necessário chega ao classificador JS; o corpo livre fica na conversa autorizada.
  SELECT coalesce(string_agg(CASE WHEN match[1]=ANY(ARRAY[
      'agenda','agendar','agendei','agendou','agendo','agendando','agendamos','agendamento','agendamentos','agendado','agendada','agendados','agendadas',
      'confirmo','confirma','confirmar','confirmou','confirmei','confirmando','confirmamos','confirmacao','confirmacoes','confirmado','confirmada','confirmados','confirmadas',
      'marca','marcar','marquei','marcou','marcando','marcamos','marcacao','marcacoes','marcado','marcada','marcados','marcadas',
      'reagenda','reagendar','reagendei','reagendou','reagendando','reagendamento','reagendamentos','reagendado','reagendada','reagendados','reagendadas',
      'combinado','combinada','combinados','combinadas','desmarcar','desmarcou','desmarcando','desmarcado','desmarcada','desmarcados','desmarcadas',
      'cancela','cancelar','cancelei','cancelou','cancelando','cancelamento','cancelamentos','cancelado','cancelada','cancelados','canceladas',
      'reservado','reservada','reservados','reservadas','aguarda','aguardo','aguardar','aguardando','aguardamos',
      'precisa','preciso','precisar','precisam','precisamos','precisando','falta','faltam','faltou','faltando','necessita','necessitam','necessitando','deve','devem','devemos','deveria'
    ]) THEN match[1]
    WHEN match[1] ~ '^(?:agend|confirm|marc|reagend|combinad|reservad)[a-z]*$' THEN NULL
    ELSE regexp_replace(match[1],'^((?:desmarc|cancel|aguard|precis|falt|necessit|deve))[a-z]*$','\1') END,' ' ORDER BY ord),'')
    FROM regexp_matches(translate(lower(normalize(coalesce(p_value,''),NFC)),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'),
      '(\m(?:agend[a-z]*|confirm[a-z]*|marc[a-z]*|marquei|reagend[a-z]*|combinad[a-z]*|desmarc[a-z]*|cancel[a-z]*|reservad[a-z]*|nao|sem|posso|poderei|vou|consigo|ficou|esta|sim|ok|pode|horario|visita|prova|atendimento|consulta|te|esperamos|nos|vemos|comparecer|encontro|amanha|hoje|se|caso|quando|talvez|ainda|pendente|pendencia|aguard[a-z]*|precis[a-z]*|falt[a-z]*|necessit[a-z]*|deve[a-z]*|a|para|por|ser)\M|\m20[0-9]{2}-[0-9]{2}-[0-9]{2}\M|\m[0-9]{1,2}/[0-9]{1,2}(?:/(?:20)?[0-9]{2})?\M|\m[0-2]?[0-9](?::[0-5][0-9]|h(?:[0-5][0-9])?)\M|\?)',
      'g') WITH ORDINALITY AS tokens(match,ord)
$$;

CREATE FUNCTION planeje_private.gestor_ia_routine_mini(p_mini jsonb,p_columns jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb; column_data jsonb; key text; value text; day text; safe_key text;
BEGIN
  result:=jsonb_strip_nulls(jsonb_build_object('status',CASE WHEN jsonb_typeof(p_mini->'status')='string' THEN planeje_private.gestor_ia_routine_mask_text(p_mini->>'status') END,
    'contato_nome',CASE WHEN jsonb_typeof(p_mini->'contato_nome')='string' THEN planeje_private.gestor_ia_routine_mask_text(p_mini->>'contato_nome') END));
  FOR column_data IN SELECT item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_columns)='array' THEN p_columns ELSE '[]' END
    ||'[{"key":"data_agendamento","kind":"day"},{"key":"data_da_visita","kind":"day"}]'::jsonb) item
    WHERE item->>'kind' IN ('day','date') AND jsonb_typeof(item->'key')='string' AND item->>'key'<>'data_venda'
      AND lower(coalesce(CASE WHEN jsonb_typeof(item->'label')='string' THEN item->>'label' END,'')||' '||(item->>'key')) ~ 'agend|visita'
  LOOP
    key:=column_data->>'key'; safe_key:=planeje_private.gestor_ia_routine_mask_text(key); value:=btrim(p_mini->>key);
    day:=coalesce(substring(value FROM '^[0-9]{4}-[0-9]{2}-[0-9]{2}'),substring(value FROM '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'));
    IF day IS NOT NULL THEN result:=result||jsonb_build_object(safe_key,day); END IF;
    value:=btrim(p_mini->>(key||'_hora'));
    IF value ~ '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$' THEN result:=result||jsonb_build_object(safe_key||'_hora',value); END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION planeje_private.gestor_ia_routine_origin(p_contact public.cliente_whatsapp_contact)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE tracking jsonb:=coalesce(p_contact.tracking_data,'{}'); origin text:=p_contact.origin_source; hint text; event_data jsonb;
BEGIN
  IF origin IN ('google_ads','google','site','manual') THEN RETURN CASE WHEN origin='google' THEN 'google_ads' ELSE origin END; END IF;
  IF origin IN ('meta','facebook_ads') THEN origin:='meta_ads'; END IF;
  IF origin IS NULL OR origin NOT IN ('google_ads','meta_ads','site') THEN origin:=tracking->>'planeje_link_origin'; END IF;
  IF origin='google_ads' THEN RETURN origin; END IF;
  -- A origem Linktree legada continua sendo site, mesmo com IDs de uma campanha posterior.
  IF coalesce(nullif(tracking->>'planeje_link_id',''),nullif(tracking->>'planeje_match_code','')) IS NOT NULL
    AND lower(coalesce(nullif(btrim(p_contact.utm_source),''),nullif(btrim(tracking->>'utm_source'),''),''))='linktree'
    AND nullif(tracking->>'gclid','') IS NULL AND nullif(btrim(tracking->>'ctwaClid'),'') IS NULL AND nullif(btrim(tracking->>'ctwa_clid'),'') IS NULL THEN
    RETURN 'site';
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

CREATE FUNCTION public.gestor_ia_routine_leads_data(p_client uuid,p_week date,p_actor uuid DEFAULT NULL)
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
  IF p_week IS NULL OR extract(isodow FROM p_week)<>1 OR p_week>public.central_trafego_operational_date() THEN
    RAISE EXCEPTION 'Escolha uma semana iniciada, de segunda a domingo.' USING ERRCODE='22023';
  END IF;
  week_since:=p_week::timestamp AT TIME ZONE 'America/Sao_Paulo';
  week_until:=(p_week+7)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  WITH contacts AS MATERIALIZED (
    SELECT c.* FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client
      AND c.first_seen_at>=week_since AND c.first_seen_at<week_until
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
    WHERE NOT coalesce(i.is_group,false) AND i.from_jid NOT LIKE '%@g.us'
      AND coalesce(i.msg_timestamp,i.created_at)>=c.first_seen_at
      AND nullif(btrim(i.body),'') IS NOT NULL
    UNION ALL
    SELECT c.id,s.id,'equipe',planeje_private.gestor_ia_routine_signal_text(s.body),s.created_at
    FROM contacts c JOIN public.cliente_whatsapp_config cfg ON cfg.id=c.whatsapp_config_id AND cfg.cliente_id=p_client
    JOIN public.cliente_whatsapp_sent s ON s.cliente_id=p_client AND s.whatsapp_config_id=cfg.id
      AND (s.chat_jid=c.from_jid OR (nullif(s.chat_jid,'') IS NULL AND s.to_jid=c.from_jid))
    WHERE s.to_jid NOT LIKE '%@g.us' AND s.created_at>=c.first_seen_at
      AND nullif(btrim(s.body),'') IS NOT NULL
  )
  SELECT jsonb_build_object(
    'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'cliente_id',c.cliente_id,'phone',planeje_private.gestor_ia_routine_phone(coalesce(nullif(c.phone,''),c.from_jid)),
      'sender_name',planeje_private.gestor_ia_routine_mask_text(c.sender_name),'first_seen_at',c.first_seen_at,'last_message_at',c.last_message_at,
      'origin_source',planeje_private.gestor_ia_routine_origin(c),
      'tracking_data',(SELECT coalesce(jsonb_object_agg(name,value),'{}') FROM (VALUES
        ('account_id',coalesce(c.tracking_data#>>'{meta_ad_details,ad,account_id}',c.tracking_data#>>'{meta_ad_details,ad,campaign,account_id}',c.tracking_data->>'account_id')),
        ('campaign_id',coalesce(c.tracking_data#>>'{meta_ad_details,ad,campaign,id}',c.tracking_data#>>'{meta_ad_details,ad,campaign_id}',c.tracking_data#>>'{meta_ad_details,campaign_id}',c.tracking_data->>'campaign_id',c.tracking_data->>'campaignId')),
        ('adset_id',coalesce(c.tracking_data#>>'{meta_ad_details,ad,adset,id}',c.tracking_data#>>'{meta_ad_details,ad,adset_id}',c.tracking_data->>'adset_id'))
      ) ids(name,value) WHERE value ~ '^[a-zA-Z0-9_-]{1,128}$'
        AND regexp_replace(value,'[^0-9]','','g') IS DISTINCT FROM regexp_replace(split_part(coalesce(nullif(c.phone,''),c.from_jid),'@',1),'[^0-9]','','g')),
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
    'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('contact_id',e.contact_id,'text',e.text,'direction',e.direction,'at',e.at,'id',e.id) ORDER BY e.at,e.id) FROM evidence e),'[]')
  ) INTO result;
  PERFORM set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
  RETURN result;
END $$;

CREATE FUNCTION public.gestor_ia_routine_mcp(p_actor uuid,p_action text,p_client uuid DEFAULT NULL,p_week date DEFAULT NULL,p_payload jsonb DEFAULT '{}')
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
    result:=public.gestor_ia_routine_leads_data(p_client,week,p_actor);
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

REVOKE ALL ON FUNCTION planeje_private.gestor_ia_routine_access(uuid,boolean),planeje_private.gestor_ia_routine_guard(),planeje_private.gestor_ia_routine_history_actor()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION planeje_private.gestor_ia_routine_phone(text),planeje_private.gestor_ia_routine_mask_text(text),
  planeje_private.gestor_ia_routine_signal_text(text),planeje_private.gestor_ia_routine_mini(jsonb,jsonb),
  planeje_private.gestor_ia_routine_origin(public.cliente_whatsapp_contact) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.gestor_ia_routine_leads_data(uuid,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestor_ia_routine_leads_data(uuid,date,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
