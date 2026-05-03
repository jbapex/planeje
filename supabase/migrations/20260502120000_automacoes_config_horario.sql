-- Coluna usada pelo planeje-briefing (cron briefing + opcional metadado).
ALTER TABLE public.automacoes_config
  ADD COLUMN IF NOT EXISTS horario text;

COMMENT ON COLUMN public.automacoes_config.horario IS 'Horário HH:mm (timezone America/Sao_Paulo no worker), ex.: 08:00';
