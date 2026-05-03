-- Default do modelo Claude no briefing diário (merge no JSONB existente).
UPDATE public.automacoes_config
SET configuracao = configuracao || '{"modelo": "claude-sonnet-4-6"}'::jsonb
WHERE nome = 'briefing_diario';
