begin;

create table private.gestor_ia_publicacoes_pdf (
  object_id uuid primary key,
  client_id uuid not null references public.clientes(id) on delete cascade,
  path text not null,
  published_at timestamptz,
  updated_by uuid not null,
  updated_at timestamptz not null default statement_timestamp(),
  revision integer not null default 1 check (revision > 0)
);
create index gestor_ia_publicacoes_pdf_portal on private.gestor_ia_publicacoes_pdf(client_id,published_at desc,object_id desc)
  where published_at is not null;
alter table private.gestor_ia_publicacoes_pdf enable row level security;
revoke all on private.gestor_ia_publicacoes_pdf from public,anon,authenticated,service_role;

create function private.gestor_ia_pdf_cliente_portal()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.cliente_id from public.profiles p join public.clientes c on c.id=p.cliente_id
  where p.id=auth.uid() and p.role='cliente' and c.etapa='closed'
    and public.planeje_current_account_access() is true
    and public.user_has_page_access(auth.uid(),'dashboard') is true;
$$;

create function private.gestor_ia_pdf_download_portal(p_id uuid, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select storage.allow_only_operation('object.get_authenticated') is true and exists (
    select 1 from private.gestor_ia_publicacoes_pdf p
    where p.object_id=p_id and p.path=p_path and p.published_at is not null and p.client_id=private.gestor_ia_pdf_cliente_portal()
  );
$$;

alter policy gestor_ia_pdf_read on storage.objects using (
  bucket_id='gestor-ia-relatorios' and (private.gestor_ia_pdf_access(name,false) or private.gestor_ia_pdf_download_portal(id,name))
);
alter policy gestor_ia_pdf_read_guard on storage.objects using (
  bucket_id<>'gestor-ia-relatorios' or private.gestor_ia_pdf_access(name,false) or private.gestor_ia_pdf_download_portal(id,name)
);

create function private.gestor_ia_alterar_visibilidade_pdf(p_path text, p_object_id uuid, p_publish boolean, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_client uuid;
  saved private.gestor_ia_publicacoes_pdf;
begin
  if p_publish is null or p_revision is null or p_revision<0 then
    raise invalid_parameter_value using message = 'Publicação inválida.';
  end if;
  select s.client_id into target_client from storage.objects o
    cross join lateral private.gestor_ia_pdf_scope(o.name) s
    where o.bucket_id='gestor-ia-relatorios' and o.id=p_object_id and o.name=p_path;
  if target_client is null or private.gestor_ia_pode_arquivar_pdf(target_client) is distinct from true then
    raise insufficient_privilege using message = 'PDF indisponível para publicação.';
  end if;
  if p_publish and not exists(select 1 from private.gestor_ia_revisoes_pdf r where r.object_id=p_object_id) then
    raise object_not_in_prerequisite_state using message = 'Marque este PDF como revisado antes de publicar.';
  end if;
  if p_revision=0 and p_publish then
    insert into private.gestor_ia_publicacoes_pdf(object_id,client_id,path,published_at,updated_by)
    values(p_object_id,target_client,p_path,statement_timestamp(),auth.uid())
    on conflict (object_id) do nothing returning * into saved;
  else
    update private.gestor_ia_publicacoes_pdf p set
      published_at=case when p_publish then statement_timestamp() else null end,
      updated_by=auth.uid(),updated_at=statement_timestamp(),revision=p.revision+1
    where p.object_id=p_object_id and p.client_id=target_client and p.path=p_path and p.revision=p_revision
      and (p.published_at is not null)<>p_publish returning * into saved;
  end if;
  if saved.object_id is null then raise serialization_failure using message = 'A visibilidade do PDF mudou em outra tela.'; end if;
  return jsonb_build_object('published_at',saved.published_at,'publication_revision',saved.revision);
end;
$$;

create function private.gestor_ia_listar_pdfs_portal(p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare target_client uuid := private.gestor_ia_pdf_cliente_portal();
begin
  if target_client is null then return; end if;
  if p_offset is null or p_offset<0 then raise invalid_parameter_value using message = 'Página do arquivo inválida.'; end if;
  return query select o.id,o.name,s.period_since,s.period_until,s.source,p.published_at
  from private.gestor_ia_publicacoes_pdf p
  join storage.objects o on o.id=p.object_id and o.bucket_id='gestor-ia-relatorios' and o.name=p.path
  cross join lateral private.gestor_ia_pdf_scope(o.name) s
  where p.client_id=target_client and s.client_id=target_client and p.published_at is not null
  order by p.published_at desc,p.object_id desc limit 26 offset p_offset;
end;
$$;

drop function public.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer);
drop function private.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer);

create function private.gestor_ia_listar_pdfs(p_client_id uuid, p_since date, p_until date, p_reviewed boolean, p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, generated_at timestamptz, reviewed_at timestamptz,
  published_at timestamptz, publication_revision integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_ia_pode_arquivar_pdf(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Arquivo do Gestor indisponível para este cliente.';
  end if;
  if p_since is null or p_until is null or not isfinite(p_since) or not isfinite(p_until)
    or p_until < p_since or p_offset is null or p_offset < 0 then
    raise invalid_parameter_value using message = 'Recorte do arquivo inválido.';
  end if;
  return query select o.id,o.name,s.period_since,s.period_until,s.source,o.created_at,r.reviewed_at,p.published_at,coalesce(p.revision,0)
  from storage.objects o
  cross join lateral private.gestor_ia_pdf_scope(o.name) s
  left join private.gestor_ia_revisoes_pdf r on r.object_id=o.id
  left join private.gestor_ia_publicacoes_pdf p on p.object_id=o.id and p.client_id=s.client_id and p.path=o.name
  where o.bucket_id='gestor-ia-relatorios' and o.name like p_client_id::text||'/%' and s.client_id=p_client_id
    and s.period_since <= p_until and s.period_until >= p_since
    and (p_reviewed is null or (r.object_id is not null)=p_reviewed)
  order by o.created_at desc,o.id desc limit 26 offset p_offset;
end;
$$;

create function public.gestor_ia_listar_pdfs(p_client_id uuid, p_since date, p_until date, p_reviewed boolean, p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, generated_at timestamptz, reviewed_at timestamptz,
  published_at timestamptz, publication_revision integer)
language sql stable security invoker set search_path = '' as $$
  select * from private.gestor_ia_listar_pdfs(p_client_id,p_since,p_until,p_reviewed,p_offset);
$$;

create function public.gestor_ia_listar_pdfs_portal(p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, published_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from private.gestor_ia_listar_pdfs_portal(p_offset);
$$;

create function public.gestor_ia_alterar_visibilidade_pdf(p_path text, p_object_id uuid, p_publish boolean, p_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_alterar_visibilidade_pdf(p_path,p_object_id,p_publish,p_revision);
$$;

revoke all on function private.gestor_ia_pdf_cliente_portal(),private.gestor_ia_pdf_download_portal(uuid,text),
  private.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),public.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  private.gestor_ia_listar_pdfs_portal(integer),public.gestor_ia_listar_pdfs_portal(integer),
  private.gestor_ia_alterar_visibilidade_pdf(text,uuid,boolean,integer),public.gestor_ia_alterar_visibilidade_pdf(text,uuid,boolean,integer)
  from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_pdf_download_portal(uuid,text),
  private.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),public.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  private.gestor_ia_listar_pdfs_portal(integer),public.gestor_ia_listar_pdfs_portal(integer),
  private.gestor_ia_alterar_visibilidade_pdf(text,uuid,boolean,integer),public.gestor_ia_alterar_visibilidade_pdf(text,uuid,boolean,integer)
  to authenticated;

notify pgrst,'reload schema';
commit;
