-- RPC usada pela automação "Mover para Redes Sociais (Concluído)".
-- assignee_ids em tarefas é uuid[] neste projeto (não jsonb).

CREATE OR REPLACE FUNCTION public.move_task_to_social_media(task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tarefas
  SET
    type = 'social_media',
    status = 'completed',
    assignee_ids = ARRAY[]::uuid[]
  WHERE id = task_id;
END;
$$;

COMMENT ON FUNCTION public.move_task_to_social_media(uuid) IS
  'Automação de tarefas: envia a linha para o módulo Redes Sociais como concluída e zera responsáveis.';

GRANT EXECUTE ON FUNCTION public.move_task_to_social_media(uuid) TO authenticated;

-- Se no seu banco assignee_ids for jsonb, use: assignee_ids = '[]'::jsonb
