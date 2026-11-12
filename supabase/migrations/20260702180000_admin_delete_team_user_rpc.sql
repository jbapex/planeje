-- Limpeza de dados antes de remover usuário interno (admin/colaborador).
-- Chamada apenas pela edge function admin-delete-team-user (service role).

CREATE OR REPLACE FUNCTION public.admin_cleanup_team_user(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório';
  END IF;

  -- Tarefas: remove dos responsáveis
  UPDATE public.tarefas
  SET assignee_ids = array_remove(assignee_ids, p_target_id)
  WHERE p_target_id = ANY(assignee_ids);

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tarefas' AND column_name = 'owner_id'
  ) THEN
    UPDATE public.tarefas SET owner_id = NULL WHERE owner_id = p_target_id;
  END IF;

  DELETE FROM public.user_module_permissions WHERE user_id = p_target_id;
  DELETE FROM public.user_module_access WHERE user_id = p_target_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notificacao_preferencias_usuario'
  ) THEN
    DELETE FROM public.notificacao_preferencias_usuario WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_notifications'
  ) THEN
    DELETE FROM public.whatsapp_notifications WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'atendimento_usuario_acesso'
  ) THEN
    DELETE FROM public.atendimento_usuario_acesso WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_automations'
  ) THEN
    DELETE FROM public.task_automations WHERE owner_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assistant_project_conversations'
  ) THEN
    DELETE FROM public.assistant_project_conversations WHERE owner_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_comments'
  ) THEN
    DELETE FROM public.task_comments WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'responsavel_id'
  ) THEN
    UPDATE public.leads SET responsavel_id = NULL WHERE responsavel_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'atendimento_conversas'
  ) THEN
    UPDATE public.atendimento_conversas SET assigned_to = NULL WHERE assigned_to = p_target_id;
    UPDATE public.atendimento_conversas SET resolved_by = NULL WHERE resolved_by = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'atendimento_conversa_planejamento'
  ) THEN
    UPDATE public.atendimento_conversa_planejamento SET assignee_id = NULL WHERE assignee_id = p_target_id;
    UPDATE public.atendimento_conversa_planejamento SET created_by = NULL WHERE created_by = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'atendimento_conversa_favorita'
  ) THEN
    DELETE FROM public.atendimento_conversa_favorita WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_learning_feedback'
  ) THEN
    DELETE FROM public.ai_learning_feedback WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_user_preferences'
  ) THEN
    DELETE FROM public.ai_user_preferences WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_reference_examples'
  ) THEN
    DELETE FROM public.ai_reference_examples WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_learned_patterns' AND column_name = 'user_id'
  ) THEN
    DELETE FROM public.ai_learned_patterns WHERE user_id = p_target_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_documents' AND column_name = 'owner_id'
  ) THEN
    UPDATE public.client_documents SET owner_id = NULL WHERE owner_id = p_target_id;
  END IF;

  DELETE FROM public.profiles WHERE id = p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cleanup_team_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_team_user(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_cleanup_team_user(uuid) IS
  'Remove vínculos do usuário interno antes de auth.admin.deleteUser. Apenas service_role.';
