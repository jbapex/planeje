/**
 * Atendimento da loja: níveis no servidor.
 * Inbox do login: página atendimento em allowed_pages (padrão Ápice com nulo).
 * IA automática segue a lista Ápice / módulo. Espelho de src/lib/atendimentoLojaAcesso.js.
 */

export const ATENDIMENTO_LOJA_CLIENTE_IDS = ['a2396b48-2d2f-4b4b-adfd-3a4043b320e6'];
export const ATENDIMENTO_PAGE_KEY = 'atendimento';

export const ATENDIMENTO_NIVEIS = ['admin', 'supervisor', 'atendente'];

type Membro = { nivel?: string | null; ativo?: boolean | null; cliente_id?: string | null } | null | undefined;

type NivelOptions = { lojaHabilitada?: boolean; implicitAdmin?: boolean };

const PODE_ENVIAR: Record<string, boolean> = { admin: true, supervisor: true, atendente: true };
const PODE_GERIR_USUARIOS: Record<string, boolean> = { admin: true };
const PODE_CONFIGURAR_IA: Record<string, boolean> = { admin: true };

export function isAtendimentoLojaHabilitada(clienteId: unknown, enabledOverride?: boolean): boolean {
  const id = String(clienteId || '').trim().toLowerCase();
  if (!id) return false;
  if (typeof enabledOverride === 'boolean') return enabledOverride;
  return ATENDIMENTO_LOJA_CLIENTE_IDS.includes(id);
}

function allowedPagesHasKey(allowedPages: unknown, key: string): boolean {
  if (!Array.isArray(allowedPages)) return false;
  return allowedPages.map((item) => String(item || '').trim()).includes(key);
}

/** Página Atendimento no login. Nulo = só Ápice. */
export function hasAtendimentoPagePermission(
  allowedPages: unknown,
  clienteId: unknown,
  enabledOverride?: boolean,
): boolean {
  if (typeof enabledOverride === 'boolean') return enabledOverride;
  if (allowedPagesHasKey(allowedPages, ATENDIMENTO_PAGE_KEY)) return true;
  if (allowedPages === null || allowedPages === undefined) {
    return isAtendimentoLojaHabilitada(clienteId);
  }
  return false;
}

export async function fetchAtendimentoLojaHabilitada(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  clienteId: unknown,
): Promise<boolean> {
  const id = String(clienteId || '').trim();
  if (!id) return false;
  const { data, error } = await supabase.rpc('cliente_atend_loja_habilitada', { p_cliente_id: id });
  if (error) return isAtendimentoLojaHabilitada(id);
  return data === true;
}

export function nivelEfetivo(membro: Membro, clienteId: unknown, options: NivelOptions = {}): string | null {
  const habilitada =
    typeof options.lojaHabilitada === 'boolean'
      ? options.lojaHabilitada
      : isAtendimentoLojaHabilitada(clienteId);
  if (!habilitada) return null;
  if (options.implicitAdmin) return 'admin';
  if (!membro || membro.ativo === false) return null;
  if (membro.cliente_id && String(membro.cliente_id) !== String(clienteId)) return null;
  const nivel = String(membro.nivel || '');
  return ATENDIMENTO_NIVEIS.includes(nivel) ? nivel : null;
}

export function canClienteSendAtendimento(args: {
  role?: string | null;
  profileClienteId?: string | null;
  targetClienteId?: string | null;
  membro?: Membro;
  isAction?: boolean;
  lojaHabilitada?: boolean;
  implicitAdmin?: boolean;
  allowedPages?: unknown;
} = {}): boolean {
  if (args.role !== 'cliente') return false;
  if (args.isAction) return false;
  const profileId = String(args.profileClienteId || '').trim();
  const targetId = String(args.targetClienteId || '').trim();
  if (!profileId || !targetId || profileId !== targetId) return false;
  const paginaOk = hasAtendimentoPagePermission(args.allowedPages, profileId, args.lojaHabilitada);
  const nivel = nivelEfetivo(args.membro, profileId, {
    lojaHabilitada: paginaOk,
    implicitAdmin: args.implicitAdmin,
  });
  return Boolean(nivel && PODE_ENVIAR[nivel]);
}

export function podeGerirUsuariosDaLoja(membro: Membro, clienteId: unknown, options: NivelOptions = {}): boolean {
  const nivel = nivelEfetivo(membro, clienteId, options);
  return Boolean(nivel && PODE_GERIR_USUARIOS[nivel]);
}

export function podeConfigurarIaDaLoja(membro: Membro, clienteId: unknown, options: NivelOptions = {}): boolean {
  const nivel = nivelEfetivo(membro, clienteId, options);
  return Boolean(nivel && PODE_CONFIGURAR_IA[nivel]);
}

export function isAtendimentoInternalSenderRole(role: unknown): boolean {
  return ['superadmin', 'admin', 'colaborador'].includes(String(role || ''));
}
