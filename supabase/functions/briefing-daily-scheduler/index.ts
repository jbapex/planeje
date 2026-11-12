/**
 * Briefing diário: lê a config na tabela automacoes_config (nome briefing_diario), compara o horário
 * com o relógio de Brasília e faz POST para a URL em PLANEJE_BRIEFING_WEBHOOK_URL.
 *
 * Secrets na Supabase:
 *   PLANEJE_BRIEFING_WEBHOOK_URL — endereço completo do serviço que envia o WhatsApp (ex.: .../webhook/tarefa).
 *   BRIEFING_CRON_SECRET — palavra-passe; chamadas automáticas devem enviar o header x-briefing-cron-secret igual.
 *   WEBHOOK_SECRET — Bearer enviado ao worker (igual ao WEBHOOK_SECRET do planeje-briefing).
 *
 * Deploy: supabase functions deploy briefing-daily-scheduler
 * Agendamento: na Supabase, agendar esta função para rodar a cada minuto (com o header acima).
 * Teste pelo site: admin clica "Disparar teste"; a função recebe { force: true } com o login do utilizador.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-briefing-cron-secret",
};

function normalizeTimeHHmm(s: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return "08:00";
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function nowHHmmSaoPaulo(): string {
  const s = new Date().toLocaleTimeString("sv-SE", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return s.length >= 5 ? s.slice(0, 5) : "00:00";
}

function parseConfig(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      return typeof o === "object" && o !== null && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: { force?: boolean } = {};
    try {
      const t = await req.text();
      if (t) body = JSON.parse(t);
    } catch {
      body = {};
    }

    const cronSecret = Deno.env.get("BRIEFING_CRON_SECRET") ?? "";
    const suppliedCron = req.headers.get("x-briefing-cron-secret") ?? "";
    const isCron = cronSecret.length > 0 && suppliedCron === cronSecret;
    const isForce = body?.force === true;
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const webhookUrl = (Deno.env.get("PLANEJE_BRIEFING_WEBHOOK_URL") ?? "").trim();

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "SUPABASE_URL / SERVICE_ROLE_KEY em falta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let allowRun = false;
    let reason = "";

    if (isCron) {
      allowRun = true;
      reason = "cron";
    } else if (isForce && authHeader.startsWith("Bearer ") && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: ue } = await userClient.auth.getUser();
      if (ue || !user) {
        return new Response(JSON.stringify({ error: "JWT inválido" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile?.role || !["superadmin", "admin"].includes(String(profile.role))) {
        return new Response(JSON.stringify({ error: "Apenas superadmin ou admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      allowRun = true;
      reason = "force_admin";
    } else {
      return new Response(
        JSON.stringify({
          error:
            "Use header x-briefing-cron-secret (agendamento) ou POST {\"force\":true} com Authorization Bearer (admin).",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: row, error: re } = await admin
      .from("automacoes_config")
      .select("id, nome, ativo, configuracao, horario")
      .eq("nome", "briefing_diario")
      .maybeSingle();

    if (re) throw re;
    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: "Linha briefing_diario não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!row.ativo && reason !== "force_admin") {
      return new Response(JSON.stringify({ ok: true, skipped: true, detail: "briefing_diario inativo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = parseConfig(row.configuracao);
    const horarioCol = typeof row.horario === "string" && String(row.horario).trim()
      ? String(row.horario).trim()
      : "";
    const horarioJson = typeof cfg.horario === "string" ? String(cfg.horario) : "";
    const scheduled = normalizeTimeHHmm(horarioCol || horarioJson || "08:00");
    const nowSp = nowHHmmSaoPaulo();

    if (reason === "cron" && scheduled !== nowSp) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          detail: "fora da janela",
          scheduled,
          now_sao_paulo: nowSp,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!webhookUrl) {
      // Resposta 200 com ok: false para o app mostrar a mensagem no toast (o cliente Supabase esconde detalhes em erros 5xx).
      return new Response(
        JSON.stringify({
          ok: false,
          dispatched: false,
          error:
            "Defina o secret PLANEJE_BRIEFING_WEBHOOK_URL (URL completa do worker, ex.: https://planeje.jbapex.com.br/webhook/tarefa).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const numeros = Array.isArray(cfg.numeros_briefing)
      ? (cfg.numeros_briefing as unknown[]).map((x) => String(x ?? "").replace(/\D/g, "")).filter(Boolean)
      : [];
    const modelo = typeof cfg.modelo === "string" ? cfg.modelo : "";

    const payload = {
      event: "briefing_diario",
      source: "briefing-daily-scheduler",
      trigger: reason,
      horario: scheduled,
      modelo,
      numeros_briefing: numeros,
      ativo: !!row.ativo,
    };

    let whRes: Response;
    let whText: string;
    try {
      const webhookSecret = (Deno.env.get("WEBHOOK_SECRET") ?? "").trim();
      whRes = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      whText = await whRes.text();
    } catch (fe) {
      const msg = (fe as Error)?.message ?? String(fe);
      console.error("[briefing-daily-scheduler] fetch worker", msg);
      return new Response(
        JSON.stringify({
          ok: false,
          dispatched: false,
          error: `Falha ao contactar o worker: ${msg}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!whRes.ok) {
      console.error("[briefing-daily-scheduler] worker HTTP", whRes.status, whText.slice(0, 500));
      return new Response(
        JSON.stringify({
          ok: false,
          dispatched: false,
          worker_status: whRes.status,
          error: `Worker respondeu HTTP ${whRes.status}`,
          body_preview: whText.slice(0, 400),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dispatched: true,
        reason,
        scheduled,
        now_sao_paulo: nowSp,
        webhook_status: whRes.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[briefing-daily-scheduler]", e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
