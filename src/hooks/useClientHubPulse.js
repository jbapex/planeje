import { useCallback, useEffect, useMemo, useState } from 'react';
import { startOfDay } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { computeCoberturaMensal, monthBounds, statusMeta } from '@/lib/coberturaMensal';
import {
  accountHealth,
  classifyOpenTaskDue,
  healthMood,
  isPendingConversa,
} from '@/lib/accountPulse';

export function useClientHubPulse(clientId) {
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [responsavel, setResponsavel] = useState(null);
  const [tasks, setTasks] = useState({ overdue: [], today: [], upcoming: [], recent: [] });
  const [conversas, setConversas] = useState({ pending: 0, aguardando: 0, unread: 0, recent: [] });
  const [cobertura, setCobertura] = useState(null);
  const [projects, setProjects] = useState([]);
  const [leads, setLeads] = useState({ total: 0, won: 0 });
  const [campaignsCount, setCampaignsCount] = useState(0);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!clientId) return;
    if (!silent) setLoading(true);
    setError(null);

    const bounds = monthBounds(new Date());

    const clientRes = await supabase.from('clientes').select('*').eq('id', clientId).maybeSingle();
    if (clientRes.error) {
      setError(clientRes.error.message);
      setClient(null);
      setLoading(false);
      return;
    }
    if (!clientRes.data) {
      setError('not_found');
      setClient(null);
      setLoading(false);
      return;
    }

    const clientRow = { ...clientRes.data, etiquetas: clientRes.data.etiquetas || [] };
    setClient(clientRow);

    const [
      tasksRes,
      conversasRes,
      projectsRes,
      leadsTotalRes,
      leadsWonRes,
      campaignsRes,
      coberturaRpc,
      tarefasMesRes,
      projetosMesRes,
      profileRes,
    ] = await Promise.all([
      supabase
        .from('tarefas')
        .select('id, title, status, due_date, post_date, production_delivered_at, stage_due_at, type')
        .eq('client_id', clientId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(120),
      supabase
        .from('atendimento_conversas')
        .select('id, status, unread_count, display_name, chat_jid, updated_at, last_message_at')
        .eq('cliente_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(40),
      supabase.from('projetos').select('id, name, status, mes_referencia').eq('client_id', clientId).order('created_at', { ascending: false }).limit(12),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('cliente_id', clientId),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('cliente_id', clientId).eq('comprou', true),
      supabase.from('paid_campaigns').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.rpc('resumo_cobertura_mensal', { p_mes: bounds.mesRef, p_exigir_responsavel_ativo: false }),
      supabase
        .from('tarefas')
        .select('id, client_id, project_id, status, due_date, production_delivered_at, stage_due_at, type, description, briefing_completo, briefing_legado, briefing_estado')
        .eq('client_id', clientId)
        .gte('due_date', bounds.inicio)
        .lte('due_date', bounds.fim),
      supabase
        .from('projetos')
        .select('id, client_id, mes_referencia, status')
        .eq('client_id', clientId)
        .not('mes_referencia', 'is', null)
        .gte('mes_referencia', bounds.inicio)
        .lte('mes_referencia', bounds.fim),
      clientRow.responsavel
        ? supabase.from('profiles').select('id, full_name, avatar_url, status, role').eq('id', clientRow.responsavel).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setResponsavel(profileRes.data || null);

    const allTasks = tasksRes.data || [];
    const today = startOfDay(new Date());
    const overdue = [];
    const todayList = [];
    const upcoming = [];
    allTasks.forEach((t) => {
      const kind = classifyOpenTaskDue(t, today);
      if (kind === 'overdue') overdue.push(t);
      else if (kind === 'today') todayList.push(t);
      else if (kind === 'upcoming') upcoming.push(t);
    });
    setTasks({
      overdue,
      today: todayList,
      upcoming,
      recent: allTasks.slice(0, 8),
    });

    const convRows = conversasRes.data || [];
    let pending = 0;
    let aguardando = 0;
    let unread = 0;
    convRows.forEach((c) => {
      const u = Number(c.unread_count) || 0;
      if (c.status === ATENDIMENTO_STATUS.AGUARDANDO) aguardando += 1;
      if (u > 0) unread += 1;
      if (isPendingConversa(c)) pending += 1;
    });
    setConversas({
      pending,
      aguardando,
      unread,
      recent: convRows.slice(0, 6),
    });

    setProjects(projectsRes.data || []);
    setLeads({
      total: leadsTotalRes.count || 0,
      won: leadsWonRes.count || 0,
    });
    setCampaignsCount(campaignsRes.count || 0);

    let cobRow = null;
    if (!coberturaRpc.error && Array.isArray(coberturaRpc.data)) {
      cobRow = coberturaRpc.data.find((r) => r.cliente_id === clientId) || null;
    }
    if (!cobRow) {
      const profilesById = new Map();
      if (profileRes.data) profilesById.set(profileRes.data.id, profileRes.data);
      const computed = computeCoberturaMensal({
        clientes: [clientRow],
        tarefas: tarefasMesRes.data || [],
        projetos: projetosMesRes.data || [],
        profilesById,
        mesRef: bounds.mesRef,
        exigirResponsavelAtivo: false,
      });
      cobRow = computed[0] || null;
    }
    setCobertura(cobRow);

    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const pulse = useMemo(() => {
    const overdueN = tasks.overdue.length;
    const pendingN = conversas.pending;
    const score = accountHealth({
      cobertura,
      overdue: overdueN,
      pendingConversas: pendingN,
      vencimento: client?.vencimento,
    });
    const mood = healthMood(score, overdueN, pendingN);
    const cobMeta = cobertura ? statusMeta(cobertura.status_cobertura) : null;
    return { score, mood, cobMeta };
  }, [tasks.overdue.length, conversas.pending, cobertura, client?.vencimento]);

  return {
    loading,
    error,
    client,
    responsavel,
    tasks,
    conversas,
    cobertura,
    projects,
    leads,
    campaignsCount,
    pulse,
    refresh: load,
    refreshSilent: () => load({ silent: true }),
  };
}
