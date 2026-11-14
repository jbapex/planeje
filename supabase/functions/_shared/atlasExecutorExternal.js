import { AtlasError,optionalUuid } from './atlasCore.js';
import { META_WRITE_API_VERSION,requireMetaWriteScope,readMetaWriteObject } from './metaWriteAuthorization.js';
import { executeMetaCampaignPlan } from './atlasMetaCampaign.js';
import { createMetaCampaignTransport,reconcileMetaCampaignReceipt } from './atlasExecutorMetaCampaign.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code,message,status = 400) => { throw new AtlasError(code,message,status); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const OFFSET_ONE = new Set('CLP COP CRC HUF ISK IDR JPY KRW PYG TWD VND'.split(' '));
const OFFSET_HUNDRED = new Set('AED ARS AUD BDT BGN BHD BOB BRL CAD CHF CNY CZK DKK DZD EGP EUR GBP GTQ HKD HNL HRK ILS INR JOD KES LKR LVL LTL MOP MXN MYR NGN NIO NOK NZD PEN PHP PKR PLN QAR RON RSD RUB SAR SEK SGD SKK THB TRY UAH USD UYU VEF VES ZAR FBZ'.split(' '));
async function timed(signal,milliseconds,run) {
  const controller = new AbortController(),abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();else signal?.addEventListener('abort',abort,{ once:true });
  const timer = setTimeout(() => controller.abort(new Error('EXTERNAL_DEADLINE')),milliseconds);
  try { return await run(controller.signal); }
  finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
}
async function rpc(client,name,args) {
  const { data,error } = await client.rpc(name,args);
  if (error) fail(error.code === '40001' ? 'EXECUTOR_CONFLICT' : 'EXTERNAL_ACCESS_DENIED','Não foi possível validar ou persistir esta operação externa.',error.code === '40001' ? 409 : 403);
  if (!object(data)) fail('EXTERNAL_LEDGER_UNAVAILABLE','O ledger externo não confirmou a operação.',503);
  return data;
}
function identity(envelope) {
  if (!object(envelope?.item) || !optionalUuid(envelope.item.id,'item') || !optionalUuid(envelope.source_session_id,'source_session_id')) fail('EXTERNAL_LEDGER_UNAVAILABLE','O ledger externo não confirmou a identidade da operação.',503);
  return envelope;
}
const status = async (caller,id) => identity(await rpc(caller,'atlas_executor_external_status',{ p_id:id }));
function nativeBody(item) { return { cliente_id:item.client_id,...item.payload }; }
async function scopeFor({ caller,request,createCaller,item }) {
  if (item.app !== 'gestor' || item.action !== 'update_meta' || item.kind !== 'proposal' || !item.payload?.adAccountId) fail('EXTERNAL_ACTION_UNSUPPORTED','A alteração Meta não tem escopo explícito.');
  const scope = await requireMetaWriteScope({ request,body:nativeBody(item),createCaller:createCaller || (() => caller) });
  if (scope.actor_id !== item.owner_id || scope.client_id !== item.client_id || scope.account_id !== item.payload.adAccountId) fail('EXTERNAL_ACCESS_DENIED','A sessão não corresponde ao proprietário e à conta aprovados.',403);
  return scope;
}
function desired(snapshot,payload) {
  return (!Object.hasOwn(payload,'status') || snapshot.configured_status === payload.status)
    && ['daily_budget','lifetime_budget'].every(key => !Object.hasOwn(payload,key) || snapshot[key] === payload[key]);
}
const safeError = code => ({ code,message:'A operação externa não foi confirmada. Confira o histórico antes de continuar.' });
const receiptFor = (scope,snapshot,verified) => ({ id:scope.object_id,account_id:scope.account_id,step:'update',verified,...(snapshot && { snapshot }),verification:'observed_state' });
async function readSnapshot({ scope,token,graphFetch,signal,authorize }) {
  await authorize?.();signal?.throwIfAborted();
  const snapshot = await readMetaWriteObject({ scope,token,graphFetch,signal });
  await authorize?.();signal?.throwIfAborted();
  let response,data;
  try {
    ({ response,data } = await timed(signal,10000,async bounded => {
      const response = await graphFetch(`https://graph.facebook.com/${META_WRITE_API_VERSION}/${scope.account_id}?fields=id,account_id,currency`,{ method:'GET',headers:{ Authorization:`Bearer ${token}` },redirect:'error',signal:bounded });
      return { response,data:await response.json() };
    }));
  } catch { fail('META_CURRENCY_UNAVAILABLE','Não foi possível conferir a moeda atual da conta Meta.',502); }
  if (!response.ok || data?.error || data?.id !== scope.account_id || `act_${data?.account_id}` !== scope.account_id || typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) fail('META_CURRENCY_UNAVAILABLE','Não foi possível conferir conta e moeda atuais na Meta.',502);
  const offset = OFFSET_ONE.has(data.currency) ? 1 : OFFSET_HUNDRED.has(data.currency) ? 100 : null;
  if (scope.budget && !offset) fail('META_CURRENCY_UNSUPPORTED','A moeda desta conta não tem conversão de verba implementada.');
  return { ...snapshot,currency:data.currency,currency_offset:offset };
}
function budgetDisplay(snapshot) {
  return Object.fromEntries(['daily_budget','lifetime_budget'].filter(key => Number.isSafeInteger(snapshot[key]) && snapshot.currency_offset).map(key => {
    const value = BigInt(snapshot[key]),offset = BigInt(snapshot.currency_offset),amount = snapshot.currency_offset === 1 ? String(value) : `${value / offset}.${String(value % offset).padStart(2,'0')}`;
    return [key,{ minor:snapshot[key],amount,currency:snapshot.currency }];
  }));
}
function reviewSnapshot(snapshot) {
  const budgets = budgetDisplay(snapshot),status = { ACTIVE:'Ativo',PAUSED:'Pausado',ARCHIVED:'Arquivado',DELETED:'Excluído' }[snapshot.configured_status] || snapshot.configured_status;
  return { 'Conta Meta':snapshot.account_id,Objeto:snapshot.object_id,Nível:{ campaign:'Campanha',adset:'Conjunto de anúncios',ad:'Anúncio' }[snapshot.level],Status:status,
    ...Object.fromEntries(Object.entries(budgets).map(([key,value]) => [key === 'daily_budget' ? 'Orçamento diário' : 'Orçamento total',`${value.currency} ${value.amount}`])) };
}

