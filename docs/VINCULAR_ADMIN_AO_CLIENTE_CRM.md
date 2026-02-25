# Vincular seu usuário admin ao cliente da sua operação (CRM no menu)

Quando você faz **login do cliente**, acessa o CRM em `/cliente/crm` e vê os dados da **sua operação**.  
Para ver **os mesmos dados** ao abrir **CRM** no menu do Planeje (logado como admin), seu usuário admin precisa ter `cliente_id` apontando para esse mesmo cliente.

## Passo a passo

### 1. Descobrir o ID do cliente da sua operação

No **Supabase** → SQL Editor, rode:

```sql
-- Listar clientes (veja qual é o da sua operação pelo nome da empresa)
SELECT id, empresa FROM public.clientes ORDER BY empresa;
```

Anote o `id` (UUID) do cliente que é a sua operação.

Ou, se você sabe o e-mail do usuário que faz login do cliente:

```sql
-- Troque 'email@do-cliente.com' pelo e-mail do login do cliente
SELECT p.id, p.full_name, p.cliente_id, c.empresa
FROM public.profiles p
LEFT JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.role = 'cliente' AND p.cliente_id IS NOT NULL;
-- Ou: WHERE p.id = (SELECT id FROM auth.users WHERE email = 'email@do-cliente.com');
```

Anote o `cliente_id` desse perfil — é o ID do cliente da sua operação.

### 2. Vincular o usuário admin a esse cliente

Troque no SQL abaixo:
- `SEU_EMAIL_ADMIN` → e-mail do usuário admin (ex.: jb@jbapex.com.br)
- `ID_DO_CLIENTE_DA_OPERACAO` → o UUID do cliente anotado no passo 1

```sql
-- Vincular seu usuário admin ao cliente da sua operação
UPDATE public.profiles
SET cliente_id = 'ID_DO_CLIENTE_DA_OPERACAO'
WHERE id = (SELECT id FROM auth.users WHERE email = 'SEU_EMAIL_ADMIN');
```

Exemplo (substitua pelos seus valores reais):

```sql
UPDATE public.profiles
SET cliente_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE id = (SELECT id FROM auth.users WHERE email = 'jb@jbapex.com.br');
```

### 3. Conferir

1. Faça logout e login de novo no Planeje (para o perfil com `cliente_id` ser recarregado).
2. No menu do Planeje, clique em **CRM**.
3. Você deve ver o mesmo CRM da sua operação (leads, contatos, funil, etc.) — os dados do cliente vinculado.

O **login do cliente** continua igual; nada muda para quem entra em `/cliente/crm`. Só o seu uso no Planeje passa a mostrar os dados desse cliente em `/crm`.
