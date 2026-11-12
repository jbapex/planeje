import { supabase } from '@/lib/customSupabaseClient';

const PROFILE_VISIT_ACTIONS = new Set([
  'instagram_profile_visit',
  'profile_visit',
  'onsite_conversion.instagram_profile_visit',
]);

function sumAction(actions, types) {
  const want = types instanceof Set ? types : new Set(types);
  let total = 0;
  for (const row of actions || []) {
    if (want.has(String(row?.action_type || ''))) {
      total += Number(row?.value) || 0;
    }
  }
  return total;
}

export function emptyPaid() {
  return {
    accounts: [],
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    linkClicks: 0,
    profileVisits: 0,
    conversations: 0,
    campaigns: [],
    note: null,
  };
}

export async function fetchPaidTraffic({ clientId, timeRange }) {
  if (!clientId) {
    return { ...emptyPaid(), note: 'Selecione um cliente para cruzar com o tráfego pago.' };
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('cliente_meta_accounts')
    .select('meta_account_id, meta_account_name, is_active')
    .eq('cliente_id', clientId)
    .eq('is_active', true);

  if (accountsError) {
    return { ...emptyPaid(), note: accountsError.message || 'Não foi possível ler as contas de anúncio.' };
  }

  const list = (accounts || []).filter((row) => row.meta_account_id);
  if (!list.length) {
    return {
      ...emptyPaid(),
      note: 'Nenhuma conta de anúncio ligada a este cliente. Ligue em Cadastro → Meta / Tráfego.',
    };
  }

  const accountResults = await Promise.all(
    list.map(async (acc) => {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-campaign-insights',
          ad_account_id: acc.meta_account_id,
          cliente_id: clientId,
          time_range: timeRange,
          level: 'account',
          metrics: ['spend', 'impressions', 'clicks', 'reach', 'actions'],
          limit: 5,
        },
      });
      if (error || data?.error) {
        return {
          id: acc.meta_account_id,
          name: acc.meta_account_name || acc.meta_account_id,
          error: data?.error?.message || error?.message || 'Erro na Meta',
          row: null,
        };
      }
      const row = Array.isArray(data?.campaigns) ? data.campaigns[0] : null;
      return {
        id: acc.meta_account_id,
        name: acc.meta_account_name || acc.meta_account_id,
        error: null,
        row,
      };
    })
  );

  const campaignResults = await Promise.all(
    list.map(async (acc) => {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-campaign-insights',
          ad_account_id: acc.meta_account_id,
          cliente_id: clientId,
          time_range: timeRange,
          level: 'campaign',
          metrics: ['spend', 'impressions', 'clicks', 'reach', 'actions', 'campaign_name', 'campaign_id'],
          limit: 100,
        },
      });
      if (error || data?.error) return [];
      return (data?.campaigns || []).map((row) => ({
        ...row,
        _account: acc.meta_account_name || acc.meta_account_id,
      }));
    })
  );

  const paid = emptyPaid();
  paid.accounts = accountResults.map((item) => ({
    id: item.id,
    name: item.name,
    error: item.error,
    spend: Number(item.row?.spend) || 0,
  }));

  for (const item of accountResults) {
    const row = item.row;
    if (!row) continue;
    paid.spend += Number(row.spend) || 0;
    paid.impressions += Number(row.impressions) || 0;
    paid.clicks += Number(row.clicks) || 0;
    paid.reach += Number(row.reach) || 0;
    paid.linkClicks += sumAction(row.actions, ['link_click']);
    paid.profileVisits += sumAction(row.actions, PROFILE_VISIT_ACTIONS);
    paid.conversations += sumAction(row.actions, [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.total_messaging_connection',
    ]);
  }

  const allCampaigns = campaignResults.flat();
  paid.campaigns = allCampaigns
    .map((row) => ({
      id: row.campaign_id || row.id,
      name: row.campaign_name || 'Campanha',
      account: row._account,
      spend: Number(row.spend) || 0,
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      reach: Number(row.reach) || 0,
      linkClicks: sumAction(row.actions, ['link_click']),
      profileVisits: sumAction(row.actions, PROFILE_VISIT_ACTIONS),
    }))
    .filter((row) => row.spend > 0 || row.clicks > 0 || row.impressions > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  if (!paid.spend && !paid.impressions && accountResults.every((item) => !item.row || item.error)) {
    const firstErr = accountResults.find((item) => item.error)?.error;
    paid.note = firstErr
      || 'Sem entrega de tráfego pago neste período nas contas ligadas.';
  } else if (!paid.spend && !paid.impressions) {
    paid.note = 'Contas ligadas sem gasto/impressões no período selecionado.';
  }

  return paid;
}