/** Preparation reads the current object with the real user's JWT; it never approves or reserves a write. */
export async function prepareExecutorMetaUpdate(caller,{ clientId,input = {},request,createCaller,readToken,graphFetch = fetch,signal }) {
  clientId = optionalUuid(clientId,'client_id');
  const allowed = ['account_id','object_id','level','status','daily_budget','lifetime_budget'];
  if (!clientId || !object(input) || Object.keys(input).some(key => !allowed.includes(key)) || typeof input.account_id !== 'string' || !/^act_\d{1,32}$/.test(input.account_id)) fail('META_WRITE_INPUT','Escolha cliente, conta explícita e objeto da alteração.');
  signal?.throwIfAborted();
  const body = { cliente_id:clientId,adAccountId:input.account_id,objectId:input.object_id,level:input.level || 'adset',...Object.fromEntries(['status','daily_budget','lifetime_budget'].filter(key => Object.hasOwn(input,key)).map(key => [key,input[key]])) };
  const scope = await requireMetaWriteScope({ request,body,createCaller:createCaller || (() => caller) });
  const token = await readToken();
  if (typeof token !== 'string' || !token) fail('META_WRITE_TOKEN','Credencial Meta indisponível no servidor.',503);
  const before = await readSnapshot({ scope,token,graphFetch,signal,authorize:() => requireMetaWriteScope({ request,body,createCaller:createCaller || (() => caller) }) });
  const payload = { adAccountId:scope.account_id,objectId:scope.object_id,level:scope.level,...scope.changes };
  const after = { ...before,...(scope.changes.status && { configured_status:scope.changes.status }),...Object.fromEntries(Object.entries(scope.changes).filter(([key]) => key !== 'status')) };
  return { app:'gestor',action:'update_meta',operation:'meta.update',client_id:clientId,title:'Alterar status ou verba na Meta',
    effect:{ type:'advertising_change',external:true,enables_autonomy:false },payload,before,preview:{ before:reviewSnapshot(before),after:reviewSnapshot(after) },
    links:[{ label:'Gestor IA',href:`/gestor-ia/clientes/${clientId}?conta=${scope.account_id}` }] };
}

