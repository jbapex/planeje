/**
 * Adaptadores para fluxos antigos (AdRequestForm, BoostTaskDialog, Painel).
 * Nesta etapa permanecem INATIVOS: os formulários antigos não os chamam.
 * Quando a Central estiver habilitada e o endurecimento RLS legado testado,
 * passar a criar/concluir só via create_traffic_demand / complete_traffic_demand.
 */

import { createTrafficDemand, completeTrafficDemand } from '@/lib/centralTrafegoApi';

export const CENTRAL_TRAFEGO_ADAPTERS_ACTIVE = false;

export async function adapterCreateDemandFromLegacyForm(payload, { flagAllowed } = {}) {
  if (!CENTRAL_TRAFEGO_ADAPTERS_ACTIVE || !flagAllowed) {
    return { skipped: true, taskId: null, error: null };
  }
  return createTrafficDemand(payload);
}

export async function adapterCompleteDemandFromLegacyForm(payload, { flagAllowed } = {}) {
  if (!CENTRAL_TRAFEGO_ADAPTERS_ACTIVE || !flagAllowed) {
    return { skipped: true, result: null, error: null };
  }
  return completeTrafficDemand(payload);
}
