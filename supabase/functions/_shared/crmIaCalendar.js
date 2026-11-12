const API='https://www.googleapis.com/calendar/v3';
const encoder=new TextEncoder();
const bytes=value=>encoder.encode(value);
const base64=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const CALENDAR_SCOPES=['openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.events.freebusy'];
export const calendarHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function calendarEventId(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('calendar_appointment_id');return id.replaceAll('-','').toLowerCase();}
async function stateKey(config){return crypto.subtle.importKey('raw',bytes(`crm-calendar-state-v1:${config.clientId}:${config.clientSecret}`),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signCalendarState(nonce,config){const body=`crmcal1.${nonce}`;return `${body}.${base64(await crypto.subtle.sign('HMAC',await stateKey(config),bytes(body)))}`;}
export async function verifyCalendarState(state,config){
  try{const [prefix,nonce,signature,...extra]=String(state||'').split('.');if(prefix!=='crmcal1'||!/^[0-9a-f-]{36}$/i.test(nonce)||extra.length)return null;
    return await crypto.subtle.verify('HMAC',await stateKey(config),unbase64(signature),bytes(`${prefix}.${nonce}`))?nonce:null;}catch{return null;}
}
// OAuth client secret rotation requires reconnecting Calendar; tokens never enter the generic secret reader.
async function tokenKey(config){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes(`crm-calendar-token-v1:${config.clientId}:${config.clientSecret}`)),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealCalendarToken(token,config,scope){const iv=crypto.getRandomValues(new Uint8Array(12));
  const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(`${scope.client}:${scope.owner}`)},await tokenKey(config),bytes(token));
  return `v1.${base64(iv)}.${base64(sealed)}`;
}
export async function openCalendarToken(sealed,config,scope){const [version,iv,body,...extra]=String(sealed||'').split('.');if(version!=='v1'||extra.length)throw new Error('calendar_token_invalid');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:bytes(`${scope.client}:${scope.owner}`)},await tokenKey(config),unbase64(body)));
}
export async function calendarRequest(url,{fetchImpl=fetch,...options}={}){
  const response=await fetchImpl(url,{...options,signal:options.signal||AbortSignal.timeout(20000)});
  if(!response.ok){const error=new Error(`calendar_http_${response.status}`);error.status=response.status;throw error;}
  if(response.status===204)return {data:null,status:204};
  try{return {data:await response.json(),status:response.status};}catch{throw new Error('calendar_invalid_response');}
}
export async function calendarAccessToken(config,encrypted,scope,fetchImpl=fetch){
  const refresh=await openCalendarToken(encrypted,config,scope);
  const {data}=await calendarRequest('https://oauth2.googleapis.com/token',{fetchImpl,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:refresh,grant_type:'refresh_token'})});
  if(typeof data?.access_token!=='string')throw new Error('calendar_refresh_unconfirmed');return data.access_token;
}
function dateStart(date,zone){
  let instant=Date.parse(`${date}T00:00:00Z`);
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const p=Object.fromEntries(format.formatToParts(new Date(instant)).map(v=>[v.type,v.value]));
    const rendered=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const next=instant+Date.parse(`${date}T00:00:00Z`)-rendered;if(next===instant)return new Date(instant).toISOString();instant=next;}
  throw new Error('calendar_timezone_unavailable');
}
function interval(start,end){if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))throw new Error('calendar_busy_unavailable');return {start:new Date(start).toISOString(),end:new Date(end).toISOString()};}
export async function fetchCalendarBusy({token,calendarId,since,until,ignoreEventId=null,timeZone='UTC',fetchImpl=fetch}){
  interval(since,until);if(Date.parse(until)-Date.parse(since)>31*86400000)throw new Error('calendar_range');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  if(!ignoreEventId){
    const {data}=await calendarRequest(`${API}/freeBusy`,{fetchImpl,method:'POST',headers,body:JSON.stringify({timeMin:since,timeMax:until,items:[{id:calendarId}]})});
    const calendar=data?.calendars?.[calendarId];if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw new Error('calendar_busy_unavailable');
    return calendar.busy.map(row=>interval(row.start,row.end));
  }
  const rows=[];let pageToken=null;
  for(let page=0;page<5;page++){
    const params=new URLSearchParams({timeMin:since,timeMax:until,singleEvents:'true',showDeleted:'false',maxResults:'2500',fields:'items(id,status,transparency,start,end),nextPageToken',...(pageToken?{pageToken}:{})});
    const {data}=await calendarRequest(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,{fetchImpl,headers});
    if(!Array.isArray(data?.items))throw new Error('calendar_busy_unavailable');
    for(const row of data.items){if(row.id===ignoreEventId||row.status==='cancelled'||row.transparency==='transparent')continue;
      rows.push(interval(row.start?.dateTime||(row.start?.date&&dateStart(row.start.date,timeZone)),row.end?.dateTime||(row.end?.date&&dateStart(row.end.date,timeZone))));}
    pageToken=data.nextPageToken;if(!pageToken)return rows;
  }
  throw new Error('calendar_busy_partial');
}
const owns=(event,target)=>event?.id===target.event_id&&event.extendedProperties?.private?.planejeAppointment===target.id&&event.extendedProperties?.private?.planejeConnection===target.connection_id;
const sameTime=(event,target)=>Date.parse(event.start?.dateTime)===Date.parse(target.start_at)&&Date.parse(event.end?.dateTime)===Date.parse(target.end_at);
const receipt=(event,target,status=200)=>({event_id:target.event_id,calendar_id:target.calendar_id,etag:event?.etag||null,http_status:status,observed_at:new Date().toISOString()});
export async function syncCalendarJob(target,{token,recheck,fetchImpl=fetch}){
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const url=`${API}/calendars/${encodeURIComponent(target.calendar_id)}/events/${target.event_id}`;
  let writing=false;
  const get=async()=>{try{return (await calendarRequest(url,{fetchImpl,headers})).data;}catch(error){if(error.status===404||error.status===410)return null;throw error;}};
  try{
    if(!await recheck())return {status:'cancelled',error_code:'source_changed'};
    let event=await get();
    if(event&&!owns(event,target))return {status:'conflict',error_code:'external_event_collision'};
    if(event&&!event.etag)return {status:'failed',error_code:'calendar_receipt_unconfirmed'};
    if(event&&target.receipt?.etag&&target.receipt.etag!==event.etag)return {status:'conflict',error_code:'external_event_changed'};
    if(target.desired_action==='delete'){
      if(!event)return target.reconcile_only&&!target.receipt?.etag?{status:'uncertain',error_code:'unconfirmed_prior_insert'}:{status:'cancelled',receipt:receipt(null,target,404)};
      if(!await recheck())return {status:'cancelled',error_code:'source_changed'};
      writing=true;await calendarRequest(`${url}?sendUpdates=none`,{fetchImpl,method:'DELETE',headers:{...headers,'If-Match':event.etag}});
      return {status:'cancelled',receipt:receipt(event,target,204)};
    }
    if(event&&sameTime(event,target))return target.receipt?.etag||target.reconcile_only?{status:'synced',receipt:receipt(event,target)}:{status:'conflict',error_code:'calendar_receipt_missing'};
    if(target.reconcile_only)return {status:'uncertain',error_code:'calendar_reconciliation_required'};
    if(event&&(!target.receipt?.etag||target.receipt.etag!==event.etag))return {status:'conflict',error_code:'external_event_changed'};
    const busy=await fetchCalendarBusy({token,calendarId:target.calendar_id,since:target.busy_start_at||target.start_at,until:target.busy_end_at||target.end_at,
      ignoreEventId:event?.id,timeZone:target.time_zone||'UTC',fetchImpl});
    if(busy.some(row=>Date.parse(row.start)<Date.parse(target.busy_end_at||target.end_at)&&Date.parse(row.end)>Date.parse(target.busy_start_at||target.start_at)))return {status:'conflict',error_code:'external_busy'};
    if(!await recheck())return {status:'cancelled',error_code:'source_changed'};
    const body={...(event?{}:{id:target.event_id}),summary:'Compromisso Planeje',start:{dateTime:target.start_at},end:{dateTime:target.end_at},
      extendedProperties:{private:{planejeAppointment:target.id,planejeConnection:target.connection_id}}};
    writing=true;
    try{
      const result=await calendarRequest(event?`${url}?sendUpdates=none`:`${API}/calendars/${encodeURIComponent(target.calendar_id)}/events?sendUpdates=none`,
        {fetchImpl,method:event?'PATCH':'POST',headers:{...headers,...(event?{'If-Match':event.etag}:{})},body:JSON.stringify(body)});
      if(!owns(result.data,target)||!sameTime(result.data,target)||!result.data.etag)throw new Error('calendar_receipt_unconfirmed');
      return {status:'synced',receipt:receipt(result.data,target,result.status)};
    }catch(error){if(error.status!==409)throw error;event=await get();
      return owns(event,target)&&sameTime(event,target)&&event.etag?{status:'synced',receipt:receipt(event,target)}:{status:'conflict',error_code:'external_event_collision'};}
  }catch(error){const ambiguous=writing&&(!error.status||error.status>=500);return {status:ambiguous?'uncertain':error.status===412?'conflict':'failed',error_code:ambiguous?'calendar_transport_unconfirmed':error.message?.startsWith('calendar_')?error.message:'calendar_read_unavailable'};}
}
async function rpc(db,action,payload={}){const {data,error}=await db.rpc('crm_ia_calendar_service',{p_action:action,p_payload:payload});if(error)throw new Error('calendar_database');return data;}
export async function refreshCalendarBusy({db,config,clientId,ownerId,date=null,since=null,until=null,leadId=null,appointmentId=null,fetchImpl=fetch}){
  const scope={client_id:clientId,owner_id:ownerId,...(leadId?{lead_id:leadId}:{}),...(appointmentId?{appointment_id:appointmentId}:{})};
  const target=await rpc(db,'busy_target',scope);
  if(target?.required===false)return {required:false,fresh:false,busy:null,status:target.status||'disconnected'};
  if(target?.required!==true||target.status!=='connected')throw new Error('calendar_connection_unavailable');
  if(!config?.clientId||!config?.clientSecret||target.oauth_client_id!==config.clientId)throw new Error('calendar_configuration_unavailable');
  if(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00Z`).toISOString().slice(0,10)!==date)throw new Error('calendar_range');
    since=new Date(Date.parse(`${date}T00:00Z`)-86400000).toISOString();until=new Date(Date.parse(`${date}T00:00Z`)+2*86400000).toISOString();}
  interval(since,until);
  const token=await calendarAccessToken(config,target.encrypted_token,{client:clientId,owner:ownerId},fetchImpl);
  let ignoreEventId=null;
  if(target.ignore_event_id){try{
    const {data:event}=await calendarRequest(`${API}/calendars/${encodeURIComponent(target.calendar_id)}/events/${target.ignore_event_id}?fields=id,extendedProperties`,{fetchImpl,headers:{Authorization:`Bearer ${token}`}});
    if(!owns(event,{id:appointmentId,event_id:target.ignore_event_id,connection_id:target.id}))throw new Error('calendar_external_event_collision');ignoreEventId=event.id;
  }catch(error){if(error.status!==404&&error.status!==410)throw error;}}
  const busy=await fetchCalendarBusy({token,calendarId:target.calendar_id,since,until,ignoreEventId,timeZone:target.time_zone,fetchImpl});
  const saved=await rpc(db,'busy',{...scope,revision:target.revision,since,until,busy});
  if(saved?.fresh!==true)throw new Error('calendar_busy_not_persisted');return saved;
}
export async function drainCalendarJobs({db,config,fetchImpl=fetch,limit=10}){
  const jobs=await rpc(db,'claim',{limit});const results=[];
  for(const job of jobs||[]){const claim={id:job.id,lease:job.lease};let result;
    try{
      const check=await rpc(db,'check',claim);if(!check?.allowed)result={status:'cancelled',error_code:'source_changed'};
      else{const token=await calendarAccessToken(config,job.encrypted_token,{client:job.cliente_id,owner:job.owner_id},fetchImpl);
        result=await syncCalendarJob(job,{token,fetchImpl,recheck:async()=>Boolean((await rpc(db,'check',claim))?.allowed)});}
      const stored=await rpc(db,'finish',{...claim,...result});
      results.push({id:job.id,status:stored?.status||'uncertain'});
    }catch(error){
      if(!result){try{const stored=await rpc(db,'finish',{...claim,status:'failed',error_code:'calendar_access_unavailable'});results.push({id:job.id,status:stored?.status||'uncertain'});continue;}catch{}}
      results.push({id:job.id,status:'uncertain',error_code:'calendar_receipt_not_persisted'});
    }
  }
  return results;
}
