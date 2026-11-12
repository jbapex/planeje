begin;

create table private.gestor_ia_avisos_portal (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.gestor_ia_decisoes(id) on delete cascade,
  client_id uuid not null references public.clientes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 110),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  published_at timestamptz,
  revision integer not null default 1 check (revision>0),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null
);
create index gestor_ia_avisos_portal_cliente on private.gestor_ia_avisos_portal(client_id,published_at desc,id desc)
  where published_at is not null;
alter table private.gestor_ia_avisos_portal enable row level security;
revoke all on private.gestor_ia_avisos_portal from public,anon,authenticated,service_role;

create function private.gestor_ia_cliente_do_aviso(p_decision_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select d.client_id from public.gestor_ia_decisoes d where d.id=p_decision_id and d.owner_id=auth.uid()
    and private.gestor_ia_pode_arquivar_pdf(d.client_id) is true;
$$;

create function private.gestor_ia_estado_do_aviso(p_notice private.gestor_ia_avisos_portal)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',($1).id,'title',($1).title,'message',($1).message,'published_at',($1).published_at,'revision',($1).revision);
$$;

create function private.gestor_ia_aviso_portal_da_decisao(p_decision_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target_client uuid := private.gestor_ia_cliente_do_aviso(p_decision_id);
begin
  if target_client is null then raise insufficient_privilege using message = 'Aviso indisponível para esta decisão.'; end if;
  return (select private.gestor_ia_estado_do_aviso(a) from private.gestor_ia_avisos_portal a
    where a.decision_id=p_decision_id and a.client_id=target_client);
end;
$$;

create function private.gestor_ia_publicar_aviso_portal(p_decision_id uuid,p_revision integer,p_title text,p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_client uuid := private.gestor_ia_cliente_do_aviso(p_decision_id);
  saved private.gestor_ia_avisos_portal;
  headline text := regexp_replace(coalesce(p_title,''),'^\s+|\s+$','','g');
  content text := regexp_replace(coalesce(p_message,''),'^\s+|\s+$','','g');
begin
  if target_client is null then raise insufficient_privilege using message = 'Aviso indisponível para esta decisão.'; end if;
  if p_revision is null or p_revision<0 or char_length(headline) not between 1 and 110 or char_length(content) not between 1 and 1000 then
    raise invalid_parameter_value using message = 'Confira o título e a mensagem do aviso.';
  end if;
  if p_revision=0 then
    insert into private.gestor_ia_avisos_portal(decision_id,client_id,title,message,published_at,updated_by)
    values(p_decision_id,target_client,headline,content,statement_timestamp(),auth.uid())
    on conflict (decision_id) do nothing returning * into saved;
  else
    update private.gestor_ia_avisos_portal a set title=headline,message=content,published_at=statement_timestamp(),
      revision=a.revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
    where a.decision_id=p_decision_id and a.client_id=target_client and a.revision=p_revision returning * into saved;
  end if;
  if saved.id is null then raise serialization_failure using message = 'O aviso mudou em outra tela.'; end if;
  return private.gestor_ia_estado_do_aviso(saved);
end;
$$;

create function private.gestor_ia_retirar_aviso_portal(p_notice_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved private.gestor_ia_avisos_portal;
  target_client uuid;
begin
  select a.client_id into target_client from private.gestor_ia_avisos_portal a where a.id=p_notice_id;
  if private.gestor_ia_pode_arquivar_pdf(target_client) is distinct from true then
    raise insufficient_privilege using message = 'Aviso indisponível para retirada.';
  end if;
  update private.gestor_ia_avisos_portal a set published_at=null,revision=a.revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
  where a.id=p_notice_id and a.client_id=target_client and a.revision=p_revision and a.published_at is not null returning * into saved;
  if saved.id is null then raise serialization_failure using message = 'O aviso mudou em outra tela.'; end if;
  return private.gestor_ia_estado_do_aviso(saved);
end;
$$;

create function private.gestor_ia_listar_avisos_portal(p_offset integer,p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target_client uuid;
begin
  if p_offset is null or p_offset<0 then raise invalid_parameter_value using message = 'Página dos avisos inválida.'; end if;
  if p_client_id is null then
    target_client := private.gestor_ia_pdf_cliente_portal();
    if target_client is null then return '[]'::jsonb; end if;
  elsif private.gestor_ia_pode_arquivar_pdf(p_client_id) is true then
    target_client := p_client_id;
  else
    raise insufficient_privilege using message = 'Avisos indisponíveis para este cliente.';
  end if;
  return (select coalesce(jsonb_agg(
    jsonb_build_object('id',a.id,'title',a.title,'message',a.message,'published_at',a.published_at) ||
    case when p_client_id is not null then jsonb_build_object('revision',a.revision) else '{}'::jsonb end
    order by a.published_at desc,a.id desc),'[]'::jsonb)
    from (select id,title,message,published_at,revision from private.gestor_ia_avisos_portal where client_id=target_client and published_at is not null
      order by published_at desc,id desc limit 26 offset p_offset) a);
end;
$$;

create function public.gestor_ia_aviso_portal_da_decisao(p_decision_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.gestor_ia_aviso_portal_da_decisao(p_decision_id);
$$;
create function public.gestor_ia_publicar_aviso_portal(p_decision_id uuid,p_revision integer,p_title text,p_message text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_publicar_aviso_portal(p_decision_id,p_revision,p_title,p_message);
$$;
create function public.gestor_ia_retirar_aviso_portal(p_notice_id uuid,p_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_retirar_aviso_portal(p_notice_id,p_revision);
$$;
create function public.gestor_ia_listar_avisos_portal(p_offset integer,p_client_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.gestor_ia_listar_avisos_portal(p_offset,p_client_id);
$$;

revoke all on function private.gestor_ia_cliente_do_aviso(uuid),private.gestor_ia_estado_do_aviso(private.gestor_ia_avisos_portal),
  private.gestor_ia_aviso_portal_da_decisao(uuid),public.gestor_ia_aviso_portal_da_decisao(uuid),
  private.gestor_ia_publicar_aviso_portal(uuid,integer,text,text),public.gestor_ia_publicar_aviso_portal(uuid,integer,text,text),
  private.gestor_ia_retirar_aviso_portal(uuid,integer),public.gestor_ia_retirar_aviso_portal(uuid,integer),
  private.gestor_ia_listar_avisos_portal(integer,uuid),public.gestor_ia_listar_avisos_portal(integer,uuid) from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_aviso_portal_da_decisao(uuid),public.gestor_ia_aviso_portal_da_decisao(uuid),
  private.gestor_ia_publicar_aviso_portal(uuid,integer,text,text),public.gestor_ia_publicar_aviso_portal(uuid,integer,text,text),
  private.gestor_ia_retirar_aviso_portal(uuid,integer),public.gestor_ia_retirar_aviso_portal(uuid,integer),
  private.gestor_ia_listar_avisos_portal(integer,uuid),public.gestor_ia_listar_avisos_portal(integer,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
