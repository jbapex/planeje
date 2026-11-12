alter table public.gestor_ia_metas_campanha
  drop constraint gestor_ia_metas_campanha_objective_check,
  add constraint gestor_ia_metas_campanha_objective_check
    check (objective in ('leads', 'mensagens', 'compras', 'trafego', 'engajamento'));
