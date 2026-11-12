-- Atendimento da loja — funil Qualificar → Transferir para atendente no cadastro do agente.
-- Só a loja habilitada (hoje Ápice) tem linhas nesta tabela. Não dispara CAPI, não liga automático.
-- Aplicar uma vez.
begin;

alter table public.cliente_atend_ia_agentes
  add column if not exists funil jsonb not null default jsonb_build_object(
    'perguntas', '[]'::jsonb,
    'criterio', '',
    'destino_tipo', 'proximo',
    'destino_setor_id', null,
    'mensagem_transicao', ''
  );

alter table public.cliente_atend_ia_agentes
  drop constraint if exists cliente_atend_ia_agentes_funil_obj;
alter table public.cliente_atend_ia_agentes
  add constraint cliente_atend_ia_agentes_funil_obj check (jsonb_typeof(funil) = 'object');

commit;

notify pgrst, 'reload schema';
