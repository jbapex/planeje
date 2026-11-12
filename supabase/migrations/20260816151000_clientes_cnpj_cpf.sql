-- CPF ou CNPJ da conta do cliente

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS cnpj_cpf text;

COMMENT ON COLUMN public.clientes.cnpj_cpf IS 'CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente';
