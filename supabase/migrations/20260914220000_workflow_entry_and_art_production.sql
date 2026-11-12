-- Fase 4 — preservar a entrada A Fazer e usar Em Produção para a criação da arte.

DO $$
DECLARE
  f_plan uuid;
  f_script uuid;
  f_design uuid;
  f_edit uuid;
  f_review uuid;
  f_validate uuid;
  f_client uuid;
  f_post uuid;
  scheduled_status text;
BEGIN
  SELECT id INTO STRICT f_plan FROM public.task_operational_functions WHERE lower(name) = lower('Planejamento e briefing');
  SELECT id INTO STRICT f_script FROM public.task_operational_functions WHERE lower(name) = lower('Roteiro e gravação');
  SELECT id INTO STRICT f_design FROM public.task_operational_functions WHERE lower(name) = lower('Design');
  SELECT id INTO STRICT f_edit FROM public.task_operational_functions WHERE lower(name) = lower('Edição');
  SELECT id INTO STRICT f_review FROM public.task_operational_functions WHERE lower(name) = lower('Revisão interna');
  SELECT id INTO STRICT f_validate FROM public.task_operational_functions WHERE lower(name) = lower('Validação interna');
  SELECT id INTO STRICT f_client FROM public.task_operational_functions WHERE lower(name) = lower('Aprovação com cliente');
  SELECT id INTO STRICT f_post FROM public.task_operational_functions WHERE lower(name) = lower('Postagem');
  SELECT value INTO STRICT scheduled_status FROM public.task_statuses WHERE lower(label) = 'agendado' ORDER BY sort_order NULLS LAST LIMIT 1;

  UPDATE public.task_workflow_templates
  SET stages = jsonb_build_array(
    jsonb_build_object('key','backlog','label','A Fazer','status_value','todo','function_id',f_plan,'kind','backlog'),
    jsonb_build_object('key','briefing','label','Briefing','status_value','briefing','function_id',f_plan,'kind','planning'),
    jsonb_build_object('key','art_production','label','Produção da arte','status_value','production','function_id',f_design,'kind','production'),
    jsonb_build_object('key','review','label','Revisão interna','status_value','review','function_id',f_review,'kind','review'),
    jsonb_build_object('key','validation','label','Validação Josias','status_value','josias','function_id',f_validate,'kind','validation'),
    jsonb_build_object('key','send_client','label','Enviar ao cliente','status_value','approve','function_id',f_client,'kind','client'),
    jsonb_build_object('key','waiting_client','label','Aguardando cliente','status_value','aguardando_aprovação','function_id',f_client,'kind','client'),
    jsonb_build_object('key','schedule','label','Preparar postagem','status_value','agendar','function_id',f_post,'kind','publishing'),
    jsonb_build_object('key','scheduled','label','Agendado','status_value',scheduled_status,'function_id',f_post,'kind','publishing'),
    jsonb_build_object('key','published','label','Publicado com evidência','status_value','published','function_id',f_post,'kind','complete')
  ), updated_at = clock_timestamp()
  WHERE lower(name) = lower('Conteúdo — Arte e carrossel');

  UPDATE public.task_workflow_templates
  SET stages = jsonb_build_array(
    jsonb_build_object('key','backlog','label','A Fazer','status_value','todo','function_id',f_plan,'kind','backlog'),
    jsonb_build_object('key','briefing','label','Briefing','status_value','briefing','function_id',f_plan,'kind','planning'),
    jsonb_build_object('key','script','label','Roteiro','status_value','roteiro','function_id',f_script,'kind','production'),
    jsonb_build_object('key','script_review','label','Aprovação interna do roteiro','status_value','aprovacao_roteiro','function_id',f_review,'kind','review'),
    jsonb_build_object('key','recording','label','Gravação','status_value','gravacao','function_id',f_script,'kind','production'),
    jsonb_build_object('key','editing','label','Edição','status_value','edicao','function_id',f_edit,'kind','production'),
    jsonb_build_object('key','review','label','Revisão do material','status_value','review','function_id',f_review,'kind','review'),
    jsonb_build_object('key','validation','label','Validação Josias','status_value','josias','function_id',f_validate,'kind','validation'),
    jsonb_build_object('key','send_client','label','Enviar ao cliente','status_value','approve','function_id',f_client,'kind','client'),
    jsonb_build_object('key','waiting_client','label','Aguardando cliente','status_value','aguardando_aprovação','function_id',f_client,'kind','client'),
    jsonb_build_object('key','schedule','label','Preparar postagem','status_value','agendar','function_id',f_post,'kind','publishing'),
    jsonb_build_object('key','scheduled','label','Agendado','status_value',scheduled_status,'function_id',f_post,'kind','publishing'),
    jsonb_build_object('key','published','label','Publicado com evidência','status_value','published','function_id',f_post,'kind','complete')
  ), updated_at = clock_timestamp()
  WHERE lower(name) = lower('Conteúdo — Vídeo e reels');
END $$;

-- A coluna criada apenas para o primeiro desenho do fluxo não será usada.
DELETE FROM public.task_statuses s
WHERE s.value = 'design'
  AND NOT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.status = s.value);

NOTIFY pgrst, 'reload schema';
