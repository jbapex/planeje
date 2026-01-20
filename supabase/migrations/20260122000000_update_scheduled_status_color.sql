-- Migration: Atualizar cor do status "scheduled" para a mesma cor das artes (#A855F7)
-- Data: 2026-01-22

-- Atualizar a cor do status "scheduled" (agendado) para #A855F7 (roxo das artes)
UPDATE public.task_statuses
SET color = '#A855F7'
WHERE value = 'scheduled';

-- Comentário para documentação
COMMENT ON COLUMN public.task_statuses.color IS 'Cor hexadecimal do status. Status "scheduled" usa #A855F7 (mesma cor das artes no dashboard).';
