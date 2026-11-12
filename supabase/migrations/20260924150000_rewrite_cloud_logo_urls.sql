-- Fotos de cliente e avatar: o host do projeto cloud (supabase.co) está restrito (402).
-- Os arquivos já estão no Storage local. Só troca o host. Não reaplicar.

UPDATE public.clientes
SET logo_urls = ARRAY(
  SELECT regexp_replace(u, '^https?://[a-z0-9.-]*supabase\.co', 'https://planeje.jbapex.com.br', 'i')
  FROM unnest(logo_urls) AS u
)
WHERE EXISTS (
  SELECT 1 FROM unnest(COALESCE(logo_urls, ARRAY[]::text[])) AS u
  WHERE u ~* 'supabase\.co'
);

UPDATE public.profiles
SET avatar_url = regexp_replace(avatar_url, '^https?://[a-z0-9.-]*supabase\.co', 'https://planeje.jbapex.com.br', 'i')
WHERE avatar_url ~* 'supabase\.co';
