-- Tabelas de Templates de Diagnóstico
create table if not exists public.diagnostic_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.diagnostic_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.diagnostic_templates(id) on delete cascade,
  order_index int not null,
  question text not null,
  type text not null default 'choice', -- 'choice' | 'open'
  options jsonb, -- [{"text":"Diariamente"}, ...]
  block text,
  key text,
  created_at timestamptz default now()
);

-- Índices úteis
create index if not exists idx_diag_questions_template_order on public.diagnostic_template_questions(template_id, order_index);

-- RLS
alter table public.diagnostic_templates enable row level security;
alter table public.diagnostic_template_questions enable row level security;

-- Políticas: leitura pública; escrita só autenticado
do $$ begin
  -- templates
  if not exists (select 1 from pg_policies where tablename='diagnostic_templates' and policyname='public_read_templates') then
    create policy public_read_templates on public.diagnostic_templates for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='diagnostic_templates' and policyname='authenticated_write_templates') then
    create policy authenticated_write_templates on public.diagnostic_templates for all using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;

  -- questions
  if not exists (select 1 from pg_policies where tablename='diagnostic_template_questions' and policyname='public_read_questions') then
    create policy public_read_questions on public.diagnostic_template_questions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='diagnostic_template_questions' and policyname='authenticated_write_questions') then
    create policy authenticated_write_questions on public.diagnostic_template_questions for all using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- Template inicial opcional
insert into public.diagnostic_templates (id, name, description, is_active)
select gen_random_uuid(), 'Marketing Geral', 'Template padrão do diagnóstico', true
where not exists (select 1 from public.diagnostic_templates);


