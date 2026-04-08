# Arquitetura (VPS)

| App | Domínio | Next | Supabase CLI (pasta) | Kong | Postgres | Studio (DNS + Nginx) |
|-----|---------|------|------------------------|------|----------|----------------------|
| Planeje | ddplaneje.jbapex.com.br | 3000 | meu-projeto-supabase | 54321 | 54322 | studio-planeje.jbapex.com.br |
| CRM | ddcrm.jbapex.com.br | 3001 | segundo-projeto-supabase | 55321 | 55322 | studio-crm.jbapex.com.br |

Ficheiros de exemplo Nginx nesta pasta; copiar para `/etc/nginx/sites-available/` na VPS.

**Não commits:** `.env.local`, chaves reais.
