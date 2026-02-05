-- Telefone (owner) e imagem do contato (imagePreview) para exibir na Caixa de entrada
ALTER TABLE public.cliente_whatsapp_inbox
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS profile_pic_url text;

COMMENT ON COLUMN public.cliente_whatsapp_inbox.phone IS 'Número de telefone (ex.: owner da uazapi)';
COMMENT ON COLUMN public.cliente_whatsapp_inbox.profile_pic_url IS 'URL da foto do contato/grupo (ex.: imagePreview da uazapi)';
