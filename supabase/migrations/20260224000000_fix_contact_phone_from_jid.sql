-- Atualiza o campo phone de todos os contatos existentes a partir do from_jid.
-- O from_jid contém o número real do remetente (ex.: 5541999999999@s.whatsapp.net);
-- assim corrigimos contatos que foram gravados com o número da instância (owner) no phone.
UPDATE public.cliente_whatsapp_contact
SET
  phone = TRIM(SPLIT_PART(from_jid, '@', 1)),
  updated_at = now()
WHERE from_jid IS NOT NULL
  AND from_jid LIKE '%@%'
  AND TRIM(SPLIT_PART(from_jid, '@', 1)) <> '';
