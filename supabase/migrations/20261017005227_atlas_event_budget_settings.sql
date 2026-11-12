-- Josias authorized 1,000,000 tokens/day and an owner-only editable budget screen.
-- Widen the configurable bound; the current value is saved through the existing human RPC.
ALTER TABLE public.atlas_event_config
 DROP CONSTRAINT atlas_event_config_max_tokens_per_day_check,
 ADD CONSTRAINT atlas_event_config_max_tokens_per_day_check CHECK(max_tokens_per_day BETWEEN 1000 AND 10000000);
