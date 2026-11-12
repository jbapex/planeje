/**
 * Analisa mensagem inbound em grupo WhatsApp com IA (OpenRouter).
 * Define awaiting_response_since quando um cliente aguarda resposta da equipe.
 *
 * POST { conversation_id, cliente_id, chat_jid, message_id?, message_body, sender_name?, sender_jid?, message_at? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isClientAcknowledgment } from '../_shared/atendimentoClientAck.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

type AnalysisResult = {
  sender_role: 'cliente' | 'equipe' | 'desconhecido';
  needs_agency_response: boolean;
  confidence: number;
  reason: string;
};

type InternalHint = {
  label: string;
  phone?: string | null;
  sender_jid?: string | null;
  name_match?: string | null;
};

function digitsOnly(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.endsWith(db) || db.endsWith(da);
}

function matchMarkedContact(
  senderJid: string,
  senderPhone: string,
  rows: Array<{ phone?: string | null; label?: string | null }>,
): { phone: string; label: string } | null {
  for (const row of rows) {
    const phone = String(row.phone ?? '').trim();
    if (!phone) continue;
    if (senderPhone && phonesMatch(phone, senderPhone)) {
      return { phone, label: String(row.label ?? '').trim() };
    }
    if (senderJid && phonesMatch(phone, senderJid)) {
      return { phone, label: String(row.label ?? '').trim() };
    }
  }
  return null;
}

function matchInternalSender(
  senderJid: string,
  senderName: string,
  senderPhone: string,
  hints: InternalHint[],
): InternalHint | null {
  if (!hints.length) return null;
  const nameLower = senderName.trim().toLowerCase();
  const jidLower = senderJid.trim().toLowerCase();

  for (const hint of hints) {
    const hjid = String(hint.sender_jid ?? '').trim().toLowerCase();
    if (hjid && jidLower && (jidLower === hjid || jidLower.includes(hjid))) return hint;

    const hp = String(hint.phone ?? '').trim();
    if (hp && senderPhone && phonesMatch(hp, senderPhone)) return hint;
    if (hp && jidLower && phonesMatch(hp, jidLower)) return hint;

    const nm = String(hint.name_match ?? '').trim().toLowerCase();
    if (nm && nameLower && nameLower.includes(nm)) return hint;

    const lbl = String(hint.label ?? '').trim().toLowerCase();
    if (lbl && nameLower && nameLower === lbl) return hint;
  }
  return null;
}

function formatInternalHintsBlock(hints: InternalHint[]): string {
  if (!hints.length) return '(nenhum cadastrado — inferir pelo contexto)';
  return hints
    .map((h) => {
      const parts = [h.label];
      if (h.phone) parts.push(`tel ${h.phone}`);
      if (h.name_match) parts.push(`nome contém "${h.name_match}"`);
      if (h.sender_jid) parts.push(`jid ${h.sender_jid}`);
      return `- ${parts.join(' · ')}`;
    })
    .join('\n');
}

async function getOpenRouterKey(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const fromEnv = Deno.env.get('OPENROUTER_API_KEY')?.trim();
  if (fromEnv) return fromEnv;

  try {
    const { data } = await supabase.rpc('get_encrypted_secret', { p_secret_name: 'OPENROUTER_API_KEY' });
    if (data) return String(data);
  } catch {
    /* ignore */
  }

  const { data: row } = await supabase.from('app_secrets').select('secret_value').eq('name', 'OPENROUTER_API_KEY').maybeSingle();
  return row?.secret_value ? String(row.secret_value) : null;
}

function extractJsonObject(text: string): AnalysisResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const role = String(parsed.sender_role ?? 'desconhecido').toLowerCase();
    const sender_role =
      role === 'cliente' || role === 'equipe' ? role : ('desconhecido' as const);
    return {
      sender_role,
      needs_agency_response: Boolean(parsed.needs_agency_response),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reason: String(parsed.reason ?? '').slice(0, 500),
    };
  } catch {
    return null;
  }
}

function formatHistoryLine(row: Record<string, unknown>, direction: 'in' | 'out'): string {
  const who =
    direction === 'out'
      ? 'EQUIPE (conta conectada)'
      : String(row.sender_name ?? row.sender_jid ?? 'Participante').trim() || 'Participante';
  const body = String(row.body ?? `[${row.type ?? 'msg'}]`).trim().slice(0, 280);
  const at = String(row.created_at ?? row.msg_timestamp ?? '');
  return `[${at}] ${who}: ${body}`;
}

