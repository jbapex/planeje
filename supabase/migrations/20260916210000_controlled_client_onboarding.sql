BEGIN;

CREATE TABLE public.client_onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  stages jsonb NOT NULL CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) BETWEEN 1 AND 30),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX client_onboarding_template_name ON public.client_onboarding_templates(lower(name));

CREATE TABLE public.client_onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES public.client_onboarding_templates(id) ON DELETE RESTRICT,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX client_onboarding_one_active ON public.client_onboardings(client_id) WHERE status = 'active';

CREATE TABLE public.client_onboarding_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.client_onboardings(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 30),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 150),
  instructions text NOT NULL DEFAULT '',
  pending_side text NOT NULL CHECK (pending_side IN ('internal','client')),
  sla_days integer NOT NULL CHECK (sla_days BETWEEN 0 AND 365),
  assignee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'locked' CHECK (state IN ('locked','active','completed')),
  task_id uuid UNIQUE REFERENCES public.tarefas(id) ON DELETE RESTRICT,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (onboarding_id, position)
);
CREATE UNIQUE INDEX client_onboarding_one_current_stage ON public.client_onboarding_stages(onboarding_id) WHERE state='active';

CREATE FUNCTION public.can_use_client_onboarding() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('admin','superadmin','colaborador')
  );
$$;
REVOKE ALL ON FUNCTION public.can_use_client_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_client_onboarding() TO authenticated, service_role;

ALTER TABLE public.client_onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_onboarding_templates, public.client_onboardings, public.client_onboarding_stages FROM anon, authenticated;
GRANT SELECT ON public.client_onboarding_templates, public.client_onboardings, public.client_onboarding_stages TO authenticated;
GRANT ALL ON public.client_onboarding_templates, public.client_onboardings, public.client_onboarding_stages TO service_role;
CREATE POLICY onboarding_templates_staff_read ON public.client_onboarding_templates FOR SELECT TO authenticated USING ((SELECT public.can_use_client_onboarding()));
CREATE POLICY onboardings_staff_read ON public.client_onboardings FOR SELECT TO authenticated USING ((SELECT public.can_use_client_onboarding()));
CREATE POLICY onboarding_stages_staff_read ON public.client_onboarding_stages FOR SELECT TO authenticated USING ((SELECT public.can_use_client_onboarding()));