/**
 * Scoped durable callbacks for executeMetaCampaignPlan. Caller and service are distinct clients:
 * caller carries the user's original JWT; service only invokes the narrow ledger RPCs.
 */
export async function createExecutorExternalSteps({ caller,service,request,item,sourceSessionId }) {
  if (!request?.headers?.get('Authorization')) fail('EXTERNAL_ACCESS_DENIED','Sessão autenticada necessária.',401);
  const initial = await status(caller,optionalUuid(item?.id,'item'));
  if (sourceSessionId && sourceSessionId !== initial.source_session_id) fail('EXTERNAL_ACCESS_DENIED','A sessão desta aprovação mudou.',403);
  const source = initial.source_session_id,approved = initial.item,leases = new Map();
  if (!same([item.owner_id,item.client_id,item.action,item.payload,item.before],[approved.owner_id,approved.client_id,approved.action,approved.payload,approved.before])) fail('EXECUTOR_CONFLICT','A especificação desta operação mudou.',409);
  const check = async () => {
    const current = await status(caller,approved.id);
    if (current.source_session_id !== source || !same([current.item.payload,current.item.before,current.item.action],[approved.payload,approved.before,approved.action])) fail('EXECUTOR_CONFLICT','A especificação aprovada mudou.',409);
    return current;
  };
  const serviceArgs = { p_item:approved.id,p_source_session:source };
  return {
    sourceSessionId:source,
    async reserveStep({ step,account_id,request:write }) {
      const expected = approved.action === 'update_meta' ? approved.payload.adAccountId : approved.payload.plan?.account_id;
      if (account_id !== expected) fail('EXTERNAL_ACCESS_DENIED','A conta não corresponde à aprovação.',403);
      await check();
      const row = await rpc(service,'atlas_executor_external_reserve',{ ...serviceArgs,p_step:step,p_request:write });
      if (row.lease) leases.set(step,row.lease);
      return row;
    },
    async finishStep({ step,lease,state,receipt = null,error = null }) {
      await check();
      if (!lease) lease = leases.get(step);
      if (!lease) {
        const saved = await rpc(service,'atlas_executor_external_get',serviceArgs);
        lease = saved.steps?.find(row => row.step === step)?.lease;
      }
      if (!optionalUuid(lease,'lease')) fail('EXTERNAL_LEDGER_UNAVAILABLE','A reserva da etapa não foi confirmada.',503);
      return rpc(service,'atlas_executor_external_finish',{ ...serviceArgs,p_step:step,p_lease:lease,p_state:state,p_receipt:receipt,p_error:error && safeError(error.code) });
    },
    async get() { await check();return rpc(service,'atlas_executor_external_get',serviceArgs); },
    async current() { return (await check()).item; },
  };
}

async function persistOrPending(callbacks,item,state,receipt,code,lease) {
  try {
    const saved = await callbacks.finishStep({ step:'update',lease,state,receipt,error:state === 'completed' ? null : safeError(code) });
    return saved.item;
  } catch {
    // No durable receipt means no success claim and, crucially, no permission to repeat the POST.
    let current = item;
    try { current = await callbacks.current(); } catch { /* Revocation also blocks recovery transport. */ }
    return { ...current,external_unconfirmed:true,error:safeError('EXTERNAL_RECEIPT_UNCONFIRMED') };
  }
}

