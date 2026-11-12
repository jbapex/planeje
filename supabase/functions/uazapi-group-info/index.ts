/**
 * Lista participantes de um grupo WhatsApp via uazapi POST /group/info.
 * Atendimento: { group_jid, conversation_id?, whatsapp_config_id?, cliente_id?, sync_contacts? }
 * CS: { cs_client_id, conversation_id, wa_client_id, channel_id, group_jid }
 * Inventário do CS: { cs_action: 'inventory_members', conversation_id, wa_client_id, channel_id, group_jid }
 * Registro no CS: { cs_action: 'register', channel_id, group_jid, name }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function responseError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isLidJid(jid: string): boolean {
  return /@lid$/i.test(String(jid || '').trim());
}

function isPlausiblePhone(digits: string): boolean {
  if (!digits || digits.length < 10 || digits.length > 13) return false;
  return digits.length <= 13;
}

function jidLocalPart(jid: string): string {
  return String(jid || '').replace(/@.*$/, '').trim();
}

function phoneFromJidMaybe(jid: string): string {
  if (!jid || isLidJid(jid)) return '';
  const d = digitsOnly(jidLocalPart(jid));
  return isPlausiblePhone(d) ? d : '';
}

function pickStr(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v === 'number') return String(v);
  }
  return '';
}

function normalizeParticipant(raw: Record<string, unknown>) {
  const jid = pickStr(raw, 'JID', 'jid', 'PhoneNumber', 'phoneNumber');
  const lid = pickStr(raw, 'LID', 'lid');
  const displayName = pickStr(raw, 'DisplayName', 'displayName', 'name', 'pushName', 'notifyName');
  const phone =
    phoneFromJidMaybe(pickStr(raw, 'PhoneNumber', 'phoneNumber')) ||
    phoneFromJidMaybe(jid) ||
    '';
  const fromJid = lid || jid || (phone ? `${phone}@s.whatsapp.net` : '');
  const isAdmin = raw.IsAdmin === true || raw.isAdmin === true;
  const isSuperAdmin = raw.IsSuperAdmin === true || raw.isSuperAdmin === true;

  return {
    jid: jid || null,
    lid: lid || null,
    from_jid: fromJid || null,
    phone: phone || null,
    display_name: displayName || null,
    is_admin: isAdmin,
    is_super_admin: isSuperAdmin,
  };
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const groupId = /^[a-z0-9-]{1,196}@g\.us$/;
const instanceSubdomain = /^[a-z0-9][a-z0-9-]{0,62}$/i;

function sessionIdFromVerifiedToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.session_id === 'string' && uuid.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}

function requestGroupInfo(baseUrl: string, token: string, jid: string, signal?: AbortSignal) {
  return fetch(`${baseUrl}/group/info`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', token }, signal,
    body: JSON.stringify({ groupjid: jid, getInviteLink: false, getRequestsParticipants: false, force: true }),
  }).catch(() => null);
}

async function registerCsGroup(
  body: Record<string, unknown>, role: string, actorId: string, verifiedToken: string,
  caller: ReturnType<typeof createClient>, service: ReturnType<typeof createClient>,
) {
  const sessionId = sessionIdFromVerifiedToken(verifiedToken);
  if (!sessionId || !['admin', 'superadmin'].includes(role)) return responseError('Sem acesso para registrar grupos no CS.', 403);
  const channelId = typeof body.channel_id === 'string' ? body.channel_id : '';
  const jid = typeof body.group_jid === 'string' ? body.group_jid.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!uuid.test(channelId) || !groupId.test(jid) || !name || name.length > 120) {
    return responseError('Confira o canal, o ID do grupo e o nome de até 120 caracteres.', 400);
  }
  const { data: channel, error: channelError } = await caller.rpc('cs_ia_group_registration_channels', { p_channel_id: channelId }).maybeSingle();
  if (channelError || channel?.id !== channelId || !channel.wa_client_id || !channel.revision) {
    return responseError('Canal indisponível para esta sessão.', 403);
  }
  const { data: existing, error: lookupError } = await caller.from('atendimento_conversas').select('id,is_group,bloqueada,archived_at')
    .eq('cliente_id', channel.wa_client_id).eq('whatsapp_config_id', channelId).eq('chat_jid', jid).maybeSingle();
  if (lookupError) return responseError('Não foi possível consultar a conversa deste canal.', 502);
  if (existing) {
    return existing.is_group && !existing.bloqueada && !existing.archived_at
      ? Response.json({ id: existing.id, created: false }, { headers: corsHeaders })
      : responseError('A conversa existente está indisponível neste canal.', 409);
  }

  const { data: config, error: configError } = await service.from('cliente_whatsapp_config').select('id,subdomain,token,updated_at')
    .eq('id', channelId).eq('cliente_id', channel.wa_client_id).eq('provider', 'uazapi').is('archived_at', null).maybeSingle();
  const subdomain = String(config?.subdomain ?? '').trim().replace(/^https?:\/\//i, '').split('/')[0].replace(/\.uazapi\.com$/i, '');
  if (configError || config?.id !== channelId || config.updated_at !== channel.revision || !config.token?.trim() || !instanceSubdomain.test(subdomain)) {
    return responseError('Canal indisponível para esta sessão.', 403);
  }
  const provider = await requestGroupInfo(`https://${subdomain}.uazapi.com`, config.token.trim(), jid, AbortSignal.timeout(12000));
  if (!provider?.ok) return responseError('Não foi possível confirmar o grupo neste canal do WhatsApp.', provider?.status === 404 ? 404 : 502);
  const payload = await provider.json().catch(() => null);
  const group = payload?.group && typeof payload.group === 'object' ? payload.group : payload;
  const providerJid = pickStr(group, 'JID', 'jid', 'groupjid', 'group_jid').toLowerCase();
  if (providerJid !== jid) return responseError('O WhatsApp não confirmou o ID deste grupo.', 409);
  const officialName = (pickStr(group, 'Name', 'name', 'subject') || 'Grupo do WhatsApp').slice(0, 300);
  const { data, error } = await service.rpc('cs_ia_register_group', {
    p_actor_id: actorId, p_session_id: sessionId, p_channel_id: channelId, p_wa_client_id: channel.wa_client_id,
    p_config_revision: channel.revision, p_group_jid: jid, p_official_name: officialName, p_name: name,
  });
  if (error?.code === '42501') return responseError('O acesso ou o canal mudou. Atualize a lista de canais.', 403);
  if (error?.code === '23505') return responseError('Já existe uma conversa ativa para este grupo em outro canal da operação.', 409);
  if (error?.code === '55000') return responseError('A conversa existente está indisponível neste canal.', 409);
  if (error || !data?.id || typeof data.created !== 'boolean') return responseError('Não foi possível registrar o grupo. Tente novamente.', 502);
  return Response.json(data, { headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const authToken = authHeader.slice(7);
  const { data: { user }, error: userError } = await supabase.auth.getUser(authToken);
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('cliente_id, role, status')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? null;
  if (!role || !['superadmin', 'admin', 'colaborador'].includes(role) || profile?.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userDb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  if (body.cs_action === 'register') return registerCsGroup(body, role, user.id, authToken, userDb, supabase);
  const csClientId = typeof body.cs_client_id === 'string' ? body.cs_client_id.trim() : '';
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';
  const inventoryRead = body.cs_action === 'inventory_members';
  const csRead = inventoryRead || 'cs_client_id' in body;
  const readCsSource = () => inventoryRead
    ? userDb.rpc('cs_ia_inventory_group_source', { p_conversation_id: conversationId, p_wa_client_id: body.wa_client_id,
      p_channel_id: body.channel_id, p_group_jid: body.group_jid }).maybeSingle()
    : userDb.rpc('cs_ia_group_source', { p_client_id: csClientId, p_conversation_id: conversationId }).maybeSingle();
  let source;
  if (csRead) {
    if (inventoryRead && (!conversationId || typeof body.wa_client_id !== 'string' || typeof body.channel_id !== 'string' ||
        typeof body.group_jid !== 'string' || !groupId.test(body.group_jid))) return responseError('Confirme o grupo e o canal do inventário.', 400);
    if (!inventoryRead && (!csClientId || !conversationId)) return responseError('Confirme o vínculo do cliente com o grupo.', 400);
    const { data, error } = await readCsSource();
    if (error || data?.id !== conversationId || data.cliente_id !== body.wa_client_id ||
      data.whatsapp_config_id !== body.channel_id || data.chat_jid !== body.group_jid) {
      return responseError('Grupo indisponível para esta sessão.', 403);
    }
    source = data;
  } else {
    const jid = String(body.group_jid ?? body.groupJid ?? body.chat_jid ?? '').trim();
    const client = String(body.cliente_id ?? '').trim() || profile?.cliente_id;
    const channel = typeof body.whatsapp_config_id === 'string' ? body.whatsapp_config_id.trim() : '';
    if (!jid.endsWith('@g.us') || !(client || channel || conversationId)) return responseError('Informe o grupo e seu canal ou cliente.', 400);
    let query = userDb.from('atendimento_conversas').select('id,cliente_id,whatsapp_config_id,chat_jid')
      .eq('chat_jid', jid).eq('is_group', true).eq('bloqueada', false).is('archived_at', null);
    if (client) query = query.eq('cliente_id', client);
    if (channel) query = query.eq('whatsapp_config_id', channel);
    if (conversationId) query = query.eq('id', conversationId);
    const { data, error } = await query.limit(2).maybeSingle();
    if (error || !data) return responseError('Grupo indisponível para esta sessão.', 403);
    source = data;
  }

  const { cliente_id: clienteId, whatsapp_config_id: whatsappConfigId, chat_jid: groupJid } = source;
  if (!clienteId || !whatsappConfigId || !groupJid) return responseError('Grupo indisponível para esta sessão.', 403);
  const { data: config, error: configError } = await supabase
    .from('cliente_whatsapp_config')
    .select('id, subdomain, token')
    .eq('cliente_id', clienteId).eq('id', whatsappConfigId).maybeSingle();
  if (configError || !config?.subdomain || !config?.token) {
    return new Response(JSON.stringify({ error: 'WhatsApp não configurado para este cliente/canal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const subdomain = String(config.subdomain).replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '');
  if (inventoryRead && !instanceSubdomain.test(subdomain)) return responseError('Canal indisponível para esta sessão.', 403);
  const baseUrl = `https://${subdomain}.uazapi.com`;
  const instanceToken = config.token.trim();

  const uazRes = await requestGroupInfo(baseUrl, instanceToken, groupJid, inventoryRead ? AbortSignal.timeout(12000) : undefined);
  if (!uazRes) return responseError('O WhatsApp não respondeu. Tente novamente.', 502);

  let uazData: Record<string, unknown> = {};
  try {
    uazData = (await uazRes.json()) as Record<string, unknown>;
  } catch {
    uazData = {};
  }

  if (csRead) {
    const { data, error } = await readCsSource();
    if (error || data?.id !== conversationId || data.cliente_id !== clienteId ||
      data.whatsapp_config_id !== whatsappConfigId || data.chat_jid !== groupJid) {
      return responseError('O vínculo ou o acesso ao grupo mudou. Atualize o CS e tente novamente.', 403);
    }
  }

  if (!uazRes.ok) {
    if (csRead) return responseError('Não foi possível consultar os membros no WhatsApp. Tente novamente.', 502);
    const errMsg =
      pickStr(uazData, 'error', 'message') ||
      uazRes.statusText ||
      'Erro ao buscar participantes do grupo na uazapi.';
    return new Response(JSON.stringify({ error: errMsg }), {
      status: uazRes.status >= 400 && uazRes.status < 600 ? uazRes.status : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const groupObj = (uazData?.group && typeof uazData.group === 'object'
    ? uazData.group
    : uazData) as Record<string, unknown>;
  if (inventoryRead && pickStr(groupObj, 'JID', 'jid', 'groupjid', 'group_jid').toLowerCase() !== groupJid.toLowerCase()) {
    return responseError('O WhatsApp não confirmou o grupo deste canal.', 502);
  }

  const rawList = (groupObj?.Participants ?? groupObj?.participants ?? []) as unknown[];
  const participants = (Array.isArray(rawList) ? rawList : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => normalizeParticipant(p as Record<string, unknown>))
    .filter((p) => p.from_jid || p.phone);

  const groupName =
    pickStr(groupObj, 'Name', 'name', 'subject') ||
    pickStr(uazData, 'Name', 'name') ||
    null;

  const syncContacts = !csRead && body.sync_contacts !== false;
  if (syncContacts && participants.length) {
    const now = new Date().toISOString();
    for (const p of participants) {
      const contactJid = p.from_jid;
      if (!contactJid) continue;
      const contactName = p.display_name || p.phone || null;
      await supabase.from('cliente_whatsapp_contact').upsert(
        {
          cliente_id: clienteId,
          from_jid: contactJid,
          phone: p.phone || null,
          sender_name: contactName,
          whatsapp_config_id: config.id,
          last_message_at: now,
          updated_at: now,
        },
        {
          onConflict: 'cliente_id,from_jid',
          ignoreDuplicates: false,
        },
      );
      if (p.phone) {
        const phoneJid = `${p.phone}@s.whatsapp.net`;
        if (phoneJid !== contactJid) {
          await supabase.from('cliente_whatsapp_contact').upsert(
            {
              cliente_id: clienteId,
              from_jid: phoneJid,
              phone: p.phone,
              sender_name: contactName,
              whatsapp_config_id: config.id,
              last_message_at: now,
              updated_at: now,
            },
            { onConflict: 'cliente_id,from_jid', ignoreDuplicates: false },
          );
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      group_jid: groupJid,
      group_name: groupName,
      participant_count: participants.length,
      participants,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
