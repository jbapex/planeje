-- Tráfego: só clientes ativos da carteira (etapa = closed, o card Ativos em Clientes).

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_is_operational_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = p_client_id
      AND c.etapa = 'closed'
  )
  AND (
    EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = p_client_id)
    OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = p_client_id)
    OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = p_client_id AND t.type = 'paid_traffic')
    OR EXISTS (SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = p_client_id)
  )
$$;

COMMENT ON FUNCTION public.central_trafego_checkup_is_operational_client(uuid) IS
  'Cliente operacional de tráfego: contrato fechado (ativos em Clientes) e sinal de tráfego.';