/** Human approval -> durable single reservation -> compare -> one POST -> authorized readback. */
async function executeApprovedUpdate({ caller,service,request,createCaller,readToken,id,revision,graphFetch = fetch,signal }) {
  id = optionalUuid(id,'item');
  if (!id || !Number.isInteger(revision) || revision < 1) fail('INVALID_INPUT','Informe item e revisão da aprovação.');
  let envelope = await status(caller,id),item = envelope.item;
  let scope = await scopeFor({ caller,request,createCaller,item });
  envelope = identity(await rpc(caller,'atlas_executor_external_approve',{ p_id:id,p_revision:revision }));item = envelope.item;
  const callbacks = await createExecutorExternalSteps({ caller,service,request,item,sourceSessionId:envelope.source_session_id });
  const write = { method:'POST',path:`/${META_WRITE_API_VERSION}/${scope.object_id}`,body:scope.changes };
  const claim = await callbacks.reserveStep({ step:'update',account_id:scope.account_id,request:write });
  if (!claim.claimed) return callbacks.current();
  let token,before;
  try {
    signal?.throwIfAborted();
    token = await readToken();
    if (typeof token !== 'string' || !token) fail('META_WRITE_TOKEN','Credencial Meta indisponível.',503);
    before = await readSnapshot({ scope,token,graphFetch,signal,authorize:callbacks.current });
  } catch (error) {
    if ([401,403].includes(error.status)) throw error;
    return persistOrPending(callbacks,item,'failed',null,'META_BEFORE_UNAVAILABLE',claim.lease);
  }
  if (!same(before,item.before)) return persistOrPending(callbacks,item,'conflict',receiptFor(scope,before,false),'META_BEFORE_CHANGED',claim.lease);
  // Recheck the real user's permissions after reading and before sending. No transaction spans the network.
  await callbacks.get();scope = await scopeFor({ caller,request,createCaller,item });
  if (signal?.aborted) return persistOrPending(callbacks,item,'failed',null,'META_CANCELLED_BEFORE_SEND',claim.lease);
  let response,data;
  try {
    ({ response,data } = await timed(signal,15000,async bounded => {
      const response = await graphFetch(`https://graph.facebook.com${write.path}`,{ method:'POST',headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded' },
        body:new URLSearchParams(Object.fromEntries(Object.entries(scope.changes).map(([key,value]) => [key,String(value)]))),redirect:'error',signal:bounded });
      return { response,data:await response.json() };
    }));
  } catch { return persistOrPending(callbacks,item,'uncertain',receiptFor(scope,null,false),'META_TRANSPORT_UNCERTAIN',claim.lease); }
  if (!response.ok || data?.error || data?.ok === false || data?.success !== true) {
    const definitive = object(data?.error) && data.error.is_transient !== true && response.status < 500 && [10,100,102,104,190,200,2500,294,368].includes(data.error.code);
    return persistOrPending(callbacks,item,definitive ? 'failed' : 'uncertain',receiptFor(scope,null,false),'META_GRAPH_UNCONFIRMED',claim.lease);
  }
  let after;
  try {
    await callbacks.get();scope = await scopeFor({ caller,request,createCaller,item });
    after = await readSnapshot({ scope,token,graphFetch,signal,authorize:callbacks.current });
  } catch { return persistOrPending(callbacks,item,'uncertain',receiptFor(scope,null,false),'META_READBACK_UNCONFIRMED',claim.lease); }
  const verified = desired(after,item.payload);
  return persistOrPending(callbacks,item,verified ? 'completed' : 'uncertain',receiptFor(scope,after,verified),verified ? null : 'META_READBACK_DIVERGED',claim.lease);
}

async function executeApprovedCampaign({ caller,service,request,readToken,id,revision,graphFetch = fetch,signal,now }) {
  let envelope = await status(caller,id),item = envelope.item;
  if (item.app !== 'gestor' || item.kind !== 'proposal' || item.action !== 'create_meta_campaign') fail('EXTERNAL_ACTION_UNSUPPORTED','Esta criação externa não está disponível.');
  if (['completed','failed','conflict','uncertain'].includes(item.state)) return item;
  // Rebuild and re-prove the exact plan, currency and assets before recording the approval.
  const transport = await createMetaCampaignTransport(caller,{ clientId:item.client_id,plan:item.payload.plan,signal },{ request,readToken,graphFetch,now });
  envelope = identity(await rpc(caller,'atlas_executor_external_approve',{ p_id:id,p_revision:revision }));item = envelope.item;
  const callbacks = await createExecutorExternalSteps({ caller,service,request,item,sourceSessionId:envelope.source_session_id });
  const result = await executeMetaCampaignPlan({ plan:item.payload.plan,signal,reserveStep:callbacks.reserveStep,finishStep:callbacks.finishStep,
    callGraph:async spec => { await callbacks.current();signal?.throwIfAborted();return transport(spec); } });
  const current = await callbacks.current();
  // A missing receipt remains a live reservation until SQL expires it; never fabricate a terminal state.
  return result.state === 'uncertain' && current.state === 'executing' ? { ...current,external_unconfirmed:true,error:safeError('EXTERNAL_RECEIPT_UNCONFIRMED') } : current;
}

