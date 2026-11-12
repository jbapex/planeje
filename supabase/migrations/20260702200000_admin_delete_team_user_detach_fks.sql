-- Desvincula dinamicamente todas as FKs para profiles (exceto CASCADE).
-- Evita bloqueios como client_checklists_owner_id_fkey ao excluir usuário interno.

CREATE OR REPLACE FUNCTION public.admin_nullify_profile_references(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fk RECORD;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;

  FOR fk IN
    SELECT
      c.conrelid::regclass::text AS tbl,
      a.attname AS col_name,
      c.confdeltype AS del_type
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
     AND NOT a.attisdropped
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.conrelid <> 'public.profiles'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    -- c = CASCADE — será resolvido ao apagar o perfil
    IF fk.del_type = 'c' THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', fk.tbl, fk.col_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    EXECUTE format(
      'UPDATE %s SET %I = NULL WHERE %I = $1',
      fk.tbl, fk.col_name, fk.col_name
    ) USING p_profile_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_nullify_profile_references(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_nullify_profile_references(uuid) TO service_role;

-- Referências órfãs (perfil já apagado) impedem recriar FKs
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT
      c.conrelid::regclass::text AS tbl,
      a.attname AS col_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
     AND NOT a.attisdropped
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.conrelid <> 'public.profiles'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', fk.tbl, fk.col_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    EXECUTE format(
      'UPDATE %s t SET %I = NULL WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.%I)',
      fk.tbl, fk.col_name, fk.col_name, fk.col_name
    );
  END LOOP;
END $$;

-- owner_id: ON DELETE SET NULL (só a FK da coluna owner_id, não assignee_id etc.)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'client_documents',
    'client_checklists',
    'cliente_briefings',
    'clientes',
    'projetos',
    'tarefas',
    'solicitacoes',
    'task_solicitations',
    'paid_campaigns',
    'task_statuses'
  ];
  con record;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'owner_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id DROP NOT NULL', t);

    EXECUTE format(
      'UPDATE public.%I SET owner_id = NULL WHERE owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = %I.owner_id)',
      t, t
    );

    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = c.conkey[1]
       AND NOT a.attisdropped
      WHERE nsp.nspname = 'public'
        AND rel.relname = t
        AND c.contype = 'f'
        AND c.confrelid = 'public.profiles'::regclass
        AND a.attname = 'owner_id'
        AND array_length(c.conkey, 1) = 1
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con.conname);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL',
        t, con.conname
      );
    END LOOP;
  END LOOP;
END $$;

-- Se a execução anterior falhou no meio, paid_campaigns pode ter perdido a FK de assignee_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'paid_campaigns' AND column_name = 'assignee_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paid_campaigns_assignee_id_fkey'
  ) THEN
    ALTER TABLE public.paid_campaigns ALTER COLUMN assignee_id DROP NOT NULL;

    UPDATE public.paid_campaigns t
    SET assignee_id = NULL
    WHERE assignee_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.assignee_id);

    ALTER TABLE public.paid_campaigns
      ADD CONSTRAINT paid_campaigns_assignee_id_fkey
      FOREIGN KEY (assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

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

  UPDATE public.tarefas
  SET assignee_ids = array_remove(assignee_ids, p_target_id)
  WHERE p_target_id = ANY(assignee_ids);

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

  PERFORM public.admin_nullify_profile_references(p_target_id);

  DELETE FROM public.profiles WHERE id = p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cleanup_team_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_team_user(uuid) TO service_role;
