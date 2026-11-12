import { useCallback, useEffect, useMemo, useState } from 'react';
import { startOfDay } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { computeCoberturaMensal, monthBounds } from '@/lib/coberturaMensal';
import {
  buildAccountPulse,
  classifyOpenTaskDue,
  isAgencyEmpresa,
  isPendingConversa,
  representedClientId,
  summarizeAgencyPulse,
} from '@/lib/accountPulse';

export function useAgencyPulse() {
  const { user, profile } = useAuth();
  const { moduleAccess } = useModuleSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const bounds = monthBounds(new Date());
    const today = startOfDay(new Date());
    const todayIso = today.toISOString().slice(0, 10);
    const userRole = profile?.role;
    const clientsAccessLevel = moduleAccess.clients || 'all';

    let clientsQuery = supabase
      .from('clientes')
      .select('id, empresa, logo_urls, etapa, valor, vencimento, responsavel, tipo_servico, tipo_contrato, entregaveis')
      .neq('etapa', 'lost')
      .order('empresa');

    if (userRole === 'colaborador' && clientsAccessLevel === 'responsible') {
      clientsQuery = clientsQuery.eq('responsavel', user.id);
    }

    const [clientsRes, tasksRes, coberturaRpc, tarefasMesRes, projetosMesRes, profilesRes] = await Promise.all([
      clientsQuery.limit(500),
      supabase
        .from('tarefas')
        .select('id, client_id, title, status, due_date, post_date, production_delivered_at, stage_due_at')
        .or(`due_date.lte.${todayIso},stage_due_at.lte.${todayIso}T23:59:59,post_date.lte.${todayIso}`)
        .limit(2000),
      supabase.rpc('resumo_cobertura_mensal', {
        p_mes: bounds.mesRef,
        p_exigir_responsavel_ativo: false,
      }),
      supabase
        .from('tarefas')
        .select(
          'id, client_id, project_id, status, due_date, production_delivered_at, stage_due_at, type, description, briefing_completo, briefing_legado, briefing_estado',
        )
        .gte('due_date', bounds.inicio)
        .lte('due_date', bounds.fim)
        .limit(3000),
      supabase
        .from('projetos')
        .select('id, client_id, mes_referencia, status')
        .not('mes_referencia', 'is', null)
        .gte('mes_referencia', bounds.inicio)
        .lte('mes_referencia', bounds.fim)
        .limit(1000),
      supabase
        .from('profiles')
        .select('id, full_name, role, status')
        .in('role', ['superadmin', 'admin', 'colaborador']),
    ]);

    if (clientsRes.error) {
      setError(clientsRes.error.message);
      setAccounts([]);
      setLoading(false);
      return;
    }

    const clients = clientsRes.data || [];
    const clientIds = new Set(clients.map((c) => c.id));
    const agencyIds = clients.filter((client) => isAgencyEmpresa(client.empresa)).map((client) => client.id);
    let conversas = [];
    if (agencyIds.length) {
      const conversasRes = await supabase
        .from('atendimento_conversas')
        .select('id, cliente_id, display_name, status, unread_count')
        .in('cliente_id', agencyIds)
        .is('archived_at', null)
        .or(`unread_count.gt.0,status.eq.${ATENDIMENTO_STATUS.AGUARDANDO}`)
        .limit(2000);
      conversas = conversasRes.data || [];
    }

    const overdueByClient = new Map();
    const todayByClient = new Map();
    (tasksRes.data || []).forEach((task) => {
      if (!clientIds.has(task.client_id)) return;
      const kind = classifyOpenTaskDue(task, today);
      if (kind === 'overdue') {
        overdueByClient.set(task.client_id, (overdueByClient.get(task.client_id) || 0) + 1);
      } else if (kind === 'today') {
        todayByClient.set(task.client_id, (todayByClient.get(task.client_id) || 0) + 1);
      }
    });

    const pendingByClient = new Map();
    const aguardandoByClient = new Map();
    conversas.forEach((row) => {
      if (!isPendingConversa(row)) return;
      const targetId = representedClientId(row.display_name, clients) || row.cliente_id;
      if (!clientIds.has(targetId)) return;
      pendingByClient.set(targetId, (pendingByClient.get(targetId) || 0) + 1);
      if (row.status === ATENDIMENTO_STATUS.AGUARDANDO) {
        aguardandoByClient.set(targetId, (aguardandoByClient.get(targetId) || 0) + 1);
      }
    });

    let coberturaByClient = new Map();
    if (!coberturaRpc.error && Array.isArray(coberturaRpc.data)) {
      coberturaRpc.data.forEach((row) => {
        if (row?.cliente_id) coberturaByClient.set(row.cliente_id, row);
      });
    } else {
      const profilesById = new Map((profilesRes.data || []).map((p) => [p.id, p]));
      const computed = computeCoberturaMensal({
        clientes: clients.filter((c) => c.etapa === 'closed'),
        tarefas: (tarefasMesRes.data || []).filter((t) => clientIds.has(t.client_id)),
        projetos: projetosMesRes.data || [],
        profilesById,
        mesRef: bounds.mesRef,
        exigirResponsavelAtivo: false,
      });
      computed.forEach((row) => coberturaByClient.set(row.cliente_id, row));
    }

    const next = clients.map((client) =>
      buildAccountPulse({
        client,
        cobertura: coberturaByClient.get(client.id) || null,
        overdueCount: overdueByClient.get(client.id) || 0,
        todayCount: todayByClient.get(client.id) || 0,
        pendingConversas: pendingByClient.get(client.id) || 0,
        aguardando: aguardandoByClient.get(client.id) || 0,
      })
    );

    next.sort((a, b) => a.score - b.score || a.empresa.localeCompare(b.empresa, 'pt-BR'));
    setAccounts(next);
    setLoading(false);
  }, [user, profile?.role, moduleAccess.clients]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summarizeAgencyPulse(accounts), [accounts]);

  return {
    loading,
    error,
    accounts,
    summary,
    refresh: load,
  };
}
