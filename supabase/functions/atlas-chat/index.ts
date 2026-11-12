/** Atlas: authenticated personal conversation, real delegation and confirmed memory. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { AtlasError, executeClaimed, optionalUuid, ownerGate, validateChat } from '../_shared/atlasCore.js';
import { converseAtlas, MANAGER_AGENTS } from '../_shared/atlasManager.js';
import { answerAtlasCsTriage, readAtlasCsClient, readAtlasCsTriage } from '../_shared/atlasCsTriage.js';
import { readAtlasCrmCatalog } from '../_shared/atlasManagerContext.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const missingTable = (error: any) => ['42P01', 'PGRST205'].includes(error?.code);
const db = (res: any) => {
  if (res.error) {
    const msg = String(res.error.message || '');
    if (/ATLAS_REQUEST_CONFLICT/.test(msg)) throw new AtlasError('REQUEST_CONFLICT', 'Este request_id já foi usado para outro pedido.', 409);
    if (/ATLAS_CONVERSATION_BUSY/.test(msg) || (res.error.code === '23505' && msg.includes('atlas_one_processing'))) throw new AtlasError('CONVERSATION_BUSY', 'Atlas já está respondendo nesta conversa. Aguarde a conclusão.', 409);
    if (/ATLAS_SCOPE_CONFLICT/.test(msg)) throw new AtlasError('SCOPE_CONFLICT', 'Inicie uma conversa nova para mudar o cliente.', 409);
    if (/ATLAS_MEMORY_CONFLICT/.test(msg)) throw new AtlasError('MEMORY_CONFLICT', 'Esta memória mudou. Atualize a lista antes de corrigir.', 409);
    if (res.error.code === '42501') throw new AtlasError('ATLAS_FORBIDDEN', 'O acesso a este registro não está permitido.', 403);
    throw new AtlasError('STORAGE_FAILURE', 'Não foi possível confirmar a gravação no Planeje. Consulte o histórico antes de tentar novamente.', 503);
  }
  return res.data;
};

async function getProvider(admin: SupabaseClient) {
  const preferred = Deno.env.get('ATLAS_PROVIDER') || 'openai';
  if (!['openai', 'openrouter'].includes(preferred)) throw new AtlasError('PROVIDER_CONFIG', 'O provedor do Atlas precisa ser configurado no servidor.', 503);
  const envName = preferred === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  let key = Deno.env.get(envName);
  if (!key) {
    // This is the only privileged RPC: provider secret lookup. Operational data uses caller.
    const secret = await admin.rpc('get_encrypted_secret', { p_secret_name: envName });
    if (!secret.error && typeof secret.data === 'string') key = secret.data;
  }
  if (!key) throw new AtlasError('PROVIDER_NOT_CONFIGURED', 'A chave do provedor de IA do Atlas ainda não está configurada.', 503);
  const model = Deno.env.get('ATLAS_MODEL') || (preferred === 'openai' ? 'gpt-4o-mini' : 'openai/gpt-4o-mini');
  return { key, model, url: preferred === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions' };
}

function modelCaller(provider: Awaited<ReturnType<typeof getProvider>>) {
  return async ({ messages, tools, maxTokens, signal, json: jsonMode }: any) => {
    let response: Response;
    try {
      response = await fetch(provider.url, { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({ model: provider.model, messages, ...(tools ? { tools, tool_choice: 'auto' } : {}), ...(jsonMode ? { response_format: { type: 'json_object' } } : {}), max_tokens: maxTokens, stream: false }),
      });
    } catch {
      throw new AtlasError(signal.aborted ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', signal.aborted ? 'O provedor excedeu o tempo da consulta.' : 'Não foi possível alcançar o provedor de IA.', 502);
    }
    // Do not echo upstream response text: it may contain credentials or source data.
    if (!response.ok) throw new AtlasError('PROVIDER_FAILURE', response.status === 429 ? 'O provedor atingiu seu limite de uso. Tente novamente mais tarde.' : 'O provedor não concluiu a consulta. Verifique a configuração do Atlas.', 502);
    const data = await response.json();
    return { message: data.choices?.[0]?.message, finish_reason: data.choices?.[0]?.finish_reason, usage: data.usage, model: data.model || provider.model };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Use POST.' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) throw new AtlasError('UNAUTHENTICATED', 'Entre novamente no Planeje.', 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new AtlasError('ATLAS_NOT_CONFIGURED', 'Atlas aguarda configuração no servidor.', 503);
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const authResult = await caller.auth.getUser();
    if (authResult.error || !authResult.data.user) throw new AtlasError('UNAUTHENTICATED', 'A sessão expirou. Entre novamente no Planeje.', 401);
    const user = authResult.data.user;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Read only the server's gate with privilege. No operational/private user records here.
    const settingsResult = await admin.from('atlas_settings').select('owner_id,enabled,auto_memory,monitor_enabled,transcribe_group_audio').eq('id', 'atlas').maybeSingle();
    if (missingTable(settingsResult.error)) throw new AtlasError('ATLAS_NOT_CONFIGURED', 'A base do Atlas ainda não foi instalada.', 403);
    const settings = db(settingsResult);
    const profile = db(await caller.from('profiles').select('id,role,status').eq('id', user.id).maybeSingle());
    const gate = ownerGate(user, profile, settings);
    const raw = await req.text();
    if (raw.length > 18000) throw new AtlasError('INVALID_INPUT', 'Pedido maior que o limite permitido.');
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new AtlasError('INVALID_INPUT', 'Pedido inválido.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AtlasError('INVALID_INPUT', 'Pedido inválido.');
    const action = body.action || 'bootstrap';
    if (!['bootstrap', 'history', 'progress', 'chat', 'save_memory', 'revoke_memory', 'memory_team_scope','inbox', 'mark_inbox', 'cancel_job', 'preferences'].includes(action)) throw new AtlasError('INVALID_INPUT', 'Ação não permitida.');
    if (!gate.enabled) {
      if (action === 'bootstrap') return json({ ok: true, configured: true, enabled: false, agents: MANAGER_AGENTS, clients: [], conversations: [], memories: [] });
      throw new AtlasError('ATLAS_DISABLED', 'Atlas está desligado na configuração do servidor.', 403);
    }

    const expireAbandoned = async () => {
      // Runtime is bounded at 80s. A process killed without cleanup becomes an honest terminal failure after 2min.
      db(await caller.from('atlas_runs').update({ status: 'failed', error: 'Esta consulta foi interrompida antes de terminar. Você pode iniciar uma nova tentativa.', finished_at: new Date().toISOString() })
        .eq('owner_id', user.id).eq('status', 'processing').lt('created_at', new Date(Date.now() - 120000).toISOString()));
    };
    if (['bootstrap', 'history', 'chat'].includes(action)) await expireAbandoned();
    const readMemories = async (clientId?: string | null) => {
      let q = caller.from('atlas_memories').select('id,owner_id,client_id,content,source,state,version,replaces_id,created_at,source_quote,topic,pinned,team_shared,team_shared_at,learning_kind,evidence,source_request_id,source_job_id').eq('owner_id', user.id).eq('state', 'active').order('created_at', { ascending: false }).limit(60);
      if (clientId === null) q = q.is('client_id', null);
      else if (clientId) q = q.or(`client_id.is.null,client_id.eq.${clientId}`);
      return db(await q);
    };
    let crmCatalogPromise: ReturnType<typeof readAtlasCrmCatalog> | undefined;
    const crmCatalog = () => crmCatalogPromise ||= readAtlasCrmCatalog(caller);
    const listClients = async () => {
      const [closed, crm] = await Promise.all([
        caller.from('clientes').select('id,empresa').eq('etapa','closed').order('empresa').limit(200).then(db),
        crmCatalog(),
      ]);
      const clients = new Map<string, { id: string; empresa: string; crm_only: boolean; crm_available: boolean }>(
        (closed || []).map(({ id, empresa }: { id: string; empresa: string }) => [id, { id, empresa, crm_only:false,crm_available:false }]));
      for (const row of crm.clients) clients.set(row.id, { ...row, crm_only:!clients.has(row.id),crm_available:true });
      return [...clients.values()].sort((a,b) => a.empresa.localeCompare(b.empresa,'pt-BR'));
    };
    const checkClient = async (clientId: string | null) => {
      if (!clientId) return;
      const row = db(await caller.from('clientes').select('id').eq('id', clientId).eq('etapa','closed').maybeSingle());
      if (row) return;
      const crm = await crmCatalog();
      if (!crm.available || !crm.clients.some(client => client.id===clientId)) throw new AtlasError('CLIENT_FORBIDDEN', 'Essa conta não está na carteira operacional nem no CRM autorizado atual. Selecione uma conta disponível.', 403);
    };

    const jobFields = 'id,title,task,client_id,conversation_id,origin_run_id,status,steps,result,error,usage,created_at,started_at,finished_at';
    const listInbox = async () => db(await caller.from('atlas_inbox').select('*').eq('owner_id',user.id).neq('state','archived').order('updated_at',{ascending:false}).limit(80));
    if (action === 'inbox') {
      const [items,worker] = await Promise.all([listInbox(),caller.from('atlas_worker_state').select('*').eq('owner_id',user.id).maybeSingle().then(db)]);
      return json({ok:true,items,worker,preferences:{auto_memory:settings.auto_memory,monitor_enabled:settings.monitor_enabled,transcribe_group_audio:settings.transcribe_group_audio}});
    }
    if (action === 'mark_inbox') {
      const id=optionalUuid(body.id,'id'); if(!id)throw new AtlasError('INVALID_INPUT','Escolha um assunto.');
      const patch=body.archive===true?{state:'archived',read_at:new Date().toISOString()}:{read_at:new Date().toISOString()};
      const item=db(await caller.from('atlas_inbox').update(patch).eq('id',id).eq('owner_id',user.id).select('id').maybeSingle());
      return json({ok:Boolean(item)});
    }
    if (action === 'cancel_job') {
      const id=optionalUuid(body.id,'id'); if(!id)throw new AtlasError('INVALID_INPUT','Escolha uma missão.');
      // Only this private job is affected. Conditional update prevents cancelling a finished result.
      const item=db(await admin.from('atlas_jobs').update({status:'cancelled',finished_at:new Date().toISOString(),lease_token:null,lease_until:null}).eq('id',id).eq('owner_id',user.id).in('status',['queued','running','waiting_team']).select('id').maybeSingle());
      return json({ok:true,cancelled:Boolean(item)});
    }
    if (action === 'preferences') {
      const patch:any={}; for(const field of ['auto_memory','monitor_enabled','transcribe_group_audio'])if(typeof body[field]==='boolean')patch[field]=body[field];
      if(!Object.keys(patch).length)throw new AtlasError('INVALID_INPUT','Preferência inválida.');
      db(await admin.from('atlas_settings').update(patch).eq('id','atlas').eq('owner_id',user.id));
      return json({ok:true});
    }
    if (action === 'bootstrap') {
      const [clients, conversations, memories, jobs, inbox, worker] = await Promise.all([
        listClients(),
        caller.from('atlas_conversations').select('id,title,client_id,updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }).limit(40).then(db),
        readMemories(),
        caller.from('atlas_jobs').select(jobFields).eq('owner_id',user.id).order('created_at',{ascending:false}).limit(30).then(db),
        listInbox(),
        caller.from('atlas_worker_state').select('*').eq('owner_id',user.id).maybeSingle().then(db),
      ]);
      return json({ ok: true, configured: true, enabled: true, agents: MANAGER_AGENTS, clients, conversations, memories, jobs, inbox, worker, preferences:{auto_memory:settings.auto_memory,monitor_enabled:settings.monitor_enabled,transcribe_group_audio:settings.transcribe_group_audio} });
    }
    if (action === 'progress') {
      const requestId = optionalUuid(body.request_id, 'request_id');
      if (!requestId) throw new AtlasError('INVALID_INPUT', 'Escolha uma missão.');
      const run = db(await caller.from('atlas_runs').select('id,request_id,conversation_id,status,steps,created_at').eq('owner_id', user.id).eq('request_id', requestId).maybeSingle());
      return json({ ok: true, run });
    }
    if (action === 'history') {
      const conversationId = optionalUuid(body.conversation_id, 'conversation_id');
      if (!conversationId) throw new AtlasError('INVALID_INPUT', 'Escolha uma conversa.');
      const conversation = db(await caller.from('atlas_conversations').select('id,title,client_id,updated_at').eq('id', conversationId).eq('owner_id', user.id).maybeSingle());
      if (!conversation) throw new AtlasError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada.', 404);
      const [messages, runs, jobs] = await Promise.all([
        caller.from('atlas_messages').select('id,role,content,created_at,run_id').eq('conversation_id', conversationId).eq('owner_id', user.id).order('created_at', { ascending: false }).limit(100).then(db),
        caller.from('atlas_runs').select('id,request_id,status,steps,result,error,usage,created_at').eq('conversation_id', conversationId).eq('owner_id', user.id).order('created_at', { ascending: false }).limit(30).then(db),
        caller.from('atlas_jobs').select(jobFields).eq('conversation_id',conversationId).eq('owner_id',user.id).order('created_at',{ascending:false}).limit(30).then(db),
      ]);
      return json({ ok: true, conversation, messages: messages.reverse(), runs, jobs });
    }
    if (action === 'save_memory') {
      const clientId = optionalUuid(body.client_id, 'client_id');
      const replacesId = optionalUuid(body.replaces_id, 'replaces_id');
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (body.confirmed !== true || !content || content.length > 4000) throw new AtlasError('MEMORY_CONFIRM_REQUIRED', 'Confirme uma memória de até 4.000 caracteres.');
      await checkClient(clientId);
      const memory = db(await caller.rpc('atlas_save_memory', { p_content: content, p_client_id: clientId, p_confirmed: true, p_replaces_id: replacesId }));
      return json({ ok: true, memory });
    }
    if(action==='memory_team_scope'){
      const id=optionalUuid(body.memory_id,'memory_id');
      if(!id||typeof body.shared!=='boolean')throw new AtlasError('INVALID_INPUT','Selecione a memória e seu uso operacional.');
      const memory=db(await caller.rpc('atlas_memory_team_scope',{p_memory:id,p_shared:body.shared}));
      return json({ok:true,memory});
    }
    if (action === 'revoke_memory') {
      const memoryId = optionalUuid(body.memory_id, 'memory_id');
      if (!memoryId) throw new AtlasError('INVALID_INPUT', 'Selecione a memória.');
      const updated = db(await caller.from('atlas_memories').update({ state: 'revoked', revoked_at: new Date().toISOString() }).eq('id', memoryId).eq('owner_id', user.id).eq('state', 'active').select('id').maybeSingle());
      if (!updated) throw new AtlasError('MEMORY_CONFLICT', 'A memória já mudou. Atualize a lista.', 409);
      return json({ ok: true });
    }

    const input = validateChat(body);
    await checkClient(input.client_id);
    let latestProgress: any = { steps: [], usage: {} };
    const finish = async (run: any, status: string, content: string | null, error: string | null) => db(await caller.rpc('atlas_finish_run', {
      p_run_id: run.id, p_status: status, p_content: content, p_steps: latestProgress.steps, p_usage: latestProgress.usage, p_error: error,
    }));
    const response = await executeClaimed({
      input,
      claim: async (p: any) => db(await caller.rpc('atlas_claim_run', { p_request_id: p.request_id, p_conversation_id: p.conversation_id, p_client_id: p.client_id, p_message: p.message })),
      execute: async (run: any) => {
        if (input.cs_portfolio || input.cs_client) {
          const snapshot = input.cs_client ? await readAtlasCsClient(caller, input.client_id) : await readAtlasCsTriage(caller);
          return answerAtlasCsTriage({ question: input.question, snapshot,
            callModel: async (request: any) => modelCaller(await getProvider(admin))(request) });
        }
        const provider = await getProvider(admin);
        const [memories,previous,clients,jobs] = await Promise.all([
          caller.rpc('atlas_recall',{p_query:input.message,p_client_id:input.client_id}).then(db),
          caller.from('atlas_messages').select('role,content,created_at').eq('conversation_id',run.conversation_id).eq('owner_id',user.id).neq('run_id',run.id).order('created_at',{ascending:false}).limit(8).then(db),
          listClients(),
          caller.from('atlas_jobs').select('id,title,status,result,error,client_id,created_at,finished_at').eq('owner_id',user.id).eq('conversation_id',run.conversation_id).order('created_at',{ascending:false}).limit(5).then(db),
        ]);
        const reply=await converseAtlas({message:input.message,history:previous.reverse(),memories,clients,clientId:input.client_id,jobs:jobs.map((j:any)=>({...j,result:j.result?.slice(0,5000)})),callModel:modelCaller(provider)});
        const steps:any[]=[];
        if(reply.mission){
          const active=db(await caller.from('atlas_jobs').select('id',{count:'exact'}).eq('owner_id',user.id).in('status',['queued','running']).limit(8));
          if(active.length>=6)throw new AtlasError('QUEUE_FULL','Há seis missões em andamento. Aguarde uma delas ou cancele uma missão.',429);
          const job=db(await caller.from('atlas_jobs').insert({owner_id:user.id,conversation_id:run.conversation_id,origin_run_id:run.id,...reply.mission}).select('id,title').single());
          reply.reply=`Vou conferir isso com os agentes. Assim que terminarem, te conto aqui. Pode continuar falando comigo.`;
          steps.push({agent:'central',kind:'queued',status:'queued',summary:`Missão recebida: ${job.title}`,job_id:job.id,at:new Date().toISOString()});
        }
        let learned=0;
        if(settings.auto_memory)for(const memory of reply.memories){
          const saved=await caller.rpc('atlas_learn',{p_run_id:run.id,p_content:memory.content,p_quote:memory.quote,p_topic:memory.topic,p_replaces_id:memory.replaces_id});
          if(!saved.error && saved.data)learned++;
          else steps.push({agent:'central',kind:'memory',status:'failed',summary:'Uma memória não foi salva; a conversa está preservada.',at:new Date().toISOString()});
        }
        if(learned)steps.push({agent:'central',kind:'memory',status:'completed',summary:`${learned} informação(ões) guardada(s) com origem na sua fala.`,at:new Date().toISOString()});
        steps.push({agent:'central',kind:'answer',status:'completed',summary:'Atlas respondeu. As missões seguem em segundo plano.',at:new Date().toISOString()});
        latestProgress={steps,usage:reply.usage};
        return {content:reply.reply,steps,usage:reply.usage};
      },
      complete: async (run: any, result: any) => { latestProgress = result; return finish(run, 'completed', result.content, null); },
      fail: async (run: any, error: string) => finish(run, 'failed', null, error),
    });
    return json(response);
  } catch (error) {
    if (error instanceof AtlasError) return json({ ok: false, configured: error.code !== 'ATLAS_NOT_CONFIGURED', code: error.code, error: error.message }, error.status);
    return json({ ok: false, code: 'ATLAS_FAILURE', error: 'Atlas não concluiu o pedido. Consulte o histórico antes de tentar novamente.' }, 500);
  }
});
