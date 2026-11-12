BEGIN;
CREATE OR REPLACE FUNCTION public.traffic_weekly_board() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT planeje_private.traffic_weekly_staff() THEN RAISE insufficient_privilege USING MESSAGE='Acesso restrito à equipe ativa.'; END IF;
  RETURN jsonb_build_object('today',public.central_trafego_operational_date(),'can_manage',planeje_private.traffic_weekly_manager(),
    'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'empresa',c.empresa,'eligible',c.etapa='closed','manager_id',o.primary_assignee_id,
      'manager_name',p.full_name,'settings',to_jsonb(w),'next_due_on',CASE WHEN w.enabled THEN (SELECT d.due + CASE WHEN EXISTS(SELECT 1 FROM public.traffic_weekly_reviews h
      WHERE h.client_id=c.id AND h.week_start=date_trunc('week',d.due::timestamp)::date-7) THEN 7 ELSE 0 END
      FROM (SELECT planeje_private.traffic_weekly_due_on(greatest(w.starts_on,w.enabled_since,public.central_trafego_operational_date()),w.review_weekday) AS due) d) END,
      'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('due_on',i.due_on,'message',i.message)) FROM public.traffic_weekly_generation_issues i WHERE i.client_id=c.id),'[]'::jsonb)) ORDER BY c.empresa)
      FROM public.clientes c LEFT JOIN public.traffic_client_ops o ON o.client_id=c.id LEFT JOIN public.profiles p ON p.id=o.primary_assignee_id
      LEFT JOIN public.traffic_weekly_settings w ON w.client_id=c.id WHERE public.can_use_traffic_weekly(c.id)
        AND ((c.etapa='closed' AND (public.central_trafego_checkup_is_operational_client(c.id) OR w.client_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.cliente_google_ads_accounts g WHERE g.cliente_id=c.id))) OR EXISTS(SELECT 1 FROM public.traffic_weekly_reviews h WHERE h.client_id=c.id))),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
      'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
      'action_title',a.title,'action_assignee_ids',a.assignee_ids,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
      'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC,r.created_at DESC)
      FROM public.traffic_weekly_reviews r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
      LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
      LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status
      WHERE public.can_use_traffic_weekly(r.client_id) AND (r.week_start>=public.central_trafego_operational_date()-56 OR r.finalized_at IS NULL
        OR (r.action_task_id IS NOT NULL AND NOT coalesce(ast.is_terminal,false)))),'[]'::jsonb),
    'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) ORDER BY full_name) FROM public.profiles
      WHERE status='active' AND role IN ('superadmin','admin','colaborador')),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.traffic_weekly_client_history(p_client uuid,p_before date DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.can_use_traffic_weekly(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Sem acesso ao histórico deste cliente.'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
    'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
    'action_title',a.title,'action_assignee_ids',a.assignee_ids,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
    'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC)
    FROM (SELECT * FROM public.traffic_weekly_reviews WHERE client_id=p_client AND (p_before IS NULL OR week_start<p_before)
      ORDER BY week_start DESC LIMIT greatest(1,least(coalesce(p_limit,30),100))) r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
    LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
    LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status),'[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
