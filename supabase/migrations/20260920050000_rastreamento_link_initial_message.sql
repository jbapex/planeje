-- Mensagem inicial do wa.me + flag para anexar código de casamento (sempre recomendado).
ALTER TABLE public.cliente_rastreamento_links
  ADD COLUMN IF NOT EXISTS initial_message text;

ALTER TABLE public.cliente_rastreamento_links
  ADD COLUMN IF NOT EXISTS append_match_code boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cliente_rastreamento_links.initial_message IS
  'Texto opcional pré-preenchido no WhatsApp; o código PJ-XXXXXX é anexado quando append_match_code=true';
COMMENT ON COLUMN public.cliente_rastreamento_links.append_match_code IS
  'Se true, anexa Código PJ-XXXXXX à mensagem inicial (necessário para casar o clique)';
