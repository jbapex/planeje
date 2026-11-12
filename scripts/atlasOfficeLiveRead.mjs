/** Read-only deployment check, using the existing bounded server read delegation. */
import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
const env=process.env;
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:settings,error}=await admin.from('atlas_settings').select('owner_id,monitor_enabled').eq('id','atlas').single();
if(error||!settings?.owner_id)throw new Error('Atlas configuration unavailable.');
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000);
const body=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:settings.owner_id,role:'authenticated',aud:'authenticated',iss:'supabase',planeje_server_delegate:'atlas',iat:now,exp:now+180})}`;
const token=body+'.'+createHmac('sha256',env.JWT_SECRET).update(body).digest('base64url');
const url=env.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/atlas-office';
const call=async(action,authenticated=true)=>{
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_ANON_KEY,...(authenticated?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action}),signal:AbortSignal.timeout(55000)});
 const data=await response.json();
 if(authenticated&&(!response.ok||!data.ok))throw new Error('Office read failed: '+response.status+' '+(data.code||data.error||'unknown'));
 return {status:response.status,data};
};
const denied=await call('snapshot',false);
if(![401,403].includes(denied.status))throw new Error('Unauthenticated office read was not refused.');
const snapshot=await call('snapshot');
const status=await call('status');
if(!snapshot.data.office.complete||settings.monitor_enabled!==false)throw new Error('Office completeness or legacy monitor guard failed.');
console.log(JSON.stringify({passed:true,read_only:true,unauthenticated_status:denied.status,office_status:snapshot.status,status_status:status.status,
 totals:snapshot.data.office.totals,queried_at:snapshot.data.office.queried_at,config_enabled:snapshot.data.config.enabled,
 worker_heartbeat:status.data.state?.heartbeat_at,last_scan:status.data.state?.last_scan_at,office_error:status.data.state?.last_error||null,
 questions:status.data.questions.filter(q=>q.state==='open').length,proposals:status.data.proposals.filter(p=>p.state==='pending').length,
 legacy_monitor_enabled:settings.monitor_enabled}));
