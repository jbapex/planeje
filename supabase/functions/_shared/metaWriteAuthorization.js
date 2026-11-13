// v24 encerrou suporte em 10/11/2026; este mutador usa v25 sem alterar as leituras legadas.
export const META_WRITE_API_VERSION = 'v25.0';
const GRAPH = `https://graph.facebook.com/${META_WRITE_API_VERSION}`;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const OBJECT_ID = /^\d{5,30}$/;
const account = value => typeof value === 'string' && /^(act_)?\d{1,32}$/.test(value) ? `act_${value.replace(/^act_/,'')}` : null;
const fail = (code,message,status = 403) => { throw Object.assign(new Error(message),{ code,status }); };
const denied = () => fail('META_WRITE_FORBIDDEN','Sem acesso para alterar este objeto na Meta.');
function jwtClaims(authorization) {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) fail('META_WRITE_AUTH','Sessão autenticada necessária.',401);
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !/^[\w-]+$/.test(parts[1])) throw new Error();
    const encoded = parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4,'=')),value => value.charCodeAt(0))));
    if (claims.role !== 'authenticated' || claims.planeje_server_delegate != null || typeof claims.session_id !== 'string' || !UUID.test(claims.session_id)) denied();
    return token;
  } catch (error) {
    if (error.code) throw error;
    fail('META_WRITE_AUTH','Sessão inválida.',401);
  }
}
function writeInput(body) {
  const allowed = ['cliente_id','adAccountId','objectId','adsetId','level','status','daily_budget','lifetime_budget'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || !UUID.test(body.cliente_id || '')) fail('META_WRITE_INPUT','Informe o cliente e os campos da alteração.',400);
  const objectId = body.objectId || body.adsetId;
  if (typeof objectId !== 'string' || !OBJECT_ID.test(objectId) || body.objectId && body.adsetId && body.objectId !== body.adsetId) fail('META_WRITE_INPUT','Objeto Meta inválido.',400);
  const level = body.level || 'adset';
  if (!['campaign','adset','ad'].includes(level)) fail('META_WRITE_INPUT','Nível do objeto inválido.',400);
  const changes = {};
  if (body.status != null && body.status !== '') {
    if (typeof body.status !== 'string' || !['ACTIVE','PAUSED'].includes(body.status.toUpperCase())) fail('META_WRITE_INPUT','Escolha ACTIVE ou PAUSED.',400);
    changes.status = body.status.toUpperCase();
  }
  const budgetFields = ['daily_budget','lifetime_budget'].filter(key => body[key] != null && body[key] !== '');
  if (budgetFields.length > 1 || budgetFields.length && level !== 'adset') fail('META_WRITE_INPUT','Altere somente uma modalidade de verba de um conjunto.',400);
  if (budgetFields.length) {
    const key = budgetFields[0],value = Number(body[key]);
    if (!['number','string'].includes(typeof body[key]) || !Number.isSafeInteger(value) || value < 100 || value > 100000000) fail('META_WRITE_INPUT','Verba inválida: use centavos entre 100 e 100000000.',400);
    changes[key] = value;
  }
  if (!Object.keys(changes).length) fail('META_WRITE_INPUT','Nada para alterar.',400);
  const explicitAccount = body.adAccountId == null ? null : account(body.adAccountId);
  if (body.adAccountId != null && !explicitAccount) fail('META_WRITE_INPUT','Conta Meta inválida.',400);
  return { client_id:body.cliente_id.toLowerCase(),account_id:explicitAccount,object_id:objectId,level,changes,budget:budgetFields.length > 0 };
}
async function result(request) {
  const { data,error } = await request;
  if (error) denied();
  return data;
}

/** Same-user caller only. No token lookup or Meta request occurs during authorization. */
export async function requireMetaWriteScope({ request,body,createCaller }) {
  return authorizedScope({ request,scope:writeInput(body),createCaller });
}

/** Creation uses the same live caller and budget permissions; assets are proved separately. */
export async function requireMetaCampaignScope({ request,body,createCaller,caller }) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['cliente_id','adAccountId'].includes(key)) || !UUID.test(body.cliente_id || '') || !account(body.adAccountId)) fail('META_WRITE_INPUT','Informe o cliente e a conta Meta exata.',400);
  return authorizedScope({ request,scope:{ client_id:body.cliente_id.toLowerCase(),account_id:account(body.adAccountId),budget:true },createCaller,caller });
}