CREATE FUNCTION public.save_client_onboarding_template(p_id uuid, p_name text, p_stages jsonb, p_active boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage jsonb; v_id uuid;
BEGIN
  IF NOT public.can_use_client_onboarding() OR NOT public.can_manage_task_operational_functions() THEN
    RAISE EXCEPTION 'Somente gestores podem configurar o onboarding.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_stages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_stages) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Configure entre 1 e 30 etapas.';
  END IF;
  FOR v_stage IN SELECT value FROM jsonb_array_elements(p_stages) LOOP
    IF length(btrim(coalesce(v_stage->>'title',''))) NOT BETWEEN 2 AND 150
      OR coalesce(v_stage->>'pending_side','') NOT IN ('internal','client')
      OR coalesce(v_stage->>'sla_days','') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'Cada etapa precisa de título, parte responsável e prazo em dias úteis.';
    END IF;
    IF (v_stage->>'sla_days')::integer > 365 THEN RAISE EXCEPTION 'O prazo máximo é de 365 dias úteis.'; END IF;
    IF nullif(v_stage->>'assignee_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id=(v_stage->>'assignee_id')::uuid AND status='active' AND role IN ('admin','superadmin','colaborador')
    ) THEN RAISE EXCEPTION 'Selecione um responsável ativo da equipe.'; END IF;
  END LOOP;
  IF p_id IS NULL THEN
    INSERT INTO public.client_onboarding_templates(name,stages,is_active) VALUES (btrim(p_name),p_stages,p_active) RETURNING id INTO v_id;
  ELSE
    UPDATE public.client_onboarding_templates SET name=btrim(p_name),stages=p_stages,is_active=p_active,updated_at=clock_timestamp()
      WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Modelo não encontrado.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- Activation is atomic with the previous completion. Future stages have no task or ticking deadline.
CREATE FUNCTION planeje_private.activate_client_onboarding_stage(p_stage uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage public.client_onboarding_stages%ROWTYPE; v_run public.client_onboardings%ROWTYPE; v_task uuid; v_company text;
BEGIN
  SELECT * INTO STRICT v_stage FROM public.client_onboarding_stages WHERE id=p_stage FOR UPDATE;
  IF v_stage.task_id IS NOT NULL THEN RETURN v_stage.task_id; END IF;
  SELECT * INTO STRICT v_run FROM public.client_onboardings WHERE id=v_stage.onboarding_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_stage.assignee_id AND status='active' AND role IN ('admin','superadmin','colaborador')) THEN
    RAISE EXCEPTION 'A próxima etapa está sem um responsável ativo. Ajuste o responsável antes de avançar.';
  END IF;
  SELECT empresa INTO v_company FROM public.clientes WHERE id=v_run.client_id;
  INSERT INTO public.tarefas(title,description,status,type,priority,client_id,owner_id,assignee_ids,due_date,demand_type,demand_origin,sla_days)
    VALUES ('['||coalesce(v_company,'Cliente')||'] Onboarding · '||v_stage.title,v_stage.instructions,
      'todo','onboarding','medium',v_run.client_id,v_run.created_by,ARRAY[v_stage.assignee_id],
      (public.calculate_task_stage_deadline(clock_timestamp(),v_stage.sla_days) AT TIME ZONE 'America/Sao_Paulo')::date,
      'planned','internal',v_stage.sla_days) RETURNING id INTO v_task;
  UPDATE public.client_onboarding_stages SET state='active',task_id=v_task,started_at=clock_timestamp() WHERE id=p_stage;
  RETURN v_task;
END;
$$;
REVOKE ALL ON FUNCTION planeje_private.activate_client_onboarding_stage(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.start_client_onboarding(p_client uuid, p_template uuid, p_assignee uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_template public.client_onboarding_templates%ROWTYPE; v_id uuid; v_first uuid;
BEGIN
  IF NOT public.can_use_client_onboarding() OR NOT public.can_manage_task_operational_functions() THEN
    RAISE EXCEPTION 'Somente gestores podem iniciar o onboarding.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_onboarding:'||p_client::text,0));
  SELECT id INTO v_id FROM public.client_onboardings WHERE client_id=p_client AND status='active';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_template FROM public.client_onboarding_templates WHERE id=p_template AND is_active;
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'Selecione um modelo ativo.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id=p_client) THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_assignee AND status='active' AND role IN ('admin','superadmin','colaborador')) THEN
    RAISE EXCEPTION 'Selecione um responsável ativo da equipe.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_template.stages) stage
    WHERE nullif(stage->>'assignee_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id=(stage->>'assignee_id')::uuid AND status='active' AND role IN ('admin','superadmin','colaborador')
    )) THEN RAISE EXCEPTION 'O modelo contém um responsável indisponível. Ajuste o modelo antes de iniciar.'; END IF;
  INSERT INTO public.client_onboardings(client_id,template_id,template_name) VALUES (p_client,p_template,v_template.name) RETURNING id INTO v_id;
  INSERT INTO public.client_onboarding_stages(onboarding_id,position,title,instructions,pending_side,sla_days,assignee_id)
    SELECT v_id,ordinality,btrim(value->>'title'),coalesce(value->>'instructions',''),value->>'pending_side',(value->>'sla_days')::integer,
      coalesce(nullif(value->>'assignee_id','')::uuid,p_assignee)
    FROM jsonb_array_elements(v_template.stages) WITH ORDINALITY;
  SELECT id INTO v_first FROM public.client_onboarding_stages WHERE onboarding_id=v_id AND position=1;
  PERFORM planeje_private.activate_client_onboarding_stage(v_first);
  RETURN v_id;
END;
$$;

