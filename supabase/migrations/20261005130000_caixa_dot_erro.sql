-- Caixa Dot Entrega B: status erro e última falha da IA.
-- Aplicar uma vez. Não reaplicar.

BEGIN;

ALTER TABLE public.caixa_dot_threads
  DROP CONSTRAINT IF EXISTS caixa_dot_threads_status_check;

ALTER TABLE public.caixa_dot_threads
  ADD CONSTRAINT caixa_dot_threads_status_check
  CHECK (status IN ('aberta', 'aguardando_dot', 'respondido', 'feita', 'arquivada', 'erro'));

ALTER TABLE public.caixa_dot_threads
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.caixa_dot_threads
  DROP CONSTRAINT IF EXISTS caixa_dot_threads_last_error_len;

ALTER TABLE public.caixa_dot_threads
  ADD CONSTRAINT caixa_dot_threads_last_error_len
  CHECK (last_error IS NULL OR char_length(last_error) <= 500);

COMMENT ON COLUMN public.caixa_dot_threads.last_error IS
  'Última falha do Dot (Entrega B). Limpa ao responder com sucesso.';

COMMIT;
