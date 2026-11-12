// Dados e RPCs sintéticos compartilhados pelo teste React e pela prévia isolada.
export function createRoutineFixture(profile, clients) {
  const today = '2026-11-11';
  const week = '2026-11-02';
  const first = clients[0];
  const account = first?.metaAccounts?.[0];
  const row = (index, name, spend, appointments) => ({ id: `fixture-sheet-row-${index}`, platform: 'meta', account_id: account?.meta_account_id || 'act_fixture_0', account_name: account?.meta_account_name || 'Conta fictícia', account_link_id: `link-${account?.meta_account_id || 'act_fixture_0'}`,
    campaign_id: String(10000 + index), campaign_name: name, adset_id: `fixture-adset-${10000 + index}`, adset_name: `Público local · ${index + 1}`, conversion_label: 'Agendamentos', spend, messages: 15 + index * 8, appointments, conversions: appointments, daily_budget: 45, target_message_cost: 12 });
  const base = { id: 'fixture-week-review', client_id: first?.id, empresa: first?.empresa, week_start: week, task_id: 'fixture-week-task', kind: 'review', revision: 1,
    metric_mode: 'campaign', result_label: 'Agendamentos', can_edit: true, analysis: 'Análise da rotina original preservada.', data_note: 'Registro da planilha oficial.', action_mode: 'none', finalized_at: null,
    campaign_metrics: [row(0, 'Coleção 2027 · agendamentos', 234.50, 3), row(1, 'Prova personalizada · formulário', 167.80, 2), row(2, 'Remarketing · 7 dias', 98.70, 1)] };
  const reviews = first ? [base] : [];
  const history = [];
  const calls = [];
  const saves = [];
  const board = () => ({ today, can_manage: ['admin', 'superadmin'].includes(profile.role), team: [{ id: profile.id, full_name: 'Pessoa fictícia' }], reviews,
    clients: clients.map((client, index) => ({ ...client, eligible: true, manager_id: index === 0 ? profile.id : 'fixture-other', manager_name: index === 0 ? 'Rafael' : 'Marina',
      settings: { result_label: 'Agendamentos', sheet_metrics: ['spend', 'messages', 'appointments', 'conversions'] },
      accounts: (client.metaAccounts || []).map((item) => ({ id: `link-${item.meta_account_id}`, platform: 'meta', account_id: item.meta_account_id, account_name: item.meta_account_name })) })) });
  const contacts = Array.from({ length: 8 }, (_, index) => ({
    id: `fixture-routine-lead-${index}`, cliente_id: first?.id, sender_name: ['Ana Martins', 'Bruna Costa', 'Camila Alves', 'Daniela Souza', 'Elisa Rocha', 'Fernanda Lima', 'Gabriela Dias', 'Helena Santos'][index], phone: `55110000000${index}`, from_jid: `55110000000${index}@s.whatsapp.net`,
    origin_source: 'meta_ads', first_seen_at: '2026-11-03T15:00:00Z', last_message_at: '2026-11-09T15:00:00Z',
    mini_crm: index < 5 ? { status: 'Agendado', data_agendamento: '2026-11-20', vendedor: 'Consultora fictícia' } : { status: 'Novo Lead' },
    tracking_data: { meta_ad_details: { ad: { account_id: account?.meta_account_id || 'act_fixture_0', campaign: { id: String(10000 + index % 3), name: base.campaign_metrics[index % 3].campaign_name }, adset: { id: `fixture-adset-${10000 + index % 3}` } } } },
  }));
  const state = { reviews, history, calls, saves, messages: [], fail: '', readonly: false };
  const writable = (record) => !state.readonly && (['admin', 'superadmin'].includes(profile.role) || record.client_id === first?.id);
  return { state, tables: { traffic_weekly_reviews: reviews, traffic_weekly_history: history }, contacts,
    rpc(name, args = {}) {
      if (name === 'gestor_ia_routine_leads_data') return { data: { contacts: structuredClone(contacts), messages: structuredClone(state.messages), config: null, niche: first?.nicho || '' } };
      if (!['traffic_weekly_board', 'traffic_routine_client_history', 'start_traffic_week_record', 'save_traffic_weekly_review', 'save_traffic_sheet_metrics'].includes(name)) return undefined;
      calls.push({ name, args: structuredClone(args) });
      if (name === 'traffic_weekly_board') return { data: structuredClone(board()) };
      if (name === 'traffic_routine_client_history') return { data: structuredClone(reviews.filter((record) => record.client_id === args.p_client && record.kind === args.p_kind && (!args.p_before || record.week_start < args.p_before)).sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, args.p_limit || 30)).map((record) => ({ ...record, can_edit: writable(record) })) };
      if (name === 'start_traffic_week_record') {
        const existing = reviews.find((record) => record.client_id === args.p_client && record.week_start === args.p_week && record.kind === args.p_kind);
        if (existing) return { data: existing.id };
        const record = { ...base, id: `fixture-week-${args.p_client}-${args.p_week}`, client_id: args.p_client, week_start: args.p_week, kind: args.p_kind, revision: 0, campaign_metrics: [], analysis: '', data_note: '', action_mode: 'undecided', finalized_at: null };
        reviews.push(record);
        return { data: record.id };
      }
      if (name === 'save_traffic_sheet_metrics') return { data: true };
      const record = reviews.find((item) => item.id === args.p_review);
      if (!record || !writable(record)) return { error: { message: 'Somente o responsável ou gestor pode revisar esta semana.' } };
      if (state.fail) return { error: { message: state.fail } };
      if (record.revision !== args.p_revision) return { error: { message: 'Outra pessoa atualizou esta revisão. Reabra para conferir a versão atual.' } };
      const before = structuredClone(record);
      Object.assign(record, args.p_data, { revision: record.revision + 1, finalized_at: args.p_finalize ? `${today}T15:00:00Z` : null, finalized_by: args.p_finalize ? profile.id : null,
        fill_origin: record.fill_origin || 'pessoa', validation_state: args.p_finalize ? 'validado' : 'em_revisao' });
      saves.push(structuredClone(args));
      history.push({ id: history.length + 1, review_id: record.id, event: args.p_finalize ? 'finalized' : 'draft', occurred_at: `${today}T15:00:00Z`, actor_id: profile.id, actor_type: 'pessoa', snapshot: { before, after: structuredClone(record) } });
      return { data: record.id };
    },
  };
}
