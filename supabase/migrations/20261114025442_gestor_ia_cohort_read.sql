-- Leitura aditiva: mantém o leitor semanal, ACLs, ledger e revisões publicados.
BEGIN;
CREATE FUNCTION public.gestor_ia_cohort_data(p_client uuid,p_week date,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  original_claims text:=current_setting('request.jwt.claims',true);
  original_sub text:=current_setting('request.jwt.claim.sub',true);
  observed_at timestamptz:=transaction_timestamp();
  ledger_start constant timestamptz:='2026-11-13T04:38:00Z';
  result jsonb;
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
  IF p_client IS NULL OR NOT planeje_private.gestor_ia_routine_access(p_client,true) THEN
    RAISE insufficient_privilege USING MESSAGE='Sem acesso aos leads deste cliente.';
  END IF;
  IF p_week IS NULL OR extract(isodow FROM p_week)<>1 OR p_week>public.central_trafego_operational_date() THEN
    RAISE EXCEPTION 'Escolha uma semana iniciada, de segunda a domingo.' USING ERRCODE='22023';
  END IF;
  -- Uma fotografia STABLE; os predicados semanais espelham o leitor canônico VOLATILE.
  WITH visible_contacts AS MATERIALIZED (
    SELECT c.* FROM public.cliente_whatsapp_contact c
    WHERE c.cliente_id=p_client AND c.from_jid NOT LIKE '%@g.us'
      AND public.atendimento_user_can_access_atendimento_scope(p_client,NULL,c.whatsapp_config_id)
      AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=c.id
        AND s.privado AND s.assigned_to IS DISTINCT FROM auth.uid()
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='superadmin'))
  ), appointment_events AS MATERIALIZED (
    SELECT h.contact_id,h.message_at AS at,'automatico'::text AS source,h.appointment_day
    FROM public.mini_crm_message_history h WHERE h.cliente_id=p_client AND h.reason='appointment'
      AND h.message_at>=p_week::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND h.message_at<(p_week+7)::timestamp AT TIME ZONE 'America/Sao_Paulo'
    UNION ALL
    SELECT h.contact_id,h.at,'manual',h.appointment_day FROM public.mini_crm_status_history h
    WHERE h.cliente_id=p_client AND h.reason='manual' AND h.actor_type='pessoa' AND h.is_appointment
      AND h.at>=p_week::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND h.at<(p_week+7)::timestamp AT TIME ZONE 'America/Sao_Paulo'
  ), weekly_contacts AS MATERIALIZED (
    SELECT c.* FROM visible_contacts c WHERE EXISTS(SELECT 1 FROM appointment_events e WHERE e.contact_id=c.id)
  ), weekly AS MATERIALIZED (
    SELECT jsonb_build_object(
      'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'cliente_id',c.cliente_id,'first_seen_at',c.first_seen_at,'last_message_at',c.last_message_at,
        'origin_source',planeje_private.gestor_ia_routine_origin(c),'tracking_data',planeje_private.gestor_ia_routine_tracking(c),
        'mini_crm',planeje_private.gestor_ia_routine_mini(c.mini_crm,(SELECT m.columns FROM public.mini_crm_config m WHERE m.cliente_id=p_client))-'contato_nome',
        'has_link',coalesce(nullif(btrim(c.tracking_data->>'planeje_link_id'),''),nullif(btrim(c.tracking_data->>'planeje_match_code'),'')) IS NOT NULL,
        'utm_source',planeje_private.gestor_ia_routine_mask_text(c.utm_source),'utm_medium',planeje_private.gestor_ia_routine_mask_text(c.utm_medium),
        'qualificado',c.qualificado,'comprou',c.comprou) ORDER BY c.first_seen_at,c.id) FROM weekly_contacts c),'[]'),
      'appointment_events',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('contact_id',e.contact_id,'at',e.at,'source',e.source,'appointment_day',e.appointment_day)) ORDER BY e.at,e.contact_id,e.source)
        FROM appointment_events e JOIN weekly_contacts c ON c.id=e.contact_id),'[]'),
      'origin_catalog',planeje_private.gestor_ia_routine_origin_catalog(p_client),'messages','[]'::jsonb,
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
    'niche',coalesce((SELECT planeje_private.gestor_ia_routine_mask_text(c.nicho) FROM public.clientes c WHERE c.id=p_client),'')
    ) AS data
  ), weeks AS MATERIALIZED (
    SELECT p_week AS week_start
    UNION
    SELECT date_trunc('week',c.first_seen_at AT TIME ZONE 'America/Sao_Paulo')::date FROM weekly_contacts c WHERE c.first_seen_at IS NOT NULL
  ), contacts AS MATERIALIZED (
    SELECT c.* FROM visible_contacts c WHERE c.first_seen_at<=observed_at
      AND EXISTS(SELECT 1 FROM weeks w WHERE c.first_seen_at>=w.week_start::timestamp AT TIME ZONE 'America/Sao_Paulo'
        AND c.first_seen_at<(w.week_start+7)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ), first_events AS (
    -- A primeira transição é escolhida antes da validação: nunca promover uma remarcação à primeira.
    SELECT h.contact_id,min(h.at) AS at FROM public.mini_crm_status_history h
    JOIN contacts c ON c.id=h.contact_id WHERE h.cliente_id=p_client AND h.is_appointment GROUP BY h.contact_id
  )
  SELECT jsonb_build_object(
    'schema_version',1,'cliente_id',p_client,'semana',p_week,'as_of',observed_at,'ledger_started_at',ledger_start,
    'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'cliente_id',c.cliente_id,'first_seen_at',c.first_seen_at,
      'origin_source',planeje_private.gestor_ia_routine_origin(c),'tracking_data',planeje_private.gestor_ia_routine_tracking(c),
      'mini_crm',planeje_private.gestor_ia_routine_mini(c.mini_crm,(SELECT m.columns FROM public.mini_crm_config m WHERE m.cliente_id=p_client))-'contato_nome',
      'utm_source',planeje_private.gestor_ia_routine_mask_text(c.utm_source),'utm_medium',planeje_private.gestor_ia_routine_mask_text(c.utm_medium),
      'has_link',coalesce(nullif(btrim(c.tracking_data->>'planeje_link_id'),''),nullif(btrim(c.tracking_data->>'planeje_match_code'),'')) IS NOT NULL,
      'legacy_appointment',EXISTS(SELECT 1 FROM public.mini_crm_message_history h WHERE h.cliente_id=p_client AND h.contact_id=c.id
        AND h.reason='appointment' AND h.message_at<ledger_start AND h.message_at<=observed_at)
        OR EXISTS(SELECT 1 FROM public.mini_crm_status_history h WHERE h.cliente_id=p_client AND h.contact_id=c.id
          AND h.is_appointment AND h.at<ledger_start AND h.at<=observed_at)
    ) ORDER BY c.first_seen_at,c.id) FROM contacts c),'[]'),
    'first_appointments',coalesce((SELECT jsonb_agg(jsonb_build_object('contact_id',e.contact_id,'at',e.at) ORDER BY e.at,e.contact_id)
      FROM first_events e JOIN contacts c ON c.id=e.contact_id WHERE e.at>=c.first_seen_at AND e.at>=ledger_start AND e.at<=observed_at),'[]'),
    'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('week_start',r.week_start,'campaign_metrics',coalesce((
      SELECT jsonb_agg((SELECT jsonb_object_agg(key,CASE WHEN key='spend' THEN CASE WHEN jsonb_typeof(value)='number' THEN value ELSE 'null'::jsonb END
          WHEN key IN ('account_id','campaign_id','adset_id') THEN CASE WHEN jsonb_typeof(value)='string' AND value#>>'{}' ~ '^[a-zA-Z0-9_-]{1,128}$' THEN value ELSE 'null'::jsonb END
          WHEN key='platform' THEN CASE WHEN value#>>'{}' IN ('meta','google','other') THEN value ELSE 'null'::jsonb END
          ELSE CASE WHEN jsonb_typeof(value)='string' THEN to_jsonb(planeje_private.gestor_ia_routine_mask_text(value#>>'{}')) ELSE 'null'::jsonb END END)
        FROM jsonb_each(row_data) WHERE key IN ('platform','account_id','campaign_id','campaign_name','adset_id','adset_name','spend')) ORDER BY ord)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.campaign_metrics)='array' THEN r.campaign_metrics ELSE '[]' END) WITH ORDINALITY rows(row_data,ord)
    ),'[]')) ORDER BY r.week_start) FROM public.traffic_weekly_reviews r
      WHERE r.client_id=p_client AND r.kind='review' AND r.week_start IN (SELECT week_start FROM weeks)),'[]'),
    'weekly',(SELECT data FROM weekly),
    'origin_catalog',(SELECT data->'origin_catalog' FROM weekly),'config',(SELECT data->'config' FROM weekly),'niche',(SELECT data->'niche' FROM weekly)
  ) INTO result;
  PERFORM set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.gestor_ia_cohort_data(uuid,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gestor_ia_cohort_data(uuid,date,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
