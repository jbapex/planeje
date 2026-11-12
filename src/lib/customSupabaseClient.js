import { createClient } from '@supabase/supabase-js';

// Prefer build-time env (self-hosted or cloud). Fallbacks keep local/dev usable.
export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://planeje.jbapex.com.br';

export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg4NzA1OTYxLCJleHAiOjE5NDYzODU5NjF9.TWwmp9YbLQcAJrtq7eGNPp8cbh460AmLZIp6gBdsST8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
