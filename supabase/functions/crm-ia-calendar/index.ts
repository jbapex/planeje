import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import {handleCalendarRequest} from '../_shared/crmIaCalendarHandler.js';

serve(request=>handleCalendarRequest(request,{createClient,env:name=>Deno.env.get(name)}));
