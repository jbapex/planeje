-- Equipe da agência: cliente_id NULL vale em todos os grupos.
-- Cadastra os telefones da equipe que participam dos grupos WhatsApp.

ALTER TABLE public.atendimento_grupo_remetente_interno
  ALTER COLUMN cliente_id DROP NOT NULL;

COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.cliente_id IS
  'Cliente específico. NULL = equipe da agência (reconhece em todos os grupos).';

CREATE INDEX IF NOT EXISTS idx_atendimento_grupo_remetente_interno_agencia
  ON public.atendimento_grupo_remetente_interno (phone)
  WHERE cliente_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atendimento_grupo_remetente_agencia_phone
  ON public.atendimento_grupo_remetente_interno (phone)
  WHERE cliente_id IS NULL AND phone IS NOT NULL;

INSERT INTO public.atendimento_grupo_remetente_interno
  (cliente_id, label, phone, name_match, sender_jid, notes)
SELECT
  NULL,
  v.label,
  v.phone,
  v.name_match,
  v.phone || '@s.whatsapp.net',
  'Equipe da agência nos grupos'
FROM (
  VALUES
    ('Gabriel — Equipe', '5541936185506', 'gabriel'),
    ('Jheimison — Equipe', '5541988630941', 'jheimison'),
    ('Rayane — Equipe', '5541987904428', 'rayane'),
    ('Poliana — Equipe', '5541998411042', 'poliana'),
    ('Raphael — Equipe', '5541987366835', 'raphael'),
    ('Josias — Equipe', '5541995252559', 'josias')
) AS v(label, phone, name_match)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.atendimento_grupo_remetente_interno r
  WHERE r.cliente_id IS NULL
    AND r.phone = v.phone
);

-- Remove cópias por cliente feitas antes de existir o cadastro global.
DELETE FROM public.atendimento_grupo_remetente_interno
WHERE cliente_id IS NOT NULL
  AND notes = 'Equipe da agência nos grupos'
  AND phone IN (
    '5541936185506',
    '5541988630941',
    '5541987904428',
    '5541998411042',
    '5541987366835',
    '5541995252559'
  );

-- Caixa de pendências também reconhece equipe global (cliente_id IS NULL).
CREATE OR REPLACE FUNCTION public.caixa_remetente_e_equipe(
  p_conversa public.atendimento_conversas,
  p_sender_name text,
  p_sender_jid text,
  p_phone text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_name text := lower(coalesce(p_sender_name, ''));
  v_digits text := regexp_replace(coalesce(p_phone, p_sender_jid, ''), '\D', '', 'g');
  v_cliente uuid;
  v_interno boolean := false;
BEGIN
  IF v_name ~ '(jb[[:space:]]|estratégico|estrategico|apex ia|planeje)' THEN
    RETURN true;
  END IF;

  IF p_conversa.assigned_to IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = p_conversa.assigned_to
      AND pr.full_name IS NOT NULL
      AND v_name <> ''
      AND v_name LIKE '%' || lower(pr.full_name) || '%'
  ) THEN
    RETURN true;
  END IF;

  v_cliente := coalesce(
    public.caixa_cliente_representado(p_conversa.cliente_id, p_conversa.display_name),
    p_conversa.cliente_id
  );

  IF to_regclass('public.atendimento_grupo_remetente_interno') IS NOT NULL THEN
    EXECUTE
      $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.atendimento_grupo_remetente_interno r
        WHERE (r.cliente_id IS NULL OR r.cliente_id IN ($1, $2))
          AND (
            (r.sender_jid IS NOT NULL AND coalesce($3, '') ILIKE '%' || r.sender_jid || '%')
            OR (
              r.phone IS NOT NULL
              AND $4 <> ''
              AND $4 LIKE '%' || regexp_replace(r.phone, '\D', '', 'g') || '%'
            )
            OR (
              r.name_match IS NOT NULL
              AND $5 <> ''
              AND $5 LIKE '%' || lower(r.name_match) || '%'
            )
          )
      )
      $q$
    INTO v_interno
    USING p_conversa.cliente_id, v_cliente, p_sender_jid, v_digits, v_name;
    IF v_interno THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;
