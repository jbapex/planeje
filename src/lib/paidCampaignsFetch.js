import { supabase } from '@/lib/customSupabaseClient';
import {
  PAID_CAMPAIGN_SELECT_LEGACY,
  PAID_CAMPAIGN_SELECT_WITH_LINKS,
} from '@/lib/paidCampaignTaskLinks';

export async function fetchPaidCampaignsWithLinks({ eqId, order = true, limit } = {}) {
  const run = async (select) => {
    let q = supabase.from('paid_campaigns').select(select);
    if (eqId) q = q.eq('id', eqId);
    if (order) q = q.order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    if (eqId) return q.maybeSingle();
    return q;
  };

  let res = await run(PAID_CAMPAIGN_SELECT_WITH_LINKS);
  if (res.error && /paid_campaign_task_links|PGRST/i.test(String(res.error.message || res.error.code || ''))) {
    res = await run(PAID_CAMPAIGN_SELECT_LEGACY);
  }
  return res;
}
