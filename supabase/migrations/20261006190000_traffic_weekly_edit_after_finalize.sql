-- Permite gravar de novo uma revisão já concluída (rascunho reabre; concluir fecha outra vez).
CREATE OR REPLACE FUNCTION public.save_traffic_weekly_review(p_review uuid, p_revision integer, p_data jsonb, p_finalize boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r public.traffic_weekly_reviews; t public.tarefas; v_before jsonb; v_action uuid;
  v_mode text; v_analysis text; v_spend numeric; v_contacts integer; v_results integer; v_label text; v_rows jsonb; v_metric_mode text;
BEGIN
  SELECT task_id INTO v_action FROM public.traffic_weekly_reviews WHERE id=p_review;
  SELECT * INTO t FROM public.tarefas WHERE id=v_action FOR UPDATE;
  SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=p_review FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Revisão não encontrada.'; END IF;
  IF NOT planeje_private.traffic_weekly_can_edit(r.task_id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode revisar esta semana.'; END IF;
  IF p_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Outra pessoa atualizou esta revisão. Reabra para conferir a versão atual.'; END IF;
  IF jsonb_typeof(p_data)<>'object' OR p_data IS NULL THEN RAISE EXCEPTION 'Dados da revisão inválidos.'; END IF;
  IF r.finalized_at IS NOT NULL AND p_finalize THEN RETURN r.id; END IF;
  v_metric_mode:=coalesce(p_data->>'metric_mode',r.metric_mode);
  IF v_metric_mode NOT IN ('client','campaign') THEN RAISE EXCEPTION 'Confira o modo dos números.'; END IF;
  v_rows:=planeje_private.traffic_routine_campaign_metrics(r.client_id,coalesce(p_data->'campaign_metrics','[]'::jsonb),p_finalize AND r.kind='review' AND v_metric_mode='campaign',r.kind='optimization');
  IF r.kind='review' AND v_metric_mode='client' THEN v_rows:='[]'::jsonb; END IF;
  v_before:=to_jsonb(r); v_mode:=coalesce(p_data->>'action_mode','undecided');
  v_analysis:=btrim(coalesce(p_data->>'analysis',''));
  v_spend:=nullif(p_data->>'investment','')::numeric; v_contacts:=nullif(p_data->>'contacts','')::integer; v_results:=nullif(p_data->>'results','')::integer;
  IF v_metric_mode='campaign' OR r.kind='optimization' THEN
    SELECT sum((value->>'spend')::numeric) INTO v_spend FROM jsonb_array_elements(v_rows);
    v_contacts:=NULL; v_results:=NULL;
  END IF;
  IF v_spend<0 OR v_spend>999999999999.99 OR v_contacts<0 OR v_results<0 OR (v_contacts IS NOT NULL AND v_results>v_contacts) THEN RAISE EXCEPTION 'Confira os números. Resultados são contatos da semana que atingiram o objetivo.'; END IF;
  IF v_mode NOT IN ('undecided','none','create','link') THEN RAISE EXCEPTION 'Confira a próxima ação.'; END IF;
  IF p_finalize AND (v_analysis='' OR v_mode='undecided' OR (r.kind='review' AND v_metric_mode='client' AND (v_spend IS NULL OR v_contacts IS NULL))) THEN RAISE EXCEPTION 'Informe investimento, contatos, análise e próxima ação. Use zero somente quando foi conferido.'; END IF;
  IF p_finalize AND r.kind='review' AND r.week_start+6>=public.central_trafego_operational_date() THEN RAISE EXCEPTION 'A semana precisa estar encerrada antes de finalizar.'; END IF;
  v_action:=NULL;
  IF v_mode='link' THEN
    v_action:=nullif(p_data->>'action_task_id','')::uuid;
    IF v_action IS NULL OR v_action=r.task_id OR NOT EXISTS(SELECT 1 FROM public.tarefas a WHERE a.id=v_action AND a.client_id=r.client_id AND public.central_trafego_can_see_task(a.id)) THEN RAISE EXCEPTION 'Vincule uma tarefa acessível do mesmo cliente.'; END IF;
  ELSIF v_mode='create' AND p_finalize THEN
    IF nullif(btrim(p_data->'action_draft'->>'title'),'') IS NULL OR nullif(p_data->'action_draft'->>'due_date','') IS NULL OR nullif(p_data->'action_draft'->>'assignee_id','') IS NULL THEN RAISE EXCEPTION 'A próxima ação precisa de título, responsável e prazo.'; END IF;
    IF NOT public.central_trafego_can_assign_others() AND (p_data->'action_draft'->>'assignee_id')::uuid<>auth.uid() THEN RAISE insufficient_privilege USING MESSAGE='Você pode atribuir a próxima ação a si; peça ao gestor para encaminhar a outra pessoa.'; END IF;
    v_action:=planeje_private.traffic_weekly_new_task(r.client_id,btrim(p_data->'action_draft'->>'title'),(p_data->'action_draft'->>'due_date')::date,
      (p_data->'action_draft'->>'assignee_id')::uuid,auth.uid(),v_analysis,'outro','weekly_action:'||r.id::text,r.task_id);
  END IF;
  UPDATE public.traffic_weekly_reviews SET metric_mode=v_metric_mode,campaign_metrics=v_rows,investment=v_spend,contacts=v_contacts,results=v_results,analysis=v_analysis,
    data_note=coalesce(p_data->>'data_note',''),action_mode=v_mode,action_task_id=v_action,
    action_draft=CASE WHEN v_mode='create' THEN coalesce(p_data->'action_draft','{}'::jsonb) ELSE '{}'::jsonb END,
    revision=revision+1,updated_at=now(),
    finalized_at=CASE WHEN p_finalize THEN clock_timestamp() ELSE NULL END,
    finalized_by=CASE WHEN p_finalize THEN auth.uid() ELSE NULL END
    WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.traffic_weekly_history(client_id,review_id,event,actor_id,snapshot) VALUES(r.client_id,r.id,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,auth.uid(),jsonb_build_object('before',v_before,'after',to_jsonb(r)));
  IF p_finalize THEN
    SELECT label INTO v_label FROM public.task_statuses WHERE value='completed' AND is_terminal;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Configure o status Concluído operacional para a revisão.'; END IF;
    UPDATE public.traffic_task_details SET completion_summary=v_analysis,next_action_none=(v_mode='none'),updated_at=now() WHERE task_id=r.task_id;
    UPDATE public.tarefas SET status='completed',status_history=coalesce(status_history,'[]'::jsonb)||jsonb_build_array(
      jsonb_build_object('status','completed','user_id',auth.uid(),'timestamp',now(),'assignee_ids',to_jsonb(t.assignee_ids))) WHERE id=r.task_id;
  END IF;
  RETURN r.id;
END;
$function$;
