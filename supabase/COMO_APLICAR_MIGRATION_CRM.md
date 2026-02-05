# Como aplicar a migration do CRM no Supabase

**Onde ficam as opções do CRM:** não há página nova no menu. Dentro da página **CRM** (menu lateral) existem **três abas**: **Leads** (lista e Kanban), **Visão geral** (métricas e resumo) e **Configurações** (status, pipeline e WhatsApp). Use essas abas no topo da tela do CRM.

**Como ver ou criar funis:** vá em **CRM → Configurações**. Se já existir um funil (após a migration ou criação manual), o card **"Pipeline e etapas"** mostra o funil em uso e a tabela de etapas (nome, tipo, cor). Se não existir, aparece o aviso **"Como ver ou criar um funil"** e o botão **"Criar funil a partir dos status"**: configure os status na seção **"Status do funil"** (ex.: agendado, compareceu, vendeu, não compareceu), depois clique no botão para criar o pipeline e as etapas. Hoje cada cliente tem um funil; o Kanban usa sempre esse funil.

---

O erro **"Could not find the table 'public.crm_oportunidades' in the schema cache"** acontece porque a tabela ainda não foi criada no seu projeto Supabase. Aplique a migration de uma das formas abaixo.

## Opção 1: Supabase Dashboard (SQL Editor)

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard) e abra seu projeto.
2. No menu lateral, vá em **SQL Editor**.
3. Clique em **New query**.
4. Copie todo o conteúdo do arquivo:
   `supabase/migrations/20260126000000_create_crm_tables.sql`
5. Cole no editor e clique em **Run** (ou Ctrl+Enter).
6. Confirme que a execução terminou sem erros. As tabelas `crm_oportunidades` e `crm_atividades` serão criadas, com FK para `clientes`, índices, triggers e RLS.

## Opção 2: Supabase CLI

Se o projeto estiver linkado ao Supabase CLI:

```bash
npx supabase db push
```

Ou, para aplicar apenas as migrations pendentes:

```bash
npx supabase migration up
```

---

## Migration do CRM Apice (leads, Kanban)

Para usar o CRM portado do apicecrm (leads, Kanban, configurações por cliente), aplique também:

- **Arquivo:** `supabase/migrations/20260126100000_create_apicecrm_leads_tables.sql`

Esse script cria as tabelas `leads`, `cliente_crm_settings` e `crm_produtos`, com RLS. Execute no SQL Editor (copie e cole o conteúdo do arquivo) ou use `npx supabase db push` para aplicar todas as migrations pendentes.

---

## Migration Pipeline e Etapas (funil, validações, relatórios)

**Se o CRM parece “igual ao de antes”** (só colunas de status, sem validação ao mover lead, sem modal Ganho/Perdido, sem métricas por etapa), é porque falta aplicar a migration de **Pipeline e Etapas**:

- **Arquivo:** `supabase/migrations/20260128000000_create_crm_pipelines_stages_events.sql`

Ela cria:

- `crm_pipelines` e `crm_stages` (funil por cliente)
- `crm_funnel_events` (histórico de movimentação para relatórios)
- `crm_lead_interacoes` (para regras de ações obrigatórias)
- Colunas em `leads`: `pipeline_id`, `stage_id`, `status_vida`, `stage_entered_at`, etc.

E **migra os dados**: para cada cliente que já tem statuses em `cliente_crm_settings`, cria um pipeline e etapas a partir deles e associa os leads às etapas.

**Como aplicar:** no Supabase → SQL Editor, abra o arquivo acima, copie todo o conteúdo, cole na query e execute (Run). Ou use `npx supabase db push` para aplicar todas as migrations pendentes.

Depois de aplicar, recarregue a aplicação. O Kanban passará a usar as etapas do pipeline, com validação ao mover, modal de motivo em Ganho/Perdido e métricas na Visão geral.

---

Depois de aplicar as migrations, recarregue a aplicação. A página de CRM deve carregar os leads (lista e Kanban) e permitir cadastro, edição, filtros e importação CSV.
