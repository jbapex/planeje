-- Contexto e prioridades são escritos pela equipe; IA é apoio opcional.
ALTER TABLE public.campaign_plans
  ADD COLUMN IF NOT EXISTS contexto_ia text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.campaign_plans.contexto_ia IS
  'Contexto e prioridades do planejamento, editáveis manualmente e disponíveis para apoio opcional da IA.';

NOTIFY pgrst, 'reload schema';
