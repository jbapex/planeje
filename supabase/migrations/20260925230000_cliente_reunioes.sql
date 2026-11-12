-- Reuniões da agência com o cliente, e as falas lidas da legenda do Meet.
BEGIN;

CREATE TABLE public.cliente_reunioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 2 AND 140),
  marcada_para timestamptz,
  meet_code text,
  status text NOT NULL DEFAULT 'marcada' CHECK (status IN ('marcada', 'em_andamento', 'transcrita')),
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT cliente_reunioes_meet_code_formato
    CHECK (meet_code IS NULL OR meet_code ~ '^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$')
);

CREATE UNIQUE INDEX cliente_reunioes_meet_code_unico
  ON public.cliente_reunioes (meet_code)
  WHERE meet_code IS NOT NULL;

CREATE INDEX cliente_reunioes_cliente_idx
  ON public.cliente_reunioes (cliente_id, created_at DESC);

CREATE TABLE public.cliente_reuniao_falas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id uuid NOT NULL REFERENCES public.cliente_reunioes(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem >= 0),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 4000),
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (reuniao_id, ordem)
);

CREATE INDEX cliente_reuniao_falas_reuniao_idx
  ON public.cliente_reuniao_falas (reuniao_id, ordem);

CREATE FUNCTION public.can_use_cliente_reunioes() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'superadmin', 'colaborador')
  );
$$;

REVOKE ALL ON FUNCTION public.can_use_cliente_reunioes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_cliente_reunioes() TO authenticated, service_role;

CREATE FUNCTION public.cliente_reunioes_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      RAISE EXCEPTION 'A reunião permanece neste cliente.' USING ERRCODE = '42501';
    END IF;
    IF OLD.meet_code IS NOT NULL AND NEW.meet_code IS DISTINCT FROM OLD.meet_code THEN
      RAISE EXCEPTION 'O link desta reunião já foi definido.' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at = clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cliente_reunioes_guard
  BEFORE UPDATE ON public.cliente_reunioes
  FOR EACH ROW EXECUTE FUNCTION public.cliente_reunioes_guard();

CREATE FUNCTION public.vincular_cliente_reuniao_meet(p_id uuid, p_code text)
RETURNS public.cliente_reunioes
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_row public.cliente_reunioes;
  v_code text := lower(btrim(coalesce(p_code, '')));
BEGIN
  IF NOT public.can_use_cliente_reunioes() THEN
    RAISE EXCEPTION 'Sem permissão para reuniões.' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$' THEN
    RAISE EXCEPTION 'Link do Meet inválido.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.cliente_reunioes
     SET meet_code = v_code,
         status = CASE WHEN status = 'marcada' THEN 'em_andamento' ELSE status END,
         iniciada_em = coalesce(iniciada_em, clock_timestamp())
   WHERE id = p_id
     AND created_by = auth.uid()
     AND meet_code IS NULL
     AND created_at > clock_timestamp() - interval '3 hours'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Não há reunião sua aguardando este link.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_cliente_reuniao_meet(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_cliente_reuniao_meet(uuid, text) TO authenticated, service_role;

ALTER TABLE public.cliente_reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_reuniao_falas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cliente_reunioes, public.cliente_reuniao_falas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_reunioes, public.cliente_reuniao_falas TO authenticated;
GRANT ALL ON public.cliente_reunioes, public.cliente_reuniao_falas TO service_role;

CREATE POLICY cliente_reunioes_staff_select ON public.cliente_reunioes
  FOR SELECT TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reunioes_staff_insert ON public.cliente_reunioes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.can_use_cliente_reunioes())
    AND created_by = auth.uid()
  );

CREATE POLICY cliente_reunioes_staff_update ON public.cliente_reunioes
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()))
  WITH CHECK ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reunioes_staff_delete ON public.cliente_reunioes
  FOR DELETE TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reuniao_falas_staff_select ON public.cliente_reuniao_falas
  FOR SELECT TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reuniao_falas_staff_insert ON public.cliente_reuniao_falas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reuniao_falas_staff_update ON public.cliente_reuniao_falas
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()))
  WITH CHECK ((SELECT public.can_use_cliente_reunioes()));

CREATE POLICY cliente_reuniao_falas_staff_delete ON public.cliente_reuniao_falas
  FOR DELETE TO authenticated
  USING ((SELECT public.can_use_cliente_reunioes()));

COMMIT;

NOTIFY pgrst, 'reload schema';
