-- Foto de perfil do contato (imagePreview do evento) para exibir na página Contatos e no lead
ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS profile_pic_url text;

COMMENT ON COLUMN public.cliente_whatsapp_contact.profile_pic_url IS 'URL da foto do contato (ex.: imagePreview do evento uazapi)';
