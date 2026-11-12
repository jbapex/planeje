-- Atendimento vira página do login (allowed_pages), não interruptor de Gerenciar módulos.
-- Nulo continua = páginas clássicas. Atendimento só entra com a chave, salvo Ápice (já via).
-- Não liga IA, Responder sozinho nem follow-up.

CREATE OR REPLACE FUNCTION public.user_has_page_access(user_id uuid, page_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_allowed_pages jsonb;
    user_role text;
    user_cliente_id uuid;
    apice_id uuid := 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
BEGIN
    SELECT role, cliente_id, allowed_pages
    INTO user_role, user_cliente_id, user_allowed_pages
    FROM public.profiles
    WHERE id = user_id;

    IF user_role IS DISTINCT FROM 'cliente' OR user_cliente_id IS NULL THEN
        RETURN true;
    END IF;

    IF page_key = 'atendimento' THEN
        IF user_allowed_pages IS NULL THEN
            RETURN user_cliente_id = apice_id;
        END IF;
        RETURN user_allowed_pages ? 'atendimento';
    END IF;

    IF user_allowed_pages IS NULL THEN
        RETURN true;
    END IF;

    RETURN user_allowed_pages ? page_key;
END;
$$;

COMMENT ON FUNCTION public.user_has_page_access(uuid, text) IS
  'Páginas do login cliente. allowed_pages nulo = clássicas; Atendimento só com a chave, salvo Ápice.';

COMMENT ON COLUMN public.profiles.allowed_pages IS
  'JSONB das páginas do login. Nulo = Dashboard, Status, ApexIA, PGM, CRM. Atendimento exige a chave (Ápice nulo continua permitido).';

-- Quem da Ápice já via Atendimento com lista explícita sem a chave ganha a chave.
UPDATE public.profiles
SET allowed_pages = allowed_pages || '["atendimento"]'::jsonb
WHERE role = 'cliente'
  AND cliente_id = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'
  AND jsonb_typeof(allowed_pages) = 'array'
  AND NOT (allowed_pages ? 'atendimento');