async function runAnalysis(
  apiKey: string,
  model: string,
  empresa: string,
  groupName: string,
  senderName: string,
  senderJid: string,
  messageBody: string,
  history: string,
  internalHintsBlock: string,
): Promise<{ analysis: AnalysisResult; raw: unknown }> {
  const system = `Você analisa mensagens de grupos WhatsApp de atendimento B2B.
A agência de marketing atende clientes finais em grupos com a equipe do cliente e da agência.

Remetentes cadastrados como EQUIPE INTERNA (sempre sender_role=equipe, needs_agency_response=false):
${internalHintsBlock}

Responda APENAS um objeto JSON válido (sem markdown):
{
  "sender_role": "cliente" | "equipe" | "desconhecido",
  "needs_agency_response": boolean,
  "confidence": number entre 0 e 1,
  "reason": "frase curta em português"
}

Regras:
- sender_role=equipe: colaborador da agência, funcionário do cliente, bot operacional, ou mensagens claramente internas.
- sender_role=cliente: consumidor final, paciente, lead ou cliente do negócio pedindo algo.
- needs_agency_response=true: cliente/pergunta/pedido/reclamação/solicitação sem resposta adequada da equipe.
- needs_agency_response=false: papo interno da equipe, "ok", agradecimento já resolvido, sticker, mensagem irrelevante.
- Mensagens marcadas EQUIPE (conta conectada) no histórico são sempre equipe.`;

  const user = `Empresa atendida: ${empresa || '—'}
Grupo: ${groupName || '—'}

Mensagem a analisar:
Remetente: ${senderName || '—'} (${senderJid || '—'})
Texto: ${messageBody || '(sem texto)'}

Histórico recente:
${history || '(sem histórico)'}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://planeje.jbapex.com.br',
      'X-Title': 'Planeje Atendimento Grupo IA',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`);
  }

  const content = raw?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? raw);
  const analysis = extractJsonObject(text);
  if (!analysis) {
    throw new Error(`Resposta IA inválida: ${text.slice(0, 300)}`);
  }
  return { analysis, raw };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase não configurado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const conversationId = String(body.conversation_id ?? '').trim();
  const clienteId = String(body.cliente_id ?? '').trim();
  const chatJid = String(body.chat_jid ?? '').trim();
  const messageId = String(body.message_id ?? '').trim() || null;
  const messageBody = String(body.message_body ?? '').trim();
  const senderName = String(body.sender_name ?? '').trim();
  const senderJid = String(body.sender_jid ?? '').trim();
  const senderPhone = String(body.sender_phone ?? '').trim();
  const messageAt = String(body.message_at ?? new Date().toISOString()).trim();
  const messageType = String(body.message_type ?? '').trim();
  const clientAck = isClientAcknowledgment({ body: messageBody, type: messageType });

  if (!conversationId || !clienteId) {
    return new Response(JSON.stringify({ error: 'conversation_id e cliente_id são obrigatórios' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const [{ data: conv }, { data: cliente }, { data: internalHints }] = await Promise.all([
      supabase.from('atendimento_conversas').select('*').eq('id', conversationId).maybeSingle(),
      supabase.from('clientes').select('empresa').eq('id', clienteId).maybeSingle(),
      supabase
        .from('atendimento_grupo_remetente_interno')
        .select('label, phone, sender_jid, name_match')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`),
    ]);

    if (!conv?.is_group) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not_a_group' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hints = (internalHints ?? []) as InternalHint[];
    const matchedHint = matchInternalSender(
      senderJid,
      senderName,
      senderPhone || digitsOnly(senderJid),
      hints,
    );

    const model = Deno.env.get('ATENDIMENTO_GROUP_AI_MODEL')?.trim() || DEFAULT_MODEL;
    let analysis: AnalysisResult;
    let raw: unknown = null;
    let modelUsed = model;
    let preserveAwaiting = false;
    const effectiveChatJid = chatJid || conv.chat_jid;

    const { data: contatoRows } = await supabase
      .from('atendimento_grupo_contato_resposta')
      .select('phone, label')
      .eq('cliente_id', clienteId)
      .eq('chat_jid', effectiveChatJid);
    const contatos = (contatoRows ?? []) as Array<{ phone?: string | null; label?: string | null }>;
    const contatoMarcado = matchMarkedContact(senderJid, senderPhone || digitsOnly(senderJid), contatos);

    if (matchedHint) {
      analysis = {
        sender_role: 'equipe',
        needs_agency_response: false,
        confidence: 1,
        reason: `Remetente cadastrado como equipe interna (${matchedHint.label}).`,
      };
      modelUsed = 'remetente_interno_cadastrado';
    } else if (contatoMarcado && clientAck) {
      analysis = {
        sender_role: 'cliente',
        needs_agency_response: false,
        confidence: 1,
        reason: `Confirmação do contato marcado${contatoMarcado.label ? ` (${contatoMarcado.label})` : ''}: curtida, reação ou ok. Sem resposta da equipe.`,
      };
      modelUsed = 'contato_resposta_ack';
    } else if (contatoMarcado) {
      analysis = {
        sender_role: 'cliente',
        needs_agency_response: true,
        confidence: 1,
        reason: `Contato marcado para resposta rápida${contatoMarcado.label ? ` (${contatoMarcado.label})` : ''}.`,
      };
      modelUsed = 'contato_resposta_marcado';
    } else if (contatos.length > 0) {
      analysis = {
        sender_role: 'desconhecido',
        needs_agency_response: false,
        confidence: 1,
        reason: 'Este número do grupo não está marcado para resposta rápida.',
      };
      modelUsed = 'grupo_sem_marca';
      preserveAwaiting = true;
    } else {
      const apiKey = await getOpenRouterKey(supabase);
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY não configurada' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const [{ data: inboxRows }, { data: sentRows }] = await Promise.all([
        supabase
          .from('cliente_whatsapp_inbox')
          .select('body, sender_name, sender_jid, created_at, type, is_group')
          .eq('cliente_id', clienteId)
          .eq('chat_jid', effectiveChatJid)
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('cliente_whatsapp_sent')
          .select('body, created_at, type, sent_by')
          .eq('cliente_id', clienteId)
          .eq('chat_jid', effectiveChatJid)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const historyLines = [
        ...(inboxRows ?? []).map((r) => formatHistoryLine(r as Record<string, unknown>, 'in')),
        ...(sentRows ?? []).map((r) => formatHistoryLine(r as Record<string, unknown>, 'out')),
      ]
        .sort((a, b) => a.localeCompare(b))
        .slice(-15);

      const result = await runAnalysis(
        apiKey,
        model,
        String(cliente?.empresa ?? ''),
        String(conv.display_name ?? conv.chat_jid ?? ''),
        senderName,
        senderJid,
        messageBody,
        historyLines.join('\n'),
        formatInternalHintsBlock(hints),
      );
      analysis = result.analysis;
      raw = result.raw;
      modelUsed = model;
      if (clientAck && analysis.needs_agency_response) {
        analysis = {
          ...analysis,
          needs_agency_response: false,
          reason: 'Confirmação do cliente (curtida, reação ou ok). Sem resposta da equipe.',
        };
      }
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      group_ai_analysis: analysis,
      group_ai_analyzed_at: nowIso,
      updated_at: nowIso,
    };

    if (preserveAwaiting) {
      /* o relógio fica como está: quem falou não é o contato marcado */
    } else if (analysis.sender_role === 'equipe') {
      patch.awaiting_response_since = null;
    } else if (analysis.needs_agency_response) {
      patch.awaiting_response_since = messageAt;
      if (conv.status === 'resolvido') patch.status = 'aguardando';
    } else {
      patch.awaiting_response_since = null;
      if (clientAck && conv.status === 'aguardando') {
        patch.status = conv.assigned_to ? 'em_atendimento' : 'resolvido';
      }
    }

    const { error: updErr } = await supabase
      .from('atendimento_conversas')
      .update(patch)
      .eq('id', conversationId);
    if (updErr) throw new Error(`update conversa: ${updErr.message}`);

    let inboxRowId: string | null = null;
    if (messageId) {
      const { data: inboxRow } = await supabase
        .from('cliente_whatsapp_inbox')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('message_id', messageId)
        .maybeSingle();
      inboxRowId = inboxRow?.id ?? null;
    }

    await supabase.from('atendimento_grupo_analise_log').insert({
      conversation_id: conversationId,
      cliente_id: clienteId,
      inbox_message_id: inboxRowId,
      message_id: messageId,
      sender_jid: senderJid || null,
      sender_name: senderName || null,
      message_preview: messageBody.slice(0, 500) || null,
      needs_response: analysis.needs_agency_response,
      sender_role: analysis.sender_role,
      confidence: analysis.confidence,
      reason: analysis.reason,
      model: modelUsed,
      raw_response: raw,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        conversation_id: conversationId,
        analysis,
        matched_internal_hint: matchedHint?.label ?? null,
        awaiting_response_since: patch.awaiting_response_since ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[atendimento-group-analyze]', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
