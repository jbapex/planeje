-- Plataformas de conteúdo (cadastro superadmin) + coluna em tarefas

CREATE TABLE IF NOT EXISTS public.plataformas_conteudo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plataformas_conteudo_nome_unique UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS plataformas_conteudo_sort_idx ON public.plataformas_conteudo (sort_order, nome);

INSERT INTO public.plataformas_conteudo (nome, sort_order, ativo) VALUES
  ('Instagram', 10, true),
  ('TikTok', 20, true),
  ('YouTube', 30, true),
  ('Facebook', 40, true),
  ('LinkedIn', 50, true),
  ('Kwai', 60, true),
  ('Outro', 100, true)
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS plataforma text;

COMMENT ON TABLE public.plataformas_conteudo IS 'Redes/plataformas para materiais de campanha e tarefas; CRUD apenas superadmin.';
COMMENT ON COLUMN public.tarefas.plataforma IS 'Plataforma de publicação (texto livre alinhado a plataformas_conteudo.nome).';

ALTER TABLE public.plataformas_conteudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plataformas_conteudo_select_authenticated"
  ON public.plataformas_conteudo FOR SELECT TO authenticated
  USING (
    ativo = true
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

CREATE POLICY "plataformas_conteudo_superadmin_insert"
  ON public.plataformas_conteudo FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "plataformas_conteudo_superadmin_update"
  ON public.plataformas_conteudo FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "plataformas_conteudo_superadmin_delete"
  ON public.plataformas_conteudo FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
