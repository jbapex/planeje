import type { RoutineLeadSummary } from './gestorIaRoutine.js';
export type RoutineCohortOrigin = {
  kind: 'adset' | 'campaign' | 'unlinked'; id: string; account_id: string; campaign_id: string;
  adset_id: string; campaign_name: string; adset_name: string; label: string;
};
export type RoutineCohortWindow = { days: number; count: number; percent: number; incomplete: boolean; partial_history: boolean };
export type RoutineCohort = {
  key: string; week_start: string; origin: RoutineCohortOrigin; entries: number;
  spend: number | null; spend_status: 'conhecido' | 'ausente' | 'incompleto' | 'ambiguo' | 'sem_vinculo';
  cost_per_entry: number | null; appointments: number; dated_appointments: number; without_history: number; cpa: number | null;
  buckets: { week0: number; week1: number; week2: number; week3plus: number }; windows: RoutineCohortWindow[];
};
export type RoutineCohortReport = {
  schema_version: 1; cliente_id: string; semana: string; as_of: string; ledger_started_at: string;
  cohorts: RoutineCohort[]; weekly_summary: RoutineLeadSummary;
  diagnostics: { total: number; groups: { code: string; label: string; count: number; novos: number; antigos: number; correction: string }[] };
  coverage: { entries: number; dated_appointments: number; without_history: number; partial_history: boolean };
};
export function buildRoutineCohortReport(dto: unknown): RoutineCohortReport;
