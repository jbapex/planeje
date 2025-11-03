import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { DatabaseZap, Copy, RefreshCw } from 'lucide-react';

const SQL_SCRIPTS = {
  task_comments: `
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
GRANT ALL ON TABLE public.task_comments TO anon, authenticated, service_role;
`,
  task_subtasks: `
CREATE TABLE IF NOT EXISTS public.task_subtasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid NOT NULL,
    title text NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    CONSTRAINT task_subtasks_pkey PRIMARY KEY (id),
    CONSTRAINT task_subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE
);
GRANT ALL ON TABLE public.task_subtasks TO anon, authenticated, service_role;
`,
  task_attachments: `
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE
);
GRANT ALL ON TABLE public.task_attachments TO anon, authenticated, service_role;
`
};

const MissingTableMessage = ({ tableName, onRecheck }) => {
  const { toast } = useToast();
  const script = SQL_SCRIPTS[tableName];

  const copyToClipboard = () => {
    navigator.clipboard.writeText(script);
    toast({ title: "Script copiado!", description: "Cole no Editor SQL do Supabase e execute." });
  };

  return (
    <div className="text-center py-8 px-4 bg-amber-50 border-2 border-dashed border-amber-200 rounded-lg">
      <DatabaseZap className="mx-auto h-12 w-12 text-amber-500" />
      <p className="mt-4 font-semibold text-amber-800">Ação Necessária: Criar Tabela</p>
      <p className="mt-2 text-sm text-amber-700">
        A tabela <code className="font-mono bg-amber-200 text-amber-900 px-1 py-0.5 rounded">{tableName}</code> não foi encontrada.
      </p>
      <p className="mt-2 text-sm text-amber-700">
        Para habilitar esta funcionalidade, copie o script abaixo e execute-o no <strong>Editor SQL</strong> do seu projeto no Supabase.
      </p>
      <div className="mt-4 text-left bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto relative">
        <pre><code>{script}</code></pre>
        <Button size="icon" variant="ghost" className="absolute top-2 right-2 text-white hover:bg-gray-700" onClick={copyToClipboard}>
          <Copy size={16} />
        </Button>
      </div>
      <Button onClick={onRecheck} className="mt-4">
        <RefreshCw className="mr-2 h-4 w-4" />
        Já executei o script, verificar novamente
      </Button>
    </div>
  );
};

export default MissingTableMessage;