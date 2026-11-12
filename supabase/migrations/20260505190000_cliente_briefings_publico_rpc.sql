-- Link público do briefing: leitura e envio sem expor a tabela inteira ao anon.
-- O app chama estas RPCs com o token (UUID) do link.

CREATE OR REPLACE FUNCTION public.get_cliente_briefing_publico(p_token uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'briefing', to_jsonb(cb),
    'empresa', c.empresa
  )
  FROM public.cliente_briefings cb
  LEFT JOIN public.clientes c ON c.id = cb.cliente_id
  WHERE cb.token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_cliente_briefing_publico(
  p_token uuid,
  p_respostas jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.cliente_briefings
  SET
    respostas = p_respostas,
    status = 'completo',
    updated_at = now()
  WHERE token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cliente_briefing_publico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_cliente_briefing_publico(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_cliente_briefing_publico(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cliente_briefing_publico(uuid, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cliente_briefing_publico(uuid) IS 'Retorna briefing + empresa por token (formulário público).';
COMMENT ON FUNCTION public.submit_cliente_briefing_publico(uuid, jsonb) IS 'Atualiza respostas e status completo por token (formulário público).';
