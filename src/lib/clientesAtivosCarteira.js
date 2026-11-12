import { supabase } from '@/lib/customSupabaseClient';
import { isClienteAtivoNaCarteira } from '@/lib/carteiraClientes';

export { isClienteAtivoNaCarteira };

export async function fetchIdsClientesAtivosCarteira() {
  const { data, error } = await supabase.from('clientes').select('id').eq('etapa', 'closed');
  if (error) throw error;
  return new Set((data || []).map((row) => String(row.id)));
}

export function keepClientesAtivos(items, ids, getId) {
  const pick = getId || ((item) => item?.client_id || item?.client?.id || item?.id);
  return (items || []).filter((item) => ids.has(String(pick(item) || '')));
}
