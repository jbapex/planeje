-- Suporte à 6ª semana no lançamento mensal de investimentos
-- Evita erro PGRST204 quando o frontend envia week6_* no upsert.

ALTER TABLE public.investments
ADD COLUMN IF NOT EXISTS week6_investment numeric,
ADD COLUMN IF NOT EXISTS week6_leads integer,
ADD COLUMN IF NOT EXISTS week6_revenue numeric;