async function authorizedScope({ request,scope,createCaller,caller:existingCaller }) {
  const authorization = request.headers.get('Authorization') || '';
  const token = jwtClaims(authorization);
  const caller = existingCaller || createCaller(authorization);
  const { data:auth,error } = await caller.auth.getUser(token);
  if (error || !auth?.user?.id) fail('META_WRITE_AUTH','Sessão inválida.',401);
  if (await result(caller.rpc('planeje_current_account_access')) !== true) denied();
  const actor = auth.user.id;
  const profile = await result(caller.from('profiles').select('id,role,status').eq('id',actor).maybeSingle());
  if (profile?.status !== 'active' || !['superadmin','admin','colaborador'].includes(profile.role)) denied();
  const [global,personal,acl,client] = await Promise.all([
    result(caller.from('module_settings').select('is_enabled').eq('module_name','paid_traffic').maybeSingle()),
    result(caller.from('user_module_permissions').select('is_enabled').eq('module_name','paid_traffic').eq('user_id',actor).maybeSingle()),
    result(caller.rpc('central_trafego_can_access_client',{ p_cliente_id:scope.client_id })),
    result(caller.from('clientes').select('id').eq('id',scope.client_id).eq('etapa','closed').maybeSingle()),
  ]);
  if ((personal?.is_enabled ?? global?.is_enabled ?? true) !== true || acl !== true || client?.id !== scope.client_id) denied();
  if (profile.role !== 'superadmin') {
    const fields = scope.budget ? ['meta_resumo','valor'] : ['meta_resumo'];
    const [defaults,overrides] = await Promise.all([
      result(caller.from('client_field_permissions').select('field_name,can_view').eq('role',profile.role).in('field_name',fields)),
      result(caller.from('user_client_field_permissions').select('field_name,can_view').eq('user_id',actor).in('field_name',fields)),
    ]);
    if (!Array.isArray(defaults) || !Array.isArray(overrides)) denied();
    const permissions = new Map([...defaults,...overrides].map(row => [row.field_name,row.can_view]));
    if (fields.some(field => permissions.has(field) && permissions.get(field) !== true)) denied();
  }
  const linked = await result(caller.from('cliente_meta_accounts').select('cliente_id,meta_account_id,is_active').eq('cliente_id',scope.client_id).eq('is_active',true));
  if (!Array.isArray(linked)) denied();
  const accounts = [...new Set(linked.filter(row => row.cliente_id === scope.client_id && row.is_active === true).map(row => account(row.meta_account_id)).filter(Boolean))];
  if (!accounts.length || scope.account_id && !accounts.includes(scope.account_id)) denied();
  return { ...scope,actor_id:actor,accounts,api_version:META_WRITE_API_VERSION };
}

