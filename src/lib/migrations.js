import { supabase } from '@/lib/customSupabaseClient';

const MIGRATIONS = {
  '000_create_run_sql_function': `
    CREATE OR REPLACE FUNCTION public.run_sql(sql_query text)
    RETURNS json
    LANGUAGE plpgsql
    AS $$
    BEGIN
      EXECUTE sql_query;
      RETURN json_build_object('status', 'ok');
    END;
    $$;
  `,
  '001_create_schema_migrations_table': `
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version character varying(255) NOT NULL,
      CONSTRAINT schema_migrations_pkey PRIMARY KEY (version)
    );
    GRANT ALL ON TABLE public.schema_migrations TO anon, authenticated, service_role;
  `,
  '002_create_task_features_tables': `
    CREATE TABLE IF NOT EXISTS public.task_comments (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        task_id uuid NOT NULL,
        user_id uuid NOT NULL,
        content text NOT NULL,
        CONSTRAINT task_comments_pkey PRIMARY KEY (id),
        CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE,
        CONSTRAINT task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS public.task_subtasks (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        task_id uuid NOT NULL,
        title text NOT NULL,
        is_completed boolean DEFAULT false NOT NULL,
        CONSTRAINT task_subtasks_pkey PRIMARY KEY (id),
        CONSTRAINT task_subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS public.task_attachments (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        task_id uuid NOT NULL,
        name text NOT NULL,
        url text NOT NULL,
        CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
        CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE
    );

    GRANT ALL ON TABLE public.task_comments TO anon, authenticated, service_role;
    GRANT ALL ON TABLE public.task_subtasks TO anon, authenticated, service_role;
    GRANT ALL ON TABLE public.task_attachments TO anon, authenticated, service_role;
  `,
  '003_add_contexto_ia_to_campaign_plans': `
    ALTER TABLE public.campaign_plans 
    ADD COLUMN IF NOT EXISTS contexto_ia TEXT DEFAULT '';
    
    COMMENT ON COLUMN public.campaign_plans.contexto_ia IS 'Contexto adicional para a IA aprender sobre o cliente e gerar conteúdo personalizado';
  `
};

const runSqlAsAdmin = async (sql) => {
  const { data, error } = await supabase.functions.invoke('run-sql-as-admin', {
    body: { query: sql },
  });

  if (error) {
    console.error('Error invoking admin function:', error.message);
    throw error;
  }
  
  if (data && data.error) {
    console.error('Error from admin function execution:', data.error);
    throw new Error(data.error);
  }

  return data;
};


export const runMigrations = async () => {
  try {
    console.log('Starting migration process...');

    // Step 1: Ensure the `run_sql` function exists.
    // We can't use RPC for this, so we assume it must be created manually or via a different mechanism if not present.
    // For now, we'll proceed and let subsequent steps fail if it's missing.
    // A better approach is to have a dedicated setup for this.
    // Let's try to create it via an edge function if possible.
    await runSqlAsAdmin(MIGRATIONS['000_create_run_sql_function']);
    console.log('Ensured run_sql function exists.');

    // Step 2: Create the migrations table using the now-guaranteed-to-exist function.
    await runSqlAsAdmin(MIGRATIONS['001_create_schema_migrations_table']);
    console.log('Ensured schema_migrations table exists.');

    // Step 3: Get executed migrations.
    const { data: executedMigrations, error: executedError } = await supabase
      .from('schema_migrations')
      .select('version');

    if (executedError) {
      console.error('Error fetching executed migrations:', executedError);
      throw executedError;
    }

    const executedVersions = executedMigrations.map(m => m.version);
    console.log('Executed versions:', executedVersions);

    // Step 4: Run pending migrations.
    const sortedMigrations = Object.keys(MIGRATIONS).sort();

    for (const version of sortedMigrations) {
      if (!executedVersions.includes(version)) {
        console.log(`Running migration: ${version}`);
        const sql = MIGRATIONS[version];
        
        await runSqlAsAdmin(sql);

        const { error: insertError } = await supabase
          .from('schema_migrations')
          .insert({ version });

        if (insertError) {
          console.error(`Error inserting migration version ${version}:`, insertError);
          throw new Error(`Failed to record migration ${version}`);
        }
        console.log(`Migration ${version} completed and recorded.`);
      }
    }
    console.log('All migrations are up to date.');
  } catch (error) {
    console.error('Migration process failed:', error.message);
  }
};