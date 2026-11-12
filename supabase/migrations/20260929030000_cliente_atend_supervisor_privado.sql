-- Atendimento da loja — fase B: o supervisor também passa pela checagem por conversa nas tabelas
-- de contato/mensagens, para não ler pela API a conversa privada de outro atendente.
-- Admin ativo da loja continua sem restrição extra. Aplicar uma vez.
begin;

create or replace function public.cliente_atend_uid_restrito()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.cliente_atend_membros m
  where m.user_id = auth.uid()
    and (m.nivel <> 'admin' or not m.ativo)
  limit 1
$$;

commit;

notify pgrst, 'reload schema';