/** Fixed GET used before a write and by the executor for a later readback. */
export async function readMetaWriteObject({ scope,token,graphFetch = fetch,signal }) {
  if (!scope || !OBJECT_ID.test(scope.object_id || '') || !['campaign','adset','ad'].includes(scope.level) || !Array.isArray(scope.accounts) || !scope.accounts.length) denied();
  const fields = ['id','account_id','status','configured_status',...({ campaign:['objective'],adset:['campaign_id','optimization_goal'],ad:['adset_id','campaign_id'] })[scope.level],...(scope.budget ? ['daily_budget','lifetime_budget'] : [])];
  let response,data;
  const controller = new AbortController(),cancel = () => controller.abort(signal.reason);
  const timer = setTimeout(() => controller.abort(new Error('meta_read_timeout')),10000);
  try {
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort',cancel,{ once:true });
    controller.signal.throwIfAborted();
    response = await graphFetch(`${GRAPH}/${scope.object_id}?${new URLSearchParams({ fields:fields.join(',') })}`,{
      method:'GET',headers:{ Authorization:`Bearer ${token}` },redirect:'error',signal:controller.signal,
    });
    data = await response.json();
  } catch { fail('META_WRITE_SOURCE','Não foi possível conferir o objeto atual na Meta.',502); }
  finally { clearTimeout(timer);signal?.removeEventListener('abort',cancel); }
  if (!response.ok || data?.error || !data || typeof data !== 'object') fail('META_WRITE_SOURCE','Não foi possível conferir o objeto atual na Meta.',502);
  const owner = account(data.account_id);
  if (data.id !== scope.object_id || !owner || !scope.accounts.includes(owner) || scope.account_id && scope.account_id !== owner) denied();
  const correctLevel = scope.level === 'campaign' ? typeof data.objective === 'string' && data.objective.length > 0
    : scope.level === 'adset' ? OBJECT_ID.test(data.campaign_id || '') && typeof data.optimization_goal === 'string' && data.optimization_goal.length > 0
      : OBJECT_ID.test(data.adset_id || '') && OBJECT_ID.test(data.campaign_id || '');
  if (!correctLevel || typeof (data.configured_status || data.status) !== 'string') fail('META_WRITE_SOURCE','O nível ou a configuração do objeto não pôde ser confirmado.',502);
  const snapshot = { object_id:scope.object_id,account_id:owner,level:scope.level,configured_status:data.configured_status || data.status,api_version:META_WRITE_API_VERSION };
  if (scope.budget) {
    for (const key of ['daily_budget','lifetime_budget']) {
      const value = data[key];
      snapshot[key] = value != null && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    }
    if (snapshot.daily_budget === null && snapshot.lifetime_budget === null) fail('META_WRITE_SOURCE','A verba atual do conjunto está indisponível.',502);
  }
  return snapshot;
}
function safeProviderError(error,token) {
  const clean = value => String(value || '').split(token).join('[segredo removido]').replace(/(?:access_token|authorization|api_key)\s*[:=]\s*\S+/gi,'[segredo removido]').replace(/https?:\/\/\S+/gi,'[URL removida]').slice(0,600);
  return { message:clean(error?.message) || 'A Meta recusou a alteração.',...(Number.isInteger(error?.code) ? { code:error.code } : {}),
    ...(error?.error_user_title ? { error_user_title:clean(error.error_user_title) } : {}),...(error?.error_user_msg ? { error_user_msg:clean(error.error_user_msg) } : {}) };
}

/** Authorize first, load the server token, prove object ownership, then make one absolute update. */
export async function handleMetaWrite({ request,body,createCaller,readToken,graphFetch = fetch,corsHeaders = {} }) {
  const reply = (data,status = 200) => Response.json(data,{ status,headers:{ ...corsHeaders,'Cache-Control':'no-store' } });
  try {
    if (request.method !== 'POST') fail('META_WRITE_METHOD','Use POST.',405);
    request.signal?.throwIfAborted();
    const scope = await requireMetaWriteScope({ request,body,createCaller });
    request.signal?.throwIfAborted();
    const token = await readToken();
    if (typeof token !== 'string' || !token) fail('META_WRITE_TOKEN','Credencial Meta indisponível no servidor.',503);
    const before = await readMetaWriteObject({ scope,token,graphFetch,signal:request.signal });
    const current = await requireMetaWriteScope({ request,body,createCaller });
    if (current.actor_id !== scope.actor_id || current.client_id !== scope.client_id || !current.accounts.includes(before.account_id)
      || current.account_id && current.account_id !== before.account_id) denied();
    request.signal?.throwIfAborted();
    let response,data;
    const controller = new AbortController(),cancel = () => controller.abort(request.signal?.reason);
    const timer = setTimeout(() => controller.abort(new Error('meta_write_timeout')),15000);
    try {
      if (request.signal?.aborted) cancel(); else request.signal?.addEventListener('abort',cancel,{ once:true });
      controller.signal.throwIfAborted();
      response = await graphFetch(`${GRAPH}/${scope.object_id}`,{ method:'POST',headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded' },
        body:new URLSearchParams(Object.fromEntries(Object.entries(scope.changes).map(([key,value]) => [key,String(value)]))),redirect:'error',signal:controller.signal });
      data = await response.json();
    } catch { return reply({ ok:false,error:{ code:'META_WRITE_UNCERTAIN',message:'A confirmação da Meta ficou indisponível. Confira o estado antes de repetir.' } },502); }
    finally { clearTimeout(timer);request.signal?.removeEventListener('abort',cancel); }
    if (!response.ok || data?.error || data?.ok === false || data?.success !== true) return reply({ ok:false,error:safeProviderError(data?.error,token) });
    return reply({ ok:true,adset:{ success:true },level:scope.level,before });
  } catch (error) {
    return reply({ ok:false,error:{ code:error.code || 'META_WRITE_UNAVAILABLE',message:error.code ? error.message : 'Não foi possível autorizar a alteração na Meta.' } },error.status || 503);
  }
}
