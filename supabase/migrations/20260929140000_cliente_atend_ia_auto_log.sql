-- Log da IA automática (ação responder). A coluna auto_responder já existe e nasce false.
-- Não liga nenhum agente. Aplicar uma vez.
begin;

alter table public.cliente_atend_ia_log drop constraint if exists cliente_atend_ia_log_acao_check;
alter table public.cliente_atend_ia_log
  add constraint cliente_atend_ia_log_acao_check check (acao in ('testar', 'sugerir', 'responder'));

commit;

notify pgrst, 'reload schema';
