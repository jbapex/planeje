-- =====================================================
-- Adicionar responsavel_id em leads (membro da equipe do cliente)
-- O cliente pode atribuir um usuário (profile) como responsável pelo lead.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'responsavel_id'
    ) THEN
      ALTER TABLE public.leads
        ADD COLUMN responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_leads_responsavel_id ON public.leads (responsavel_id);
      RAISE NOTICE 'Coluna leads.responsavel_id criada.';
    ELSE
      RAISE NOTICE 'Coluna leads.responsavel_id já existe.';
    END IF;
  END IF;
END $$;
