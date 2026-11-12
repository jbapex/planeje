-- Amplia o limite do bucket de miniaturas para a cópia em 720px.
-- Não reaplicar 20260919190000. Esta alteração só muda file_size_limit.

UPDATE storage.buckets
SET file_size_limit = 2097152
WHERE id = 'ad-thumbnails';
