-- Garante linhas em module_settings para todos os módulos do app (habilitados por padrão).

INSERT INTO public.module_settings (module_name, is_enabled)
VALUES
  ('clients', true),
  ('projects', true),
  ('tasks', true),
  ('atendimento', true),
  ('crm', true),
  ('rastreamento', true),
  ('requests', true),
  ('social_media', true),
  ('paid_traffic', true),
  ('reports', true),
  ('onboarding', true),
  ('automacoes', true),
  ('assistant', true)
ON CONFLICT (module_name) DO NOTHING;
