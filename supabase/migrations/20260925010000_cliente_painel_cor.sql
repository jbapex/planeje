-- Cor do painel da área do cliente (Meus Dados). Nulo = azul padrão.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS painel_cor text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_painel_cor_hex'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_painel_cor_hex
      CHECK (painel_cor IS NULL OR painel_cor ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
