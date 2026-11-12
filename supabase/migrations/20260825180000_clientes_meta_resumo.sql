-- Snapshot das campanhas Meta na ficha do cliente (o que está no ar, resultado por objetivo, vendas).
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS meta_resumo jsonb;

COMMENT ON COLUMN public.clientes.meta_resumo IS
  'Snapshot Meta Ads do mês: campanhas no ar, gasto, mensagens/leads/compras por objetivo e se gerou venda. Preenchido pela API, sem precisar abrir cada conta.';
