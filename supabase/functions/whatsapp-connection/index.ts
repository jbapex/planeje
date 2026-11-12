import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { createWhatsappConnectionHandler } from '../_shared/whatsappConnectionHandler.js';

serve(createWhatsappConnectionHandler({ createClient, env: (name: string) => Deno.env.get(name) }));
