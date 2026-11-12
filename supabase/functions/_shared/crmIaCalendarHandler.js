import {resolveGoogleDriveRedirectUri,isPublicHttpsGoogleRedirect,GOOGLE_DRIVE_PUBLIC_ORIGIN} from '../../../src/lib/googleDriveAgency.js';
import {CALENDAR_SCOPES,calendarHash,signCalendarState,verifyCalendarState,sealCalendarToken,calendarAccessToken,calendarRequest,refreshCalendarBusy} from './crmIaCalendar.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API='https://www.googleapis.com/calendar/v3';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Cache-Control':'no-store'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
async function rpc(db,name,action,payload){const {data,error}=await db.rpc(name,{p_action:action,p_payload:payload});if(error){const failure=new Error('calendar_database');failure.status=error.code==='42501'?403:error.code==='40001'?409:503;throw failure;}return data;}
const service=(db,action,payload)=>rpc(db,'crm_ia_calendar_service',action,payload);
const workspace=(db,action,payload)=>rpc(db,'crm_ia_calendar_workspace',action,payload);
export async function loadCalendarConfig(db,{env=()=>undefined,supabaseUrl=''}={}){
  const secret=async name=>{const direct=env(name);if(direct)return direct;try{const {data,error}=await db.rpc('get_encrypted_secret',{p_secret_name:name});return !error&&typeof data==='string'?data:null;}catch{return null;}};
  const names=['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REDIRECT_URI','GOOGLE_DRIVE_REDIRECT_URI','GOOGLE_DRIVE_APP_ORIGIN'];
  const values=Object.fromEntries(await Promise.all(names.map(async name=>[name,await secret(name)])));
  if((Boolean(values.GOOGLE_CALENDAR_CLIENT_ID)!==Boolean(values.GOOGLE_CALENDAR_CLIENT_SECRET))||(!values.GOOGLE_CALENDAR_CLIENT_ID&&Boolean(values.GOOGLE_DRIVE_CLIENT_ID)!==Boolean(values.GOOGLE_DRIVE_CLIENT_SECRET)))return {configured:false,reason:'calendar_oauth_configuration_incomplete'};
  const pair=values.GOOGLE_CALENDAR_CLIENT_ID&&values.GOOGLE_CALENDAR_CLIENT_SECRET?'GOOGLE_CALENDAR':values.GOOGLE_DRIVE_CLIENT_ID&&values.GOOGLE_DRIVE_CLIENT_SECRET?'GOOGLE_DRIVE':'GOOGLE_ADS';
  const clientId=values[`${pair}_CLIENT_ID`],clientSecret=values[`${pair}_CLIENT_SECRET`];
  const redirectUri=resolveGoogleDriveRedirectUri({explicitUri:values.GOOGLE_CALENDAR_REDIRECT_URI||values.GOOGLE_DRIVE_REDIRECT_URI,appOrigin:values.GOOGLE_DRIVE_APP_ORIGIN,supabaseUrl});
  let appOrigin;try{appOrigin=new URL(values.GOOGLE_DRIVE_APP_ORIGIN||GOOGLE_DRIVE_PUBLIC_ORIGIN).origin;}catch{return {configured:false,reason:'calendar_return_origin_invalid'};}
  return {clientId,clientSecret,redirectUri,appOrigin,dedicated:false,configured:Boolean(clientId&&clientSecret&&isPublicHttpsGoogleRedirect(redirectUri)&&isPublicHttpsGoogleRedirect(appOrigin))};
}
export async function handleCalendarCallback(request,{service:db,config}){
  if(!config?.clientId||!config?.clientSecret)return json({error:'calendar_oauth_not_configured'},503);
  const url=new URL(request.url),nonce=await verifyCalendarState(url.searchParams.get('state'),config);
  if(!nonce)return json({error:'calendar_state_invalid'},400);
  try{
    const nonce_hash=await calendarHash(nonce),state=await service(db,'nonce_info',{nonce_hash});
    if(!state||state.oauth_client_id!==config.clientId||state.redirect_uri!==config.redirectUri)return json({error:'calendar_state_configuration_changed'},400);
    if(url.searchParams.has('error'))return json({error:'calendar_consent_not_granted'},400);
    const code=url.searchParams.get('code');if(!code||code.length>4096)return json({error:'calendar_callback_invalid'},400);
    // Only the browser returning from Google receives this fragment. The UI erases it before awaiting finalize.
    const origin=new URL(config.appOrigin||GOOGLE_DRIVE_PUBLIC_ORIGIN).origin;
    if(!isPublicHttpsGoogleRedirect(origin))return json({error:'calendar_return_origin_invalid'},503);
    const target=`${origin}/#/crm-ia/configuracoes?${new URLSearchParams({cliente:state.cliente_id,aba:'google_calendar',google_calendar:'finalize',calendar_state:url.searchParams.get('state'),calendar_code:code})}`;
    return new Response(null,{status:303,headers:{...cors,Location:target,'Referrer-Policy':'no-referrer'}});
  }catch{return json({error:'calendar_callback_not_confirmed'},400);}
}
export async function handleCalendarRequest(request,{createClient,env=()=>undefined,fetchImpl=fetch,config:providedConfig}={}){
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  const url=env('SUPABASE_URL'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
  if(!url||!serviceKey||!anon)return json({error:'calendar_server_not_configured'},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(request.method==='GET')return handleCalendarCallback(request,{service:db,config:providedConfig||await loadCalendarConfig(db,{env,supabaseUrl:url}),fetchImpl});
  if(request.method!=='POST')return json({error:'calendar_method'},405);
  const authorization=request.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))return json({error:'calendar_session_required'},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data:auth,error}=await caller.auth.getUser();if(error||!auth?.user?.id)return json({error:'calendar_session_required'},401);
    const raw=await request.text();if(raw.length>30000)return json({error:'calendar_payload'},400);
    const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body)||!UUID.test(body.client_id||''))return json({error:'calendar_scope'},400);
    const action=body.action,owner=auth.user.id;
    if(!['status','connect-start','finalize','calendars','select-calendar','disconnect','busy'].includes(action))return json({error:'calendar_action'},400);
    if(body.owner_id&&body.owner_id!==owner&&action!=='busy')return json({error:'calendar_owner'},403);
    const targetOwner=action==='busy'&&body.owner_id?body.owner_id:owner;if(!UUID.test(targetOwner))return json({error:'calendar_owner'},400);
    const scope={client_id:body.client_id,owner_id:targetOwner};
    if(body.appointment_id&&!UUID.test(body.appointment_id))return json({error:'calendar_appointment_id'},400);
    const busyScope={...scope,...(body.lead_id?{lead_id:body.lead_id}:{}),...(body.appointment_id?{appointment_id:body.appointment_id}:{})};
    const gate=await workspace(caller,action==='busy'?'busy':'status',action==='busy'?busyScope:scope);
    if(action==='busy'&&gate?.required===false)return json(gate);
    if(action==='disconnect')return json({...await workspace(caller,'disconnect',scope),google_revocation:'not_attempted_shared_grant',external_events_deleted:false});
    const config=providedConfig||await loadCalendarConfig(db,{env,supabaseUrl:url});
    const configured=Boolean(config.clientId&&config.clientSecret&&isPublicHttpsGoogleRedirect(config.redirectUri)&&isPublicHttpsGoogleRedirect(config.appOrigin||GOOGLE_DRIVE_PUBLIC_ORIGIN));
    if(action==='status')return json({...gate,configured,google_api_verified:false,
      ...(!configured?{error:'A conexão Google Agenda ainda não está configurada no servidor. A agenda interna continua disponível.'}:{})});
    if(!configured)return json({error:'calendar_oauth_not_configured'},503);
    if(action==='connect-start'){
      const nonce=crypto.randomUUID(),state=await signCalendarState(nonce,config);
      await workspace(caller,'begin',{...scope,nonce_hash:await calendarHash(nonce),oauth_client_id:config.clientId,redirect_uri:config.redirectUri});
      const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:CALENDAR_SCOPES.join(' '),access_type:'offline',prompt:'consent',state});
      return json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`,expires_in:600,policy:'busy_only_generic_title'});
    }
    if(action==='finalize'){
      const nonce=await verifyCalendarState(body.state,config);
      if(!nonce||typeof body.code!=='string'||!body.code||body.code.length>4096)return json({error:'calendar_callback_invalid'},400);
      const nonce_hash=await calendarHash(nonce),state=await workspace(caller,'finalize_claim',{...scope,nonce_hash});
      if(state?.cliente_id!==body.client_id||state.owner_id!==owner||state.oauth_client_id!==config.clientId||state.redirect_uri!==config.redirectUri)return json({error:'calendar_state_configuration_changed'},400);
      const {data:tokens}=await calendarRequest('https://oauth2.googleapis.com/token',{fetchImpl,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:state.redirect_uri,code:body.code,grant_type:'authorization_code'})});
      const scopes=String(tokens.scope||'').split(/\s+/);
      if(!tokens.refresh_token||!tokens.access_token||CALENDAR_SCOPES.filter(item=>item.startsWith('https:')).some(item=>!scopes.includes(item)))return json({error:'calendar_scopes_or_refresh_missing'},400);
      const {data:user}=await calendarRequest('https://www.googleapis.com/oauth2/v2/userinfo',{fetchImpl,headers:{Authorization:`Bearer ${tokens.access_token}`}});
      if(!user?.id||!user?.email||user.verified_email!==true)return json({error:'calendar_google_identity_unconfirmed'},400);
      const encrypted_token=await sealCalendarToken(tokens.refresh_token,config,{client:state.cliente_id,owner:state.owner_id});
      const saved=await service(db,'grant',{nonce_hash,encrypted_token,google_subject:user.id,google_email:user.email,scopes});
      if(saved?.status!=='awaiting_calendar')return json({error:'calendar_grant_not_persisted'},503);
      return json({...saved,connected:false,requires_calendar_selection:true});
    }
    if(action==='busy'){
      await refreshCalendarBusy({db,config,clientId:body.client_id,ownerId:targetOwner,leadId:body.lead_id||null,appointmentId:body.appointment_id||null,
        since:body.since,until:body.until,fetchImpl});
      return json(await workspace(caller,'busy',busyScope));
    }
    const connection=await service(db,'connection',scope);
    if(connection.oauth_client_id!==config.clientId)return json({error:'calendar_configuration_changed_reconnect'},409);
    if(!['connected','awaiting_calendar'].includes(connection.status)||!connection.encrypted_token)return json({error:'calendar_reconnect_required'},409);
    const token=await calendarAccessToken(config,connection.encrypted_token,{client:body.client_id,owner:targetOwner},fetchImpl);
    const headers={Authorization:`Bearer ${token}`};
    if(action==='calendars'){
      const params=new URLSearchParams({minAccessRole:'writer',maxResults:'250',fields:'items(id,summary,timeZone,accessRole,primary,deleted),nextPageToken',...(body.pageToken?{pageToken:String(body.pageToken).slice(0,2048)}:{})});
      const {data}=await calendarRequest(`${API}/users/me/calendarList?${params}`,{fetchImpl,headers});
      if(!Array.isArray(data.items))return json({error:'calendar_list_unconfirmed'},502);
      return json({rows:data.items.filter(row=>['writer','owner'].includes(row.accessRole)&&!row.deleted).map(({id,summary,timeZone,accessRole,primary})=>({id,name:summary,time_zone:timeZone,access_role:accessRole,primary})),next_page_token:data.nextPageToken||null,revision:connection.revision});
    }
    if(action==='select-calendar'){
      if(typeof body.calendar_id!=='string'||body.calendar_id.length>1024||body.revision!==connection.revision)return json({error:'calendar_connection_version'},409);
      const {data}=await calendarRequest(`${API}/users/me/calendarList/${encodeURIComponent(body.calendar_id)}`,{fetchImpl,headers});
      if(data.id!==body.calendar_id||data.deleted||!['owner','writer'].includes(data.accessRole))return json({error:'calendar_write_permission_required'},403);
      return json(await service(db,'select',{...scope,revision:body.revision,calendar_id:data.id,calendar_name:data.summary,time_zone:data.timeZone||'UTC',access_role:data.accessRole}));
    }
    return json({error:'calendar_action'},400);
  }catch(error){return json({error:error.message?.startsWith('calendar_http_')?error.message:'calendar_request_unconfirmed',available:false},error.status===403?403:error.status===409?409:error.status===401?401:503);}
}
