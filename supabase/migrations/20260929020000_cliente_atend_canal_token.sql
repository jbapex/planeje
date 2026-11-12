-- Atendimento da loja — fase B: supervisor, atendente e usuário desativado da loja não leem
-- nem gravam cliente_whatsapp_config (tem o token da instância). O envio segue pela função
-- uazapi-send-message, que lê o canal com a chave de serviço. Aplicar uma vez.
begin;

drop policy if exists cliente_atend_nao_admin_whatsapp_config on public.cliente_whatsapp_config;
create policy cliente_atend_nao_admin_whatsapp_config on public.cliente_whatsapp_config
  as restrictive for all to authenticated
  using ((select public.cliente_atend_uid_nao_admin()) is null)
  with check ((select public.cliente_atend_uid_nao_admin()) is null);

commit;

notify pgrst, 'reload schema';
