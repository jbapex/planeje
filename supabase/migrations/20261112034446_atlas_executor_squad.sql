BEGIN;

ALTER TABLE private.cs_ia_reading_config ADD COLUMN executor_revision uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION private.atlas_executor_version_cs_reading() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-'executor_revision') IS DISTINCT FROM (to_jsonb(OLD)-'executor_revision') THEN
    NEW.executor_revision:=gen_random_uuid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_atlas_executor_version_cs_reading BEFORE UPDATE ON private.cs_ia_reading_config
  FOR EACH ROW EXECUTE FUNCTION private.atlas_executor_version_cs_reading();

CREATE FUNCTION private.atlas_executor_squad_pick(p_value jsonb,p_keys text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(jsonb_object_agg(k,p_value->k),'{}'::jsonb) FROM unnest(p_keys) k WHERE p_value ? k;
$$;

CREATE FUNCTION private.atlas_executor_squad_fields(p_value jsonb,p_allowed text[],p_required text[] DEFAULT '{}') RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT k=ANY(p_allowed))
    OR NOT p_value ?& p_required
  THEN RAISE invalid_parameter_value USING MESSAGE='Campos da operação do Squad inválidos.'; END IF;
END $$;

CREATE FUNCTION private.atlas_executor_cs_write_scope(p_client_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM private.atlas_executor_user();
  IF coalesce(private.cs_ia_role(),'') NOT IN('admin','superadmin')
    OR p_client_id IS NOT NULL AND NOT private.cs_ia_client_exists(p_client_id)
  THEN RAISE insufficient_privilege USING MESSAGE='Gestão do CS e cliente autorizado necessários.';END IF;
END $$;

CREATE FUNCTION public.atlas_executor_cs_reading_snapshot(p_client_id uuid,p_conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE reading jsonb;configuration jsonb;movement jsonb;creation jsonb;contextual jsonb;version text;
BEGIN
  PERFORM private.atlas_executor_user();
  IF private.cs_ia_role() NOT IN('admin','superadmin') OR private.cs_ia_role() IS NULL
    OR p_client_id IS NULL OR NOT private.cs_ia_client_exists(p_client_id)
  THEN RAISE insufficient_privilege USING MESSAGE='Leitura indisponível neste cliente.'; END IF;
  reading:=public.cs_ia_get_reading(p_client_id);
  IF reading IS NULL OR nullif(reading->>'conversation_id','')::uuid IS DISTINCT FROM p_conversation_id THEN
    RAISE insufficient_privilege USING MESSAGE='O grupo da leitura mudou.';
  END IF;
  SELECT to_jsonb(c) INTO configuration FROM private.cs_ia_reading_config c WHERE c.client_id=p_client_id;
  IF p_conversation_id IS NOT NULL AND private.cs_ia_user_task_module(auth.uid(),'tasks') THEN
    movement:=public.cs_ia_task_move_options(p_client_id,p_conversation_id,NULL);
    creation:=public.cs_ia_task_creation_options(p_client_id,p_conversation_id,NULL);
    contextual:=public.cs_ia_task_context_options(p_client_id,p_conversation_id,NULL);
  END IF;
  SELECT md5(jsonb_build_array(configuration,p_client_id,p_conversation_id,
    (SELECT s.version FROM public.cs_ia_analysis_settings s WHERE s.id=1),
    (SELECT s.task_controls_version FROM public.cs_ia_settings s WHERE s.id=1))::text) INTO version;
  RETURN jsonb_build_object('reading',reading,'task_moves',movement,'task_creation',creation,'task_context',contextual,'version',version);
END $$;

CREATE OR REPLACE FUNCTION private.atlas_executor_dispatch(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb:=p_item.payload;d jsonb;current_state jsonb;expected_state jsonb;answer jsonb;
  keys text[];record_id uuid;source public.gestor_ia_metas_campanha;decision public.gestor_ia_decisoes;configuration jsonb;
BEGIN
  IF p_item.app='atlas' THEN RETURN private.atlas_executor_memory(p_item); END IF;
  IF p_item.app='crm' AND p_item.action='send_message' THEN RETURN private.atlas_executor_crm_delivery(p_item); END IF;
  IF p_item.app='crm' AND private.atlas_executor_action('crm',p_item.action) THEN
    RETURN public.crm_ia_workspace(p_item.action,p_item.client_id,p_item.payload);
  END IF;
  PERFORM private.atlas_executor_user();
  IF p_item.owner_id IS DISTINCT FROM auth.uid() OR p_item.kind<>'proposal'
    OR NOT private.atlas_executor_visible(p_item.app,p_item.client_id)
    OR NOT coalesce(private.atlas_executor_action(p_item.app,p_item.action),false)
    OR p_item.app NOT IN('cs','gestor')
    OR p ? 'p_client_id' AND nullif(p->>'p_client_id','')::uuid IS DISTINCT FROM p_item.client_id
  THEN RAISE insufficient_privilege USING MESSAGE='Operação indisponível no escopo atual.'; END IF;

  IF p_item.app='cs' THEN
    IF coalesce(private.cs_ia_role(),'') NOT IN('admin','superadmin')
      OR p_item.client_id IS NOT NULL AND NOT private.cs_ia_client_exists(p_item.client_id)
      OR p_item.client_id IS NULL AND p_item.action IN('set_health','set_group_binding','configure_reading','configure_task_moves','configure_task_creation','configure_task_context')
    THEN RAISE insufficient_privilege USING MESSAGE='Gestão do CS e cliente autorizado necessários.'; END IF;
    CASE p_item.action
      WHEN 'set_health' THEN
        PERFORM private.atlas_executor_squad_fields(p,ARRAY['data','expected'],ARRAY['data','expected']);
        d:=p->'data';PERFORM private.atlas_executor_squad_fields(d,ARRAY['manual_status'],ARRAY['manual_status']);
        IF d->'manual_status'<>'null'::jsonb AND coalesce(d->>'manual_status','') NOT IN('saudavel','resultado','atencao','critico') THEN
          RAISE invalid_parameter_value USING MESSAGE='Situação de saúde inválida.'; END IF;
        -- O primeiro INSERT também precisa serializar com o formulário nativo, que usa UPSERT.
        LOCK TABLE public.cs_ia_relationships IN SHARE ROW EXCLUSIVE MODE;
        SELECT jsonb_build_object('manual_status',r.manual_status,'updated_at',r.updated_at) INTO current_state
          FROM public.cs_ia_relationships r WHERE r.client_id=p_item.client_id FOR UPDATE;
        PERFORM private.atlas_executor_cs_write_scope(p_item.client_id);
        IF coalesce(current_state,'null'::jsonb) IS DISTINCT FROM p->'expected' THEN
          RAISE serialization_failure USING MESSAGE='A saúde manual mudou.'; END IF;
        INSERT INTO public.cs_ia_relationships(client_id,manual_status) VALUES(p_item.client_id,d->>'manual_status')
          ON CONFLICT(client_id) DO UPDATE SET manual_status=EXCLUDED.manual_status RETURNING to_jsonb(cs_ia_relationships) INTO answer;
        RETURN answer;
      WHEN 'save_settings','save_task_controls','save_analysis_settings' THEN
        PERFORM private.atlas_executor_squad_fields(p,ARRAY['data','expected'],ARRAY['data','expected']);d:=p->'data';
        IF p_item.action='save_settings' THEN
          keys:=ARRAY['healthy_min','result_min','attention_min','score_drop','quiet_days','critical_quiet_days','start_hour','end_hour','weekends','radar_enabled'];
          SELECT private.atlas_executor_squad_pick(to_jsonb(s),keys) INTO current_state FROM public.cs_ia_settings s WHERE id=1 FOR UPDATE;
          expected_state:=current_state;
        ELSIF p_item.action='save_task_controls' THEN
          keys:=ARRAY['task_board_enabled','task_automation_enabled'];
          SELECT private.atlas_executor_squad_pick(to_jsonb(s),keys||ARRAY['task_controls_version']) INTO expected_state FROM public.cs_ia_settings s WHERE id=1 FOR UPDATE;
        ELSE
          keys:=ARRAY['reading_enabled','transcription_enabled'];
          SELECT private.atlas_executor_squad_pick(to_jsonb(s),keys||ARRAY['version']) INTO expected_state FROM public.cs_ia_analysis_settings s WHERE id=1 FOR UPDATE;
        END IF;
        PERFORM private.atlas_executor_cs_write_scope(p_item.client_id);
        PERFORM private.atlas_executor_squad_fields(d,keys,keys);
        IF expected_state IS NULL OR p->'expected' IS DISTINCT FROM expected_state THEN
          RAISE serialization_failure USING MESSAGE='Os controles do CS mudaram.'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_each(d) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM
          CASE WHEN e.key IN('weekends','radar_enabled','task_board_enabled','task_automation_enabled','reading_enabled','transcription_enabled') THEN 'boolean' ELSE 'number' END) THEN
          RAISE invalid_parameter_value USING MESSAGE='Tipos dos controles do CS inválidos.'; END IF;
        IF p_item.action='save_settings' THEN
          UPDATE public.cs_ia_settings SET healthy_min=(d->>'healthy_min')::smallint,result_min=(d->>'result_min')::smallint,
            attention_min=(d->>'attention_min')::smallint,score_drop=(d->>'score_drop')::smallint,quiet_days=(d->>'quiet_days')::smallint,
            critical_quiet_days=(d->>'critical_quiet_days')::smallint,start_hour=(d->>'start_hour')::smallint,end_hour=(d->>'end_hour')::smallint,
            weekends=(d->>'weekends')::boolean,radar_enabled=(d->>'radar_enabled')::boolean WHERE id=1 RETURNING to_jsonb(cs_ia_settings) INTO answer;
        ELSIF p_item.action='save_task_controls' THEN
          UPDATE public.cs_ia_settings SET task_board_enabled=(d->>'task_board_enabled')::boolean,task_automation_enabled=(d->>'task_automation_enabled')::boolean
            WHERE id=1 RETURNING to_jsonb(cs_ia_settings) INTO answer;
        ELSE
          UPDATE public.cs_ia_analysis_settings SET reading_enabled=(d->>'reading_enabled')::boolean,transcription_enabled=(d->>'transcription_enabled')::boolean
            WHERE id=1 RETURNING to_jsonb(cs_ia_analysis_settings) INTO answer;
        END IF;
        RETURN answer;
      WHEN 'set_channel_following' THEN
        PERFORM private.atlas_executor_squad_fields(p,ARRAY['p_channel_id','p_enabled','p_version'],ARRAY['p_channel_id','p_enabled','p_version']);
        RETURN to_jsonb(public.cs_ia_set_channel_following((p->>'p_channel_id')::uuid,(p->>'p_enabled')::boolean,p->>'p_version'));
      WHEN 'set_group_binding' THEN
        keys:=ARRAY['p_client_id','p_conversation_id','p_wa_client_id','p_channel_id','p_group_jid','p_version'];
        PERFORM private.atlas_executor_squad_fields(p,keys,keys);
        RETURN to_jsonb(public.cs_ia_set_group_binding(p_item.client_id,(p->>'p_conversation_id')::uuid,(p->>'p_wa_client_id')::uuid,
          (p->>'p_channel_id')::uuid,p->>'p_group_jid',p->>'p_version'));
      WHEN 'configure_reading','configure_task_moves','configure_task_creation','configure_task_context' THEN
        IF p_item.action='configure_reading' THEN
          keys:=ARRAY['p_client_id','p_enabled','p_include_audio','p_conversation_id','p_transcribe_audio'];
        ELSE keys:=ARRAY['p_client_id','p_conversation_id','p_enabled'];END IF;
        PERFORM private.atlas_executor_squad_fields(p,keys,keys);
        -- Inclui os controles e a configuração ausente: o hash impede ABA dos consentimentos e seus marcos.
        LOCK TABLE public.cs_ia_settings,public.cs_ia_analysis_settings IN SHARE MODE;
        LOCK TABLE private.cs_ia_reading_config IN SHARE ROW EXCLUSIVE MODE;
        current_state:=public.atlas_executor_cs_reading_snapshot(p_item.client_id,(p->>'p_conversation_id')::uuid);
        IF p_item.before IS NULL OR p_item.before->>'version' IS DISTINCT FROM current_state->>'version'
          OR private.atlas_executor_squad_pick(p_item.before,ARRAY['reading','task_moves','task_creation','task_context']) IS DISTINCT FROM
            private.atlas_executor_squad_pick(current_state,ARRAY['reading','task_moves','task_creation','task_context'])
        THEN RAISE serialization_failure USING MESSAGE='A leitura ou uma autorização do grupo mudou.';END IF;
        CASE p_item.action
          WHEN 'configure_reading' THEN RETURN public.cs_ia_reading_settings(p_item.client_id,(p->>'p_enabled')::boolean,(p->>'p_include_audio')::boolean,
            (p->>'p_conversation_id')::uuid,(p->>'p_transcribe_audio')::boolean);
          WHEN 'configure_task_moves' THEN RETURN public.cs_ia_task_move_options(p_item.client_id,(p->>'p_conversation_id')::uuid,(p->>'p_enabled')::boolean);
          WHEN 'configure_task_creation' THEN RETURN public.cs_ia_task_creation_options(p_item.client_id,(p->>'p_conversation_id')::uuid,(p->>'p_enabled')::boolean);
          ELSE RETURN public.cs_ia_task_context_options(p_item.client_id,(p->>'p_conversation_id')::uuid,(p->>'p_enabled')::boolean);
        END CASE;
      WHEN 'save_team_label' THEN
        keys:=ARRAY['p_id','p_kind','p_name','p_archived','p_version'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
        RETURN public.cs_ia_save_team_label((p->>'p_id')::uuid,p->>'p_kind',p->>'p_name',(p->>'p_archived')::boolean,(p->>'p_version')::uuid);
      WHEN 'save_team_person' THEN
        keys:=ARRAY['p_profile_id','p_label_ids','p_expected_ids'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
        RETURN to_jsonb(public.cs_ia_save_team_person((p->>'p_profile_id')::uuid,ARRAY(SELECT jsonb_array_elements_text(p->'p_label_ids'))::uuid[],
          ARRAY(SELECT jsonb_array_elements_text(p->'p_expected_ids'))::uuid[]));
      ELSE RAISE invalid_parameter_value USING MESSAGE='Ação do CS não permitida.';
    END CASE;
  END IF;

  IF p_item.client_id IS NULL AND p_item.action<>'save_report_model' THEN
    RAISE insufficient_privilege USING MESSAGE='Cliente de tráfego necessário.';END IF;
  CASE p_item.action
    WHEN 'save_goal' THEN
      keys:=ARRAY['p_client_id','p_account_id','p_goal_id','p_name','p_objective','p_scope','p_campaign_ids','p_cost_cents','p_budget_cents','p_result_target','p_is_active','p_is_primary'];
      PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      IF public.gestor_ia_pode_usar_metas(p_item.client_id) IS DISTINCT FROM true THEN RAISE insufficient_privilege USING MESSAGE='Metas indisponíveis.';END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(p_item.client_id::text,6110904));
      record_id:=(p->>'p_goal_id')::uuid;
      IF record_id IS NOT NULL THEN
        SELECT * INTO source FROM public.gestor_ia_metas_campanha WHERE id=record_id AND client_id=p_item.client_id AND account_id=p->>'p_account_id' FOR UPDATE;
        IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE='Meta indisponível nesta conta.';END IF;
        current_state:=private.atlas_executor_squad_pick(to_jsonb(source),ARRAY['id','client_id','account_id','name','objective','scope','campaign_ids','cost_cents','budget_cents','result_target','is_active','is_primary','updated_at']);
      ELSE current_state:=NULL;END IF;
      IF coalesce(p_item.before,'null'::jsonb) IS DISTINCT FROM coalesce(current_state,'null'::jsonb) THEN RAISE serialization_failure USING MESSAGE='A meta mudou.';END IF;
      RETURN to_jsonb(public.gestor_ia_salvar_meta(p_item.client_id,p->>'p_account_id',record_id,p->>'p_name',p->>'p_objective',p->>'p_scope',
        ARRAY(SELECT jsonb_array_elements_text(p->'p_campaign_ids')),(p->>'p_cost_cents')::integer,(p->>'p_budget_cents')::integer,(p->>'p_result_target')::integer,
        (p->>'p_is_active')::boolean,(p->>'p_is_primary')::boolean));
    WHEN 'adjust_goal' THEN
      keys:=ARRAY['p_client_id','p_account_id','p_goal_id','p_expected_updated_at','p_budget_cents','p_result_target'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      RETURN to_jsonb(public.gestor_ia_ajustar_meta(p_item.client_id,p->>'p_account_id',(p->>'p_goal_id')::uuid,(p->>'p_expected_updated_at')::timestamptz,
        (p->>'p_budget_cents')::integer,(p->>'p_result_target')::integer));
    WHEN 'configure_agenda' THEN
      keys:=ARRAY['p_client_id','p_account_id','p_enabled','p_run_time','p_weekdays','p_categories','p_revision'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      RETURN public.gestor_ia_configurar_agenda(p_item.client_id,p->>'p_account_id',(p->>'p_enabled')::boolean,(p->>'p_run_time')::time,
        ARRAY(SELECT jsonb_array_elements_text(p->'p_weekdays'))::integer[],ARRAY(SELECT jsonb_array_elements_text(p->'p_categories')),(p->>'p_revision')::integer);
    WHEN 'save_report_model' THEN
      keys:=ARRAY['p_id','p_revision','p_config'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      RETURN public.gestor_ia_salvar_modelo_relatorio((p->>'p_id')::uuid,(p->>'p_revision')::integer,p->'p_config');
    WHEN 'set_client_report_model' THEN
      keys:=ARRAY['p_client_id','p_model_id','p_revision'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      RETURN public.gestor_ia_configurar_modelo_cliente(p_item.client_id,(p->>'p_model_id')::uuid,(p->>'p_revision')::integer);
    WHEN 'update_decision' THEN
      PERFORM private.atlas_executor_squad_fields(p,ARRAY['data','expected'],ARRAY['data','expected']);
      keys:=ARRAY['status','task_id','verdict','verdict_note'];d:=p->'data';PERFORM private.atlas_executor_squad_fields(d,keys,keys);
      IF private.gestor_ia_pode_registrar_decisao(p_item.client_id) IS DISTINCT FROM true THEN RAISE insufficient_privilege USING MESSAGE='Decisão indisponível.';END IF;
      record_id:=(p#>>'{expected,id}')::uuid;
      SELECT * INTO decision FROM public.gestor_ia_decisoes WHERE id=record_id AND owner_id=auth.uid() AND client_id=p_item.client_id FOR UPDATE;
      IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE='Decisão indisponível nesta conta.';END IF;
      PERFORM private.atlas_executor_user();
      IF private.gestor_ia_pode_registrar_decisao(p_item.client_id) IS DISTINCT FROM true THEN RAISE insufficient_privilege USING MESSAGE='Decisão indisponível.';END IF;
      current_state:=private.atlas_executor_squad_pick(to_jsonb(decision),keys||ARRAY['id','revision']);
      IF p->'expected' IS DISTINCT FROM current_state THEN RAISE serialization_failure USING MESSAGE='A decisão mudou.';END IF;
      UPDATE public.gestor_ia_decisoes SET status=d->>'status',task_id=(d->>'task_id')::uuid,verdict=d->>'verdict',verdict_note=d->>'verdict_note'
        WHERE id=record_id AND owner_id=auth.uid() AND client_id=p_item.client_id AND revision=(p#>>'{expected,revision}')::integer
        RETURNING to_jsonb(gestor_ia_decisoes) INTO answer;
      IF NOT FOUND THEN RAISE serialization_failure USING MESSAGE='A decisão mudou.';END IF;
      RETURN answer;
    WHEN 'configure_portal_metrics' THEN
      keys:=ARRAY['p_client_id','p_shared','p_objective','p_revision'];PERFORM private.atlas_executor_squad_fields(p,keys,keys);
      RETURN public.gestor_ia_configurar_metricas_portal(p_item.client_id,(p->>'p_shared')::boolean,p->>'p_objective',(p->>'p_revision')::integer);
    ELSE RAISE invalid_parameter_value USING MESSAGE='Ação do Gestor não permitida.';
  END CASE;
END $$;

REVOKE ALL ON FUNCTION private.atlas_executor_squad_pick(jsonb,text[]),private.atlas_executor_squad_fields(jsonb,text[],text[]),
  private.atlas_executor_cs_write_scope(uuid),private.atlas_executor_dispatch(public.atlas_execution_items),private.atlas_executor_version_cs_reading(),public.atlas_executor_cs_reading_snapshot(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_cs_reading_snapshot(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
