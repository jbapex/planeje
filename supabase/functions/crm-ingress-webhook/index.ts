import { runMiniCrmMessage } from "../_shared/miniCrmMessageRunner.js";
/**
 * Webhook de entrada genérico — CRMs externos, Meta Cloud, JSON canônico (sem uazapi).
 * URL: POST .../crm-ingress-webhook?cliente_id=UUID&secret=SECRET&channel_id=opcional
 * Auth: secret do cliente (ingress_webhook_secret) ou secret do canal (webhook_secret).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeInboundPayload,
  splitMetaMessages,
  normChannelKey,
  type InboundNormalized,
} from "../_shared/inboundNormalize.ts";
import { lookupChatvoltConversationAttribution } from "../_shared/chatvoltConversationAttribution.js";
import { attributionEvidence, persistIngressContactAttribution } from "../_shared/contactAttributionHistory.js";
import { ingressMessageSource } from "../_shared/ingressMessageSource.js";
import { attachStoredThumbnail } from "../_shared/persistAdThumbnail.ts";
import {
  claimTrackableClickMatch,
  extractMatchCode,
  hasCtwaTrackingSignal,
  trackingFromMatchedClick,
} from "../_shared/rastreamentoTrackableLink.ts";
import { maybeSendGoogleLeadSubmitted } from "../_shared/googleAdsClickConversion.ts";
import { applyRastreamentoConversionFromWebhook } from "../uazapi-inbox-webhook/applyRastreamentoConversion.ts";
import { hasStoredContactAttribution, lookupInitialMessageLink, mergeContactAttributionMetadata, trackingFromInitialMessageLink } from "../_shared/rastreamentoMessageAttribution.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AuthResult = {
  clienteId: string;
  channelConfig: { id: string; name: string | null } | null;
  authVia: "cliente" | "channel";
};

async function resolveAuth(
  supabase: ReturnType<typeof createClient>,
  secret: string,
  queryClienteId: string | null,
  queryChannelId: string | null
): Promise<AuthResult | null> {
  if (!secret) return null;

  const { data: byClientSecret } = await supabase
    .from("clientes")
    .select("id, ingress_webhook_secret")
    .eq("ingress_webhook_secret", secret)
    .maybeSingle();

  if (byClientSecret?.id && byClientSecret.ingress_webhook_secret === secret) {
    let channelConfig: { id: string; name: string | null } | null = null;
    if (queryChannelId) {
      const { data: ch } = await supabase
        .from("cliente_whatsapp_config")
        .select("id, name")
        .eq("id", queryChannelId)
        .eq("cliente_id", byClientSecret.id)
        .maybeSingle();
      channelConfig = ch;
    }
    return { clienteId: byClientSecret.id, channelConfig, authVia: "cliente" };
  }

  const { data: byChannel } = await supabase
    .from("cliente_whatsapp_config")
    .select("id, name, cliente_id, webhook_secret")
    .eq("webhook_secret", secret)
    .maybeSingle();

  if (byChannel?.webhook_secret === secret && byChannel.cliente_id) {
    if (queryClienteId && queryClienteId !== byChannel.cliente_id) return null;
    return {
      clienteId: byChannel.cliente_id,
      channelConfig: { id: byChannel.id, name: byChannel.name },
      authVia: "channel",
    };
  }

  return null;
}

async function resolveChannelByKey(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
  inbound: InboundNormalized,
  preferredChannelId: string | null
): Promise<{ id: string; name: string | null } | null> {
  if (preferredChannelId) {
    const { data: ch } = await supabase
      .from("cliente_whatsapp_config")
      .select("id, name")
      .eq("id", preferredChannelId)
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (ch) return ch;
  }

  const key = normChannelKey(inbound.channelKey || inbound.instanceName || "");
  if (!key) return null;

  const { data: configs } = await supabase
    .from("cliente_whatsapp_config")
    .select("id, name")
    .eq("cliente_id", clienteId);

  for (const c of configs || []) {
    const n = normChannelKey(String(c.name || ""));
    if (n && (n === key || key.includes(n) || n.includes(key))) {
      return { id: c.id, name: c.name };
    }
  }
  return null;
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log("[crm-ingress-webhook]", req.method, url.pathname);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Webhook de entrada Planeje ativo. POST com JSON canônico, uazapi ou Meta Cloud.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Configuração incompleta" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const secretFromQuery = url.searchParams.get("secret");
  const authHeader = req.headers.get("Authorization");
  const secretFromBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const secret = secretFromQuery || secretFromBearer || null;
  const queryClienteId = url.searchParams.get("cliente_id");
  const queryChannelId = url.searchParams.get("channel_id");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await resolveAuth(supabase, secret || "", queryClienteId, queryChannelId);

  if (!auth) {
    return new Response(JSON.stringify({ error: "Secret inválido ou cliente não encontrado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { clienteId } = auth;
  let channelConfig = auth.channelConfig;

  let parsedBody: Record<string, unknown>;
  const rawText = await req.text();
  try {
    const raw = rawText ? JSON.parse(rawText) : {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("json");
    }
    parsedBody = raw as Record<string, unknown>;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").trim().slice(0, 200) || "vazio";
    await supabase.from("cliente_whatsapp_webhook_log").insert({
      cliente_id: clienteId,
      status: "ok",
      source: "ingress",
      type: "probe",
      body_preview: preview,
      error_message: rawText.trim() ? "Body não é um JSON de objeto" : null,
      raw_payload: rawText.trim() ? { _raw: rawText.slice(0, 8000) } : {},
    });
    return new Response(JSON.stringify({ ok: true, probe: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let inbound = normalizeInboundPayload(parsedBody);
  let contactCreated = false;
  for (const body of splitMetaMessages(parsedBody)) {
    inbound = normalizeInboundPayload(body);
    channelConfig = auth.channelConfig;
    if (!channelConfig) {
      channelConfig = await resolveChannelByKey(supabase, clienteId, inbound, queryChannelId);
    }

    const bodyPreview =
      inbound.messageText?.slice(0, 200) ||
      `${inbound.format}:${inbound.eventType}` ||
      "ingress";

    await supabase.from("cliente_whatsapp_webhook_log").insert({
      cliente_id: clienteId,
      status: "ok",
      source: inbound.format === "chatvolt" ? "chatvolt" : "ingress",
      from_jid: inbound.fromJid !== "unknown" ? inbound.fromJid : null,
      type: `${inbound.format}:${inbound.eventType}`,
      body_preview: bodyPreview,
      body_keys: Object.keys(body).length ? Object.keys(body) : null,
      raw_payload: body,
    });

    let conversationMatch = null;
    if (inbound.format === 'chatvolt' && inbound.fromJid === 'unknown' && !inbound.fromMe && !inbound.isGroup &&
        extractMatchCode(inbound.messageText) && !hasCtwaTrackingSignal(inbound.tracking.tracking_data)) {
      try {
        conversationMatch = await lookupChatvoltConversationAttribution(supabase, { clienteId, body });
        if (conversationMatch) inbound = { ...inbound, phone: conversationMatch.phone, fromJid: `${conversationMatch.phone}@s.whatsapp.net` };
      } catch { console.error('[crm-ingress-webhook] conversation attribution read failed'); }
    }

    const messageSource = ingressMessageSource(inbound, channelConfig?.id);
    const eligible = inbound.fromJid !== 'unknown' && !inbound.historical && !!inbound.messageId && inbound.automationAt !== null
      && (body.object !== 'whatsapp_business_account' || inbound.format === 'meta_cloud');
    if (!channelConfig && inbound.fromJid !== 'unknown' && inbound.messageId && inbound.automationAt !== null) {
      const { error } = await supabase.from('mini_crm_message_sources').upsert({
        cliente_id: clienteId, id: messageSource.id, name: messageSource.name, phone: messageSource.phone,
      }, { onConflict: 'cliente_id,id' });
      if (error) console.error('[mini-crm-message] source registration failed', error.code || 'database');
    }
    const metaAgent = inbound.format === 'meta_cloud' && inbound.fromMe === true;
    const chatvoltAgent = inbound.format === "chatvolt" && inbound.fromMe === true;
    const chatvoltQuiet = inbound.format === "chatvolt" && !chatvoltAgent && !inbound.messageText;

    let existingTeamContact = false;
    if ((chatvoltAgent || metaAgent) && inbound.fromJid && inbound.fromJid !== "unknown") {
      const { data: existingAgent } = await supabase
        .from("cliente_whatsapp_contact")
        .select("id, last_message_at")
        .eq("cliente_id", clienteId)
        .eq("from_jid", inbound.fromJid)
        .maybeSingle();
      if (existingAgent?.id) {
        existingTeamContact = true;
        if (!inbound.historical && (!metaAgent || eligible)) {
          const msgMs = new Date(inbound.msgTimestamp).getTime();
          const prevLast = existingAgent.last_message_at ? new Date(existingAgent.last_message_at).getTime() : null;
          const lastSeenIso = new Date(
            prevLast == null || Number.isNaN(prevLast) ? msgMs : Math.max(prevLast, msgMs),
          ).toISOString();
          await supabase
            .from("cliente_whatsapp_contact")
            .update({ last_message_at: lastSeenIso, updated_at: new Date().toISOString() })
            .eq("id", existingAgent.id)
            .eq("cliente_id", clienteId);
        }
        if (chatvoltAgent) void applyRastreamentoConversionFromWebhook({
          supabase,
          supabaseUrl,
          serviceKey: supabaseServiceKey,
          clienteId,
          contactJid: inbound.fromJid,
          phone: inbound.phone,
          messageText: "",
          labels: inbound.labels,
          fromMe: true,
          isGroup: false,
        }).catch((e) => console.error("[crm-ingress-webhook] conversion fromMe failed", e));
      }
    } else if (!chatvoltQuiet && inbound.fromJid && inbound.fromJid !== "unknown") {
      const tracking = inbound.tracking;

      const readContact = () => supabase
        .from("cliente_whatsapp_contact")
        .select(
          "sender_name, profile_pic_url, tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, whatsapp_config_id"
        )
        .eq("cliente_id", clienteId)
        .eq("from_jid", inbound.fromJid)
        .maybeSingle();

      const directMatchCode = extractMatchCode(inbound.messageText);
      let canClaimConversation = false;
      if (inbound.format === 'chatvolt' && !inbound.fromMe && !inbound.isGroup && !hasStoredContactAttribution(tracking) &&
          (conversationMatch || !directMatchCode)) {
        const { error } = await readContact();
        if (error && conversationMatch) {
          console.error('[crm-ingress-webhook] recovered contact read failed');
          return new Response(JSON.stringify({error:'Não foi possível consultar o contato.'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}});
        }
        canClaimConversation = !error;
        if (canClaimConversation && !conversationMatch) {
          try { conversationMatch = await lookupChatvoltConversationAttribution(supabase, { clienteId, body }); }
          catch { console.error('[crm-ingress-webhook] conversation attribution read failed'); }
        }
      }
      const originalMessageId = inbound.format === 'meta_cloud' ? inbound.messageId : String(body.messageId || body.message_id || body.messageid || body.id || '');
      const originalMessageAt = inbound.automationAt ?? body.createdAt ?? body.timestamp ?? body.message_timestamp;
      const codeMatches = directMatchCode ? [{matchCode:directMatchCode,messageId:originalMessageId,messageAt:originalMessageAt}]
        : conversationMatch?.matches || [];
      const matchCode = codeMatches[0]?.matchCode;
      const attributedMatches = [];
      const receivedTracking = { ...tracking, tracking_data: tracking.tracking_data ? {...tracking.tracking_data} : null };
      if (codeMatches.length && !hasCtwaTrackingSignal(tracking.tracking_data) &&
          (!conversationMatch || canClaimConversation)) {
        for (const codeMatch of codeMatches) try {
          const matched = await claimTrackableClickMatch(supabase, {
            matchCode:codeMatch.matchCode,
            clienteId,
            fromJid: inbound.fromJid,
          });
          if (matched) {
            const attributed = {...receivedTracking,origin_source:matched.origin_resolved,
              tracking_data:trackingFromMatchedClick(matched,receivedTracking.tracking_data)};
            for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'] as const) attributed[key] = matched[key] ?? receivedTracking[key];
            if (conversationMatch) attributed.tracking_data = {...attributed.tracking_data,
              planeje_link_match_method:'chatvolt_conversation',planeje_link_matched_message_id:codeMatch.messageId};
            attributedMatches.push({tracking:attributed,evidence:attributionEvidence({source:inbound.format,messageId:codeMatch.messageId,
              messageAt:codeMatch.messageAt,receivedAt:codeMatch.receivedAt || new Date().toISOString(),tracking:attributed,fromMe:inbound.fromMe,isGroup:inbound.isGroup})});
          }
        } catch (e) {
          console.error("[crm-ingress-webhook] trackable link match failed", e);
        }
      }
      const evidenceAt = item => item.evidence?.clicked_at || item.evidence?.message_at || item.evidence?.received_at || '';
      attributedMatches.sort((a,b)=>evidenceAt(a).localeCompare(evidenceAt(b)));
      if (attributedMatches.length) Object.assign(tracking,attributedMatches[0].tracking);
      const matchedEvidences = attributedMatches.map(item=>item.evidence);

      const now = new Date().toISOString();

      // Read after claiming: another event may have recorded the contact's first attribution meanwhile.
      const { data: existingContact, error: existingContactError } = await readContact();
      if (conversationMatch && existingContactError) {
        console.error('[crm-ingress-webhook] recovered contact read failed');
        return new Response(JSON.stringify({error:'Não foi possível consultar o contato.'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}});
      }

      const msgMs = new Date(inbound.msgTimestamp).getTime();
      const prevFirst = existingContact?.first_seen_at ? new Date(existingContact.first_seen_at).getTime() : null;
      const prevLast = existingContact?.last_message_at ? new Date(existingContact.last_message_at).getTime() : null;
      const firstSeenIso = new Date(prevFirst == null ? msgMs : Math.min(prevFirst, msgMs)).toISOString();
      const lastSeenIso = new Date(prevLast == null ? msgMs : Math.max(prevLast, msgMs)).toISOString();

      if (!matchCode && !inbound.fromMe && !inbound.isGroup && !hasStoredContactAttribution(tracking)) {
        try {
          const matched = await lookupInitialMessageLink(supabase, { message: inbound.messageText, clienteId,
            whatsappConfigId: channelConfig?.id, ownerPhone: tracking.tracking_data?.owner_phone });
          if (matched) {
            tracking.origin_source = matched.default_origin;
            tracking.tracking_data = trackingFromInitialMessageLink(matched, tracking.tracking_data, { messageId: inbound.messageId });
            for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
              tracking[key] = matched[`default_${key}`] || null;
            }
          }
        } catch (error) { console.error('[crm-ingress-webhook] initial message attribution failed', error); }
      }
      const existingHasTracking = hasStoredContactAttribution(existingContact);
      const existingRaw = existingContact?.tracking_data as Record<string, unknown> | undefined;

      const finalTracking = (() => {
        if (existingHasTracking) return existingRaw ?? null;
        const flat = tracking.tracking_data;
        if (existingRaw?.meta_ad_details || existingRaw?.meta_ad_details_history) {
          return {
            ...(flat || {}),
            meta_ad_details: existingRaw.meta_ad_details,
            meta_ad_details_history: existingRaw.meta_ad_details_history,
          };
        }
        return mergeContactAttributionMetadata(existingContact, flat);
      })();

      let trackingWithThumb = await attachStoredThumbnail(
        supabase,
        finalTracking as Record<string, unknown> | null,
        supabaseUrl
      );

      const { data: persistedContact, error: contactError } = await persistIngressContactAttribution(supabase, {
        clienteId,fromJid:inbound.fromJid,contact:{
          cliente_id: clienteId,
          from_jid: inbound.fromJid,
          phone: inbound.phone || null,
          sender_name: inbound.name || (conversationMatch ? existingContact?.sender_name || conversationMatch.name : null) || null,
          sender_name_is_fallback: !inbound.name,
          ...tracking,
          tracking_data: existingHasTracking ? tracking.tracking_data : trackingWithThumb,
          profile_pic_url: inbound.profilePicUrl || (conversationMatch ? existingContact?.profile_pic_url : null) || null,
          instance_name: inbound.instanceName || (inbound.format === 'meta_cloud' ? messageSource.name : inbound.channelKey) || null,
          whatsapp_config_id: channelConfig?.id ?? (existingContact?.whatsapp_config_id as string | null) ?? null,
          first_seen_at: firstSeenIso,
          last_message_at: lastSeenIso,
          updated_at: now,
        }
        ,evidences:matchedEvidences.length ? matchedEvidences : [attributionEvidence({source:inbound.format,messageId:originalMessageId,
          messageAt:originalMessageAt,receivedAt:now,tracking,fromMe:inbound.fromMe,isGroup:inbound.isGroup})],
      });
      if (contactError || !persistedContact) {
        console.error('[crm-ingress-webhook] contact history persistence failed',contactError?.code || 'database');
        return new Response(JSON.stringify({error:'Não foi possível registrar o contato e seu histórico.'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}});
      }
      trackingWithThumb = persistedContact.tracking_data;

      if (!contactError) {
        contactCreated = true;
        if (inbound.messageText) {
          await supabase.from("cliente_whatsapp_inbox").upsert(
            {
              cliente_id: clienteId,
              message_id: String(inbound.messageId),
              from_jid: inbound.fromJid,
              sender_name: inbound.name || null,
              msg_timestamp: inbound.msgTimestamp,
              type: "text",
              body: inbound.messageText,
              is_group: inbound.isGroup,
              group_name: inbound.groupName,
              phone: inbound.phone || null,
              profile_pic_url: inbound.profilePicUrl || null,
              raw_payload: body,
            },
            { onConflict: "cliente_id,message_id" }
          );
        }

        if (!inbound.isGroup && inbound.format === "chatvolt") {
          void applyRastreamentoConversionFromWebhook({
            supabase,
            supabaseUrl,
            serviceKey: supabaseServiceKey,
            clienteId,
            contactJid: inbound.fromJid,
            phone: inbound.phone,
            messageText: inbound.messageText || "",
            labels: inbound.labels,
            tracking: trackingWithThumb as Record<string, unknown> | null,
            fromMe: false,
            isGroup: false,
          }).catch((e) => console.error("[crm-ingress-webhook] conversion failed", e));
        } else if (!inbound.isGroup) {
          const { data: contactRow } = await supabase
            .from("cliente_whatsapp_contact")
            .select("id")
            .eq("cliente_id", clienteId)
            .eq("from_jid", inbound.fromJid)
            .maybeSingle();
          if (contactRow?.id) {
            void maybeSendGoogleLeadSubmitted({
              supabase,
              supabaseUrl,
              serviceKey: supabaseServiceKey,
              clienteId,
              contactId: contactRow.id,
              tracking: trackingWithThumb as Record<string, unknown> | null,
              fromMe: false,
            }).catch((e) => console.error("[crm-ingress-webhook] google conversion failed", e));
          }
        }

        try {
          await fetch(`${supabaseUrl}/functions/v1/create-lead-from-contact`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              cliente_id: clienteId,
              from_jid: inbound.fromJid,
              phone: inbound.phone || null,
              sender_name: inbound.name || null,
              profile_pic_url: inbound.profilePicUrl || null,
            }),
          });
        } catch (e) {
          console.error("[crm-ingress-webhook] create-lead-from-contact failed", e);
        }
      } else {
        console.error("[crm-ingress-webhook] contact upsert error", contactError);
      }
    }

    try {
      if (eligible && (!metaAgent || existingTeamContact)) await runMiniCrmMessage({ supabase, clienteId, jid: inbound.fromJid,
        event: { messageId: inbound.messageId, channel: messageSource.id, channelAliases: messageSource.aliases, historical: inbound.historical,
          fromMe: inbound.fromMe === true, isGroup: inbound.isGroup, text: inbound.fromMe && inbound.format === 'chatvolt' && typeof body.agentResponse === 'string' ? body.agentResponse : inbound.messageText || '', type: inbound.eventType, at: inbound.msgTimestamp } });
    } catch (error) { console.error('[mini-crm-message] webhook rule failed', error instanceof Error ? error.message : 'database'); }

  }
  return new Response(
    JSON.stringify({
      ok: true,
      format: inbound.format,
      contact_upserted: contactCreated,
      channel_id: channelConfig?.id ?? null,
      auth_via: auth.authVia,
      has_ctwa: !!(inbound.tracking.tracking_data as Record<string, unknown> | null)?.ctwaClid,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
