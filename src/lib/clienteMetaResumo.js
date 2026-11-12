import { supabase } from '@/lib/customSupabaseClient';
import { clientHealth, formatMoney } from '@/lib/trafegoFila';
import {
  isMetaSnapshotStale,
  metricsFromSnapshot,
  readClienteMetaResumo,
  snapshotListSummary,
  snapshotRunningLabel,
  syncClienteMetaResumo,
} from '@/lib/clienteMetaSnapshot';

export async function loadClienteMetaResumo(client) {
  if (!client?.id) {
    return { accounts: [], metrics: undefined, health: null, permError: false, snapshot: null };
  }

  const { data: accounts, error } = await supabase
    .from('cliente_meta_accounts')
    .select('cliente_id, meta_account_id, meta_account_name, is_active')
    .eq('cliente_id', client.id)
    .eq('is_active', true);

  if (error) throw error;
  const list = accounts || [];
  if (!list.length) {
    return { accounts: [], metrics: undefined, health: null, permError: false, snapshot: null };
  }

  let snapshot = readClienteMetaResumo(client);
  if (!snapshot) {
    const { data, error: snapErr } = await supabase.from('clientes').select('meta_resumo, entregaveis').eq('id', client.id).maybeSingle();
    if (snapErr && /meta_resumo/i.test(String(snapErr.message || ''))) {
      const retry = await supabase.from('clientes').select('entregaveis').eq('id', client.id).maybeSingle();
      snapshot = retry.data?.entregaveis?.meta_resumo || null;
    } else if (!snapErr) {
      snapshot = readClienteMetaResumo(data);
    }
  }

  if (!snapshot || isMetaSnapshotStale(snapshot)) {
    snapshot = await syncClienteMetaResumo(client.id, list, { previous: snapshot });
  }

  const metrics = metricsFromSnapshot(snapshot);
  return {
    accounts: list,
    metrics,
    health: clientHealth(client, metrics),
    permError: Boolean(snapshot?.permError),
    snapshot,
  };
}

export function metaResumoLabel({ accounts, metrics, health, client, snapshot }) {
  if (!accounts?.length) return { title: 'Sem conta Meta', sub: 'Vincule a conta de anúncios no cadastro', tone: 'muted' };
  if (metrics === null) return { title: 'Sem permissão na Meta', sub: 'O System User não lê esta conta', tone: 'danger' };
  if (metrics === undefined && !snapshot) return { title: 'Carregando…', sub: 'Gasto do mês', tone: 'muted' };
  if (snapshot) {
    const { sold } = snapshotListSummary(snapshot);
    return {
      title: snapshotRunningLabel(snapshot),
      sub: `${formatMoney(snapshot.spend)}${client?.limite_meta ? ` / ${formatMoney(client.limite_meta)}` : ''} · ${sold.text}`,
      tone: snapshot.permError ? 'danger' : sold.tone === 'danger' ? 'warn' : health?.tone === 'danger' ? 'danger' : 'ok',
    };
  }
  const limite = Number(client?.limite_meta) || 0;
  const spendText = formatMoney(metrics.spend);
  if (limite > 0) {
    return {
      title: `${spendText} / ${formatMoney(limite)}`,
      sub: health?.label || 'Gasto no mês vs limite',
      tone: health?.tone === 'danger' ? 'danger' : health?.tone === 'warn' ? 'warn' : 'ok',
    };
  }
  return {
    title: spendText,
    sub: health?.label || 'Gasto no mês',
    tone: health?.tone === 'danger' ? 'danger' : health?.tone === 'warn' ? 'warn' : 'ok',
  };
}
