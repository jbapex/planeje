begin;

create table private.gestor_ia_revisoes_pdf (
  object_id uuid primary key,
  reviewed_at timestamptz not null default now(),
  reviewer_id uuid not null
);
alter table private.gestor_ia_revisoes_pdf enable row level security;
revoke all on private.gestor_ia_revisoes_pdf from public,anon,authenticated,service_role;

create function private.gestor_ia_pdf_scope(p_path text)
returns table (client_id uuid, uploader_id uuid, period_since date, period_until date, source text)
language plpgsql immutable set search_path = '' as $$
declare parts text[];
begin
  parts := regexp_match(p_path, '^([0-9a-f-]{36})/([0-9a-f-]{36})/([0-9]{4}-[0-9]{2}-[0-9]{2})_([0-9]{4}-[0-9]{2}-[0-9]{2})_(meta|google|redes|meta_redes)_([0-9a-f-]{36})[.]pdf$');
  if parts is null then return; end if;
  client_id := parts[1]::uuid;
  uploader_id := parts[2]::uuid;
  period_since := parts[3]::date;
  period_until := parts[4]::date;
  source := parts[5];
  if client_id::text = parts[1] and uploader_id::text = parts[2] and parts[6]::uuid::text = parts[6]
    and period_since <= period_until then return next; end if;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return;
end;
$$;

create function private.gestor_ia_pode_arquivar_pdf(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.gestor_ia_pode_registrar_decisao(p_client_id) is true
    and private.planeje_staff_role() in ('admin','superadmin')
    and private.gestor_ia_modulo_decisao('reports') is true;
$$;

create function private.gestor_ia_pdf_access(p_path text, p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.gestor_ia_pdf_scope(p_path) s
    where private.gestor_ia_pode_arquivar_pdf(s.client_id) and (not p_write or s.uploader_id=auth.uid()));
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gestor-ia-relatorios','gestor-ia-relatorios',false,52428800,array['application/pdf']);

create policy gestor_ia_pdf_read on storage.objects for select to authenticated
  using (bucket_id='gestor-ia-relatorios' and private.gestor_ia_pdf_access(name,false));
create policy gestor_ia_pdf_read_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id<>'gestor-ia-relatorios' or private.gestor_ia_pdf_access(name,false));
create policy gestor_ia_pdf_insert on storage.objects for insert to authenticated
  with check (bucket_id='gestor-ia-relatorios' and private.gestor_ia_pdf_access(name,true));
create policy gestor_ia_pdf_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id<>'gestor-ia-relatorios' or private.gestor_ia_pdf_access(name,true));
create policy gestor_ia_pdf_immutable on storage.objects as restrictive for update to authenticated
  using (bucket_id<>'gestor-ia-relatorios') with check (bucket_id<>'gestor-ia-relatorios');
create policy gestor_ia_pdf_keep_history on storage.objects as restrictive for delete to authenticated
  using (bucket_id<>'gestor-ia-relatorios');
create policy gestor_ia_pdf_anon_guard on storage.objects as restrictive for all to anon
  using (bucket_id<>'gestor-ia-relatorios') with check (bucket_id<>'gestor-ia-relatorios');

create function private.gestor_ia_listar_pdfs(p_client_id uuid, p_since date, p_until date, p_reviewed boolean, p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, generated_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_ia_pode_arquivar_pdf(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Arquivo do Gestor indisponível para este cliente.';
  end if;
  if p_since is null or p_until is null or not isfinite(p_since) or not isfinite(p_until)
    or p_until < p_since or p_offset is null or p_offset < 0 then
    raise invalid_parameter_value using message = 'Recorte do arquivo inválido.';
  end if;
  return query select o.id,o.name,s.period_since,s.period_until,s.source,o.created_at,r.reviewed_at
  from storage.objects o
  cross join lateral private.gestor_ia_pdf_scope(o.name) s
  left join private.gestor_ia_revisoes_pdf r on r.object_id=o.id
  where o.bucket_id='gestor-ia-relatorios' and o.name like p_client_id::text||'/%' and s.client_id=p_client_id
    and s.period_since <= p_until and s.period_until >= p_since
    and (p_reviewed is null or (r.object_id is not null)=p_reviewed)
  order by o.created_at desc,o.id desc
  limit 26 offset p_offset;
end;
$$;

create function private.gestor_ia_revisar_pdf(p_path text, p_object_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if private.gestor_ia_pdf_access(p_path,false) is distinct from true or not exists (
    select 1 from storage.objects o where o.bucket_id='gestor-ia-relatorios' and o.id=p_object_id and o.name=p_path
  ) then
    raise insufficient_privilege using message = 'PDF indisponível para revisão.';
  end if;
  insert into private.gestor_ia_revisoes_pdf(object_id,reviewer_id) values (p_object_id,auth.uid())
  on conflict (object_id) do nothing;
  return (select r.reviewed_at from private.gestor_ia_revisoes_pdf r where r.object_id=p_object_id);
end;
$$;

create function public.gestor_ia_listar_pdfs(p_client_id uuid, p_since date, p_until date, p_reviewed boolean, p_offset integer)
returns table (id uuid, path text, period_since date, period_until date, source text, generated_at timestamptz, reviewed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from private.gestor_ia_listar_pdfs(p_client_id,p_since,p_until,p_reviewed,p_offset);
$$;

create function public.gestor_ia_revisar_pdf(p_path text, p_object_id uuid)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.gestor_ia_revisar_pdf(p_path,p_object_id);
$$;

revoke all on function private.gestor_ia_pdf_scope(text),private.gestor_ia_pode_arquivar_pdf(uuid),
  private.gestor_ia_pdf_access(text,boolean),private.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  private.gestor_ia_revisar_pdf(text,uuid),public.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  public.gestor_ia_revisar_pdf(text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_pdf_access(text,boolean),private.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  private.gestor_ia_revisar_pdf(text,uuid),public.gestor_ia_listar_pdfs(uuid,date,date,boolean,integer),
  public.gestor_ia_revisar_pdf(text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