CREATE FUNCTION planeje_private.advance_client_onboarding_from_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage public.client_onboarding_stages%ROWTYPE; v_next uuid; v_terminal boolean;
BEGIN
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE task_id=OLD.id;
  IF v_stage.id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.can_use_client_onboarding() THEN
    RAISE EXCEPTION 'Apenas a equipe pode alterar tarefas do onboarding.' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_manage_task_operational_functions() AND NOT (auth.uid()=ANY(coalesce(OLD.assignee_ids,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode alterar esta etapa.' USING ERRCODE='42501';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.type IS DISTINCT FROM 'onboarding'
    OR NEW.project_id IS NOT NULL OR NEW.workflow_template_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta tarefa pertence ao onboarding. Mantenha o cliente e o tipo.';
  END IF;
  IF cardinality(coalesce(NEW.assignee_ids,'{}'::uuid[])) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=NEW.assignee_ids[1] AND status='active' AND role IN ('admin','superadmin','colaborador')
  ) OR NEW.due_date IS NULL THEN
    RAISE EXCEPTION 'A etapa precisa de um responsável ativo e de prazo.';
  END IF;
  SELECT coalesce(bool_or(is_terminal),false) INTO v_terminal FROM public.task_statuses WHERE value=NEW.status;
  v_terminal := v_terminal OR NEW.status IN ('completed','done','published');
  IF v_stage.state='completed' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Esta etapa já foi concluída. A próxima etapa está no onboarding.'; END IF;
    RETURN NEW;
  END IF;
  IF NOT v_terminal OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.client_onboardings WHERE id=v_stage.onboarding_id FOR UPDATE;
  SELECT * INTO STRICT v_stage FROM public.client_onboarding_stages WHERE id=v_stage.id FOR UPDATE;
  IF v_stage.state <> 'active' THEN RETURN NEW; END IF;
  UPDATE public.client_onboarding_stages SET state='completed',completed_at=clock_timestamp(),completed_by=auth.uid() WHERE id=v_stage.id;
  SELECT id INTO v_next FROM public.client_onboarding_stages WHERE onboarding_id=v_stage.onboarding_id AND state='locked' ORDER BY position LIMIT 1;
  IF v_next IS NOT NULL THEN
    PERFORM planeje_private.activate_client_onboarding_stage(v_next);
  ELSE
    UPDATE public.client_onboardings SET status='completed',completed_at=clock_timestamp() WHERE id=v_stage.onboarding_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION planeje_private.advance_client_onboarding_from_task() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER z_onboarding_advance_from_task AFTER UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.advance_client_onboarding_from_task();

CREATE FUNCTION public.complete_client_onboarding_stage(p_stage uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage public.client_onboarding_stages%ROWTYPE;
BEGIN
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE id=p_stage;
  IF v_stage.id IS NULL THEN RAISE EXCEPTION 'Etapa não encontrada.'; END IF;
  IF NOT public.can_use_client_onboarding() OR (NOT public.can_manage_task_operational_functions() AND v_stage.assignee_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode concluir esta etapa.' USING ERRCODE='42501';
  END IF;
  IF v_stage.state='completed' THEN RETURN v_stage.onboarding_id; END IF;
  IF v_stage.state <> 'active' OR v_stage.task_id IS NULL THEN RAISE EXCEPTION 'Conclua a etapa atual antes desta.'; END IF;
  UPDATE public.tarefas SET status='completed' WHERE id=v_stage.task_id;
  RETURN v_stage.onboarding_id;
END;
$$;

CREATE FUNCTION public.update_client_onboarding_stage(p_stage uuid, p_assignee uuid, p_side text, p_days integer, p_due date, p_instructions text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage public.client_onboarding_stages%ROWTYPE;
BEGIN
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE id=p_stage FOR UPDATE;
  IF v_stage.id IS NULL THEN RAISE EXCEPTION 'Etapa não encontrada.'; END IF;
  IF NOT public.can_use_client_onboarding() OR (NOT public.can_manage_task_operational_functions() AND v_stage.assignee_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode ajustar esta etapa.' USING ERRCODE='42501';
  END IF;
  IF v_stage.state='completed' THEN RAISE EXCEPTION 'Etapa já concluída.'; END IF;
  IF p_side NOT IN ('client','internal') OR p_side IS NULL OR p_days IS NULL OR p_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION 'Informe a parte responsável e o prazo em dias úteis.';
  END IF;
  IF v_stage.state='active' AND p_due IS NULL THEN RAISE EXCEPTION 'A etapa ativa precisa de prazo.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_assignee AND status='active' AND role IN ('admin','superadmin','colaborador')) THEN
    RAISE EXCEPTION 'Selecione um responsável ativo da equipe.';
  END IF;
  -- Update the canonical task before the snapshot, so the old assignee still authorizes this change.
  IF v_stage.task_id IS NOT NULL THEN
    UPDATE public.tarefas SET assignee_ids=ARRAY[p_assignee],due_date=p_due,description=coalesce(p_instructions,''),sla_days=p_days WHERE id=v_stage.task_id;
  END IF;
  UPDATE public.client_onboarding_stages SET assignee_id=p_assignee,pending_side=p_side,sla_days=p_days,instructions=coalesce(p_instructions,'') WHERE id=p_stage;
END;
$$;

-- Direct edits in Tarefas remain visible in onboarding; no second execution record.
CREATE FUNCTION planeje_private.sync_client_onboarding_task_details()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.client_onboarding_stages SET instructions=coalesce(NEW.description,''),
    assignee_id=coalesce(NEW.assignee_ids[1],assignee_id)
    WHERE task_id=NEW.id AND state='active';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION planeje_private.sync_client_onboarding_task_details() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER zz_onboarding_sync_task AFTER UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.sync_client_onboarding_task_details();

REVOKE ALL ON FUNCTION public.save_client_onboarding_template(uuid,text,jsonb,boolean), public.start_client_onboarding(uuid,uuid,uuid),
  public.complete_client_onboarding_stage(uuid), public.update_client_onboarding_stage(uuid,uuid,text,integer,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_onboarding_template(uuid,text,jsonb,boolean), public.start_client_onboarding(uuid,uuid,uuid),
  public.complete_client_onboarding_stage(uuid), public.update_client_onboarding_stage(uuid,uuid,text,integer,date,text) TO authenticated;

INSERT INTO public.task_statuses(value,label,color,sort_order,is_initial,is_terminal)
  SELECT 'completed','Concluído','#059669',99,false,true WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses WHERE value='completed');
-- Generic completion is for operational tasks; content keeps the evidenced-publication gate.
CREATE FUNCTION planeje_private.guard_generic_task_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.status='completed' AND lower(coalesce(NEW.type,'')) IN ('arte','carrossel','video','reels','post','posts','story','stories','design','social_media','anuncio','anuncios') THEN
    RAISE EXCEPTION 'Para concluir conteúdo, use Publicado e confirme as publicações por canal.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION planeje_private.guard_generic_task_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a0_guard_generic_task_completion BEFORE INSERT OR UPDATE OF status,type ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.guard_generic_task_completion();
INSERT INTO public.client_onboarding_templates(name,stages) VALUES ('Entrada de cliente',jsonb_build_array(
  jsonb_build_object('title','Alinhar objetivos e escopo','instructions','Confirme com o cliente o objetivo do trabalho, o escopo contratado e quem aprova. Registre o combinado na ficha do cliente.','pending_side','internal','sla_days',2),
  jsonb_build_object('title','Receber informações e acessos','instructions','Solicite e confira as informações, materiais e acessos necessários para iniciar o trabalho. Registre aqui o que ainda depende do cliente.','pending_side','client','sla_days',3),
  jsonb_build_object('title','Organizar a operação','instructions','Confira a ficha do cliente, o escopo e os responsáveis. Organize a rotina de trabalho e o início do primeiro planejamento.','pending_side','internal','sla_days',2),
  jsonb_build_object('title','Confirmar início com o cliente','instructions','Confirme com o cliente a rotina, os responsáveis, as datas combinadas e onde ele acompanhará as aprovações.','pending_side','client','sla_days',2)
));
NOTIFY pgrst,'reload schema';
COMMIT;
