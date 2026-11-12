-- Conexão Meta manual do Rastreamento (token + BM + contas + Pixel/Página).
-- O token permanece em app_secrets; aqui só metadados visíveis na tela.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS meta_rastreamento jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clientes.meta_rastreamento IS
  'Estrutura Meta do Rastreamento: last4 do token, BM, contas de relatório, Pixel/Página. Sem OAuth. Token em app_secrets.';

NOTIFY pgrst, 'reload schema';
