export type RoutineLeadMode = 'entrada' | 'agendados_na_semana';
export type RoutineOrigin = {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_name: string;
};
export type RoutineLead = {
  id: string;
  cliente_id: string;
  sender_name: string;
  phone: string;
  first_seen_at: string;
  origin_source: string | null;
  qualificado: boolean | null;
  comprou: boolean | null;
  routineAppointment: string;
  routineScheduled: boolean;
  routineScheduleSource: 'crm' | 'conversation' | 'automatico' | 'manual' | null;
  routineCrmOutdated: boolean;
  routineMatchReason: string;
  routineMatchMethod: 'id' | 'name' | 'link' | null;
  routineOrigin: RoutineOrigin;
  routineCohort: 'novo' | 'antigo';
  routineScheduledAt: string;
};
export type RoutineLeadCounts = {
  total: number;
  novos: number;
  antigos: number;
  agendamentos: number;
  agendamentosNovos: number;
  agendamentosAntigos: number;
};
export type RoutineOriginRow = Readonly<Omit<RoutineOrigin, 'ad_name'> & Omit<RoutineLeadCounts, 'total'> & {
  spend: 0;
  readOnly: true;
  status: 'campanha_encerrada' | 'fora_da_revisao';
  cpa: null;
}>;
export type RoutineLeadResult = {
  leads: RoutineLead[];
  unmatchedLeads: RoutineLead[];
  unattributed: number;
  unresolvedRows: number;
  originRows: RoutineOriginRow[];
};
export type RoutineLeadSummary = RoutineLeadCounts & {
  atribuidos: RoutineLeadCounts & { cpaNovos: number; cpa: number | null };
  semVinculo: RoutineLeadCounts;
};
export type RoutineAppointmentEvent = {
  contact_id: string;
  cliente_id?: string;
  at: string;
  source: 'automatico' | 'manual';
  appointment_day?: string;
};
export function normalizeRoutineWeek(value?: string): string;
export function maskRoutinePhone(value: unknown): string;
export function maskRoutineText(value: unknown): string;
export function routineValidationState(review?: Record<string, unknown> | null): 'a_preencher' | 'rascunho_ia' | 'em_revisao' | 'validado';
export function selectRoutineLeads(contacts: Record<string, unknown>[], options: {
  clientId: string;
  weekStart: string;
  rows?: Record<string, unknown>[];
  allRows?: Record<string, unknown>[];
  originCatalog?: Record<string, unknown>[];
  mode?: RoutineLeadMode;
  appointmentEvents?: Record<string, unknown>[];
  config?: unknown;
  niche?: string;
  appointmentsOnly?: boolean;
  messages?: Record<string, unknown>[];
}): RoutineLeadResult;
export function routineLeadSummary(result: Pick<RoutineLeadResult, 'leads' | 'unmatchedLeads'>, rows?: Record<string, unknown>[]): RoutineLeadSummary;
