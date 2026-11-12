BEGIN;

CREATE TABLE public.cliente_etiquetas (
  chave text PRIMARY KEY CHECK (chave ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX cliente_etiquetas_nome_lower ON public.cliente_etiquetas (lower(btrim(nome)));

INSERT INTO public.cliente_etiquetas (chave, nome) VALUES
  ('vip', 'VIP'),
  ('inativo', 'Inativo'),
  ('novo', 'Novo')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.cliente_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY cliente_etiquetas_read ON public.cliente_etiquetas
  FOR SELECT TO authenticated
  USING (public.get_my_role() IS NOT NULL AND public.get_my_role() <> 'cliente');

CREATE POLICY cliente_etiquetas_insert ON public.cliente_etiquetas
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'colaborador'));

REVOKE ALL ON public.cliente_etiquetas FROM authenticated, anon;
GRANT SELECT, INSERT ON public.cliente_etiquetas TO authenticated;
GRANT ALL ON public.cliente_etiquetas TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
