import { supabase } from '@/lib/customSupabaseClient';
import { createAtendimentoIncomingAlertsController } from './atendimentoIncomingAlertsController.js';

/** One shared subscription group, independent of React/Conversas lifecycles. */
const controller = createAtendimentoIncomingAlertsController(supabase);

export const {
  subscribeAtendimentoIncomingAlerts,
  subscribeAtendimentoBadgeRefresh,
  ensureAtendimentoIncomingAlertsRealtime,
} = controller;
