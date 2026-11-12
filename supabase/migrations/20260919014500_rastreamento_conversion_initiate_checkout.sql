-- Aditivo: gatilho pode disparar InitiateCheckout (Checkout iniciado).
-- Não reaplicar 20260918140000_rastreamento_conversion_rules.sql.

BEGIN;

ALTER TABLE public.rastreamento_conversion_rules
  DROP CONSTRAINT IF EXISTS rastreamento_conversion_rules_event_name_chk;

ALTER TABLE public.rastreamento_conversion_rules
  ADD CONSTRAINT rastreamento_conversion_rules_event_name_chk
    CHECK (event_name IN ('Lead', 'QualifiedLead', 'Purchase', 'InitiateCheckout'));

COMMENT ON TABLE public.rastreamento_conversion_rules IS
  'Gatilhos: etiqueta CRM ou frase dispara evento Meta (Lead/QualifiedLead/InitiateCheckout/Purchase).';

COMMIT;
