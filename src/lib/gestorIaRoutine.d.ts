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
  routineScheduleSource: 'crm' | 'conversation' | null;
  routineCrmOutdated: boolean;
  routineMatchReason: string;
};
export function normalizeRoutineWeek(value?: string): string;
export function maskRoutinePhone(value: unknown): string;
export function maskRoutineText(value: unknown): string;
export function routineValidationState(review?: Record<string, unknown> | null): 'a_preencher' | 'rascunho_ia' | 'em_revisao' | 'validado';
export function selectRoutineLeads(contacts: Record<string, unknown>[], options: {
  clientId: string;
  weekStart: string;
  rows?: Record<string, unknown>[];
  config?: unknown;
  niche?: string;
  appointmentsOnly?: boolean;
  messages?: Record<string, unknown>[];
}): { leads: RoutineLead[]; unmatchedLeads: RoutineLead[]; unattributed: number; unresolvedRows: number };
