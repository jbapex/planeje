-- Liberação por cliente: loja vê leads não rastreados no Mini CRM.
-- Só o superadmin grava. O cliente lê o próprio valor. Default false.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS mini_crm_show_untracked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.mini_crm_show_untracked IS
  'Se true, o login da loja (papel cliente) vê leads não rastreados no Mini CRM. Só superadmin altera.';

CREATE OR REPLACE FUNCTION public.guard_mini_crm_show_untracked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.mini_crm_show_untracked IS DISTINCT FROM OLD.mini_crm_show_untracked THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Somente superadmin pode alterar mini_crm_show_untracked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mini_crm_show_untracked ON public.clientes;
CREATE TRIGGER trg_guard_mini_crm_show_untracked
  BEFORE UPDATE OF mini_crm_show_untracked ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_mini_crm_show_untracked();