export async function decideExecutorExternal(input) {
  const id = optionalUuid(input.id,'item');
  if (!id || !Number.isInteger(input.revision) || input.revision < 1) fail('INVALID_INPUT','Informe item e revisão da aprovação.');
  return timed(input.signal || input.request?.signal,55000,async signal => {
    const envelope = await status(input.caller,id);
    return envelope.item.action === 'create_meta_campaign' ? executeApprovedCampaign({ ...input,id,signal }) : executeApprovedUpdate({ ...input,id,signal });
  });
}

/** GET-only recovery. A live reservation is left to its original attempt; an expired one becomes uncertain in SQL. */
async function reconcileUpdate({ caller,service,request,createCaller,readToken,id,graphFetch = fetch,signal }) {
  const envelope = await status(caller,optionalUuid(id,'item')),item = envelope.item;
  if (item.action !== 'update_meta') fail('EXTERNAL_RECONCILE_UNSUPPORTED','A criação exige conferência dos recibos de cada etapa.');
  const scope = await scopeFor({ caller,request,createCaller,item });
  const callbacks = await createExecutorExternalSteps({ caller,service,request,item,sourceSessionId:envelope.source_session_id });
  const saved = await callbacks.get(),step = saved.steps?.find(row => row.step === 'update');
  if (!step || ['completed','failed','conflict'].includes(step.state) || step.state === 'reserved') return saved.item;
  if (step.state !== 'uncertain') fail('EXTERNAL_LEDGER_UNAVAILABLE','O estado desta tentativa não permite conferência.',409);
  signal?.throwIfAborted();
  const token = await readToken();
  if (typeof token !== 'string' || !token) fail('META_WRITE_TOKEN','Credencial Meta indisponível.',503);
  let snapshot;
  try { snapshot = await readSnapshot({ scope,token,graphFetch,signal,authorize:callbacks.current }); }
  catch { return persistOrPending(callbacks,item,'uncertain',step.receipt || null,'META_READBACK_UNCONFIRMED',step.lease); }
  const verified = desired(snapshot,item.payload);
  return persistOrPending(callbacks,item,verified ? 'completed' : 'uncertain',receiptFor(scope,snapshot,verified),verified ? null : 'META_READBACK_DIVERGED',step.lease);
}

export async function reconcileExecutorExternal(input) {
  return timed(input.signal || input.request?.signal,45000,async signal => {
    const envelope = await status(input.caller,optionalUuid(input.id,'item'));
    if (envelope.item.action !== 'create_meta_campaign') return reconcileUpdate({ ...input,signal });
    const item = envelope.item,callbacks = await createExecutorExternalSteps({ ...input,item,sourceSessionId:envelope.source_session_id });
    const saved = await callbacks.get(),receipts = Object.fromEntries((saved.steps || []).filter(row => row.state === 'completed').map(row => [row.step,row.receipt]));
    // Recovery never starts an absent step and never races an active reservation.
    for (const row of saved.steps || []) {
      if (row.state !== 'uncertain' || !row.receipt?.id) continue;
      await callbacks.current();signal.throwIfAborted();
      const result = await reconcileMetaCampaignReceipt(input.caller,{ clientId:item.client_id,plan:item.payload.plan,step:row.step,receipt:row.receipt,receipts,signal },
        { request:input.request,readToken:input.readToken,graphFetch:input.graphFetch || fetch,now:input.now });
      const finished = await callbacks.finishStep({ step:row.step,lease:row.lease,state:result.state,receipt:result.receipt,error:result.error });
      if (finished.state === 'completed') receipts[row.step] = finished.receipt;
    }
    return callbacks.current();
  });
}
