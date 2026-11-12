-- Fixtures ANTERIORES à migration da Central de Tráfego — Fase 1.
-- Executar SOMENTE em banco descartável restaurado do dump, ANTES de
-- supabase/migrations/20260826010000_central_trafego_fase1.sql.
-- NÃO executar em produção.
--
-- Marca: empresa/title/name começam com __ct_fase1_
-- Este arquivo COMMITA. Não é substituto da migration nem do backfill.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_status text;
  v_camp_status text;
  v_client_a uuid;
  v_client_b uuid;
  v_task_alta uuid;
  v_task_media uuid;
  v_task_null uuid;
  v_task_legacy uuid;
  v_task_other uuid;
  v_type_other text;
BEGIN
  SELECT id INTO v_owner
  FROM public.profiles
  WHERE role IN ('superadmin', 'admin', 'colaborador')
  LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'fixture pre: dump sem perfil interno';
  END IF;

  SELECT value INTO v_status FROM public.task_statuses WHERE value = 'todo';
  IF v_status IS NULL THEN
    SELECT value INTO v_status FROM public.task_statuses ORDER BY value LIMIT 1;
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'fixture pre: dump sem task_statuses';
  END IF;

  SELECT value INTO v_camp_status FROM public.paid_campaign_statuses WHERE value = 'planning';
  IF v_camp_status IS NULL THEN
    SELECT value INTO v_camp_status FROM public.paid_campaign_statuses ORDER BY value LIMIT 1;
  END IF;
  IF v_camp_status IS NULL THEN
    RAISE EXCEPTION 'fixture pre: dump sem paid_campaign_statuses';
  END IF;

  SELECT type INTO v_type_other
  FROM public.tarefas
  WHERE type IS DISTINCT FROM 'paid_traffic'
  LIMIT 1;
  IF v_type_other IS NULL THEN
    v_type_other := 'geral';
  END IF;

  DELETE FROM public.tarefas WHERE title LIKE '__ct_fase1_%';
  DELETE FROM public.paid_campaigns WHERE name LIKE '__ct_fase1_%';
  DELETE FROM public.clientes WHERE empresa LIKE '__ct_fase1_%';

  INSERT INTO public.clientes (empresa)
  VALUES ('__ct_fase1_client_a')
  RETURNING id INTO v_client_a;

  INSERT INTO public.clientes (empresa)
  VALUES ('__ct_fase1_client_b')
  RETURNING id INTO v_client_b;

  INSERT INTO public.tarefas (title, client_id, type, status, due_date, priority, owner_id, assignee_ids)
  VALUES ('__ct_fase1_task_alta', v_client_a, 'paid_traffic', v_status, CURRENT_DATE, 'alta', v_owner, ARRAY[v_owner])
  RETURNING id INTO v_task_alta;

  INSERT INTO public.tarefas (title, client_id, type, status, due_date, priority, owner_id, assignee_ids)
  VALUES ('__ct_fase1_task_media', v_client_a, 'paid_traffic', v_status, CURRENT_DATE, 'media', v_owner, ARRAY[v_owner])
  RETURNING id INTO v_task_media;

  INSERT INTO public.tarefas (title, client_id, type, status, due_date, priority, owner_id, assignee_ids)
  VALUES ('__ct_fase1_task_nullprio', v_client_a, 'paid_traffic', v_status, CURRENT_DATE, NULL, v_owner, ARRAY[v_owner])
  RETURNING id INTO v_task_null;

  INSERT INTO public.tarefas (title, client_id, type, status, due_date, priority, owner_id, assignee_ids)
  VALUES ('__ct_fase1_task_legacy', v_client_a, 'paid_traffic', v_status, CURRENT_DATE, 'medium', v_owner, ARRAY[v_owner])
  RETURNING id INTO v_task_legacy;

  INSERT INTO public.tarefas (title, client_id, type, status, due_date, priority, owner_id, assignee_ids)
  VALUES ('__ct_fase1_task_nao_trafego', v_client_a, v_type_other, v_status, CURRENT_DATE, 'medium', v_owner, ARRAY[v_owner])
  RETURNING id INTO v_task_other;

  IF v_task_other IS NULL THEN
    RAISE EXCEPTION 'fixture pre: não criou tarefa não-tráfego';
  END IF;

  INSERT INTO public.paid_campaigns (name, client_id, owner_id, status, ad_sets, kpis)
  VALUES (
    '__ct_fase1_camp_uuid_invalido',
    v_client_a,
    v_owner,
    v_camp_status,
    jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'name', 'set-invalido',
      'ads', jsonb_build_array(jsonb_build_object('task_id', 'nao-uuid'))
    )),
    '[]'::jsonb
  );

  INSERT INTO public.paid_campaigns (name, client_id, owner_id, status, ad_sets, kpis)
  VALUES (
    '__ct_fase1_camp_legacy_ok',
    v_client_a,
    v_owner,
    v_camp_status,
    jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'name', 'set-legado',
      'ads', jsonb_build_array(jsonb_build_object('task_id', v_task_legacy::text))
    )),
    '[]'::jsonb
  );

  INSERT INTO public.paid_campaigns (name, client_id, owner_id, status, ad_sets, kpis)
  VALUES (
    '__ct_fase1_camp_b',
    v_client_b,
    v_owner,
    v_camp_status,
    '[]'::jsonb,
    '[]'::jsonb
  );

  INSERT INTO public.paid_campaigns (name, client_id, owner_id, status, ad_sets, kpis)
  VALUES (
    '__ct_fase1_camp_orfao',
    v_client_a,
    v_owner,
    v_camp_status,
    '[]'::jsonb,
    '[]'::jsonb
  );
END $$;

COMMIT;
