import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canSeeAtendimentoPreview } from '@/lib/atendimentoPreviewGate';
import { nivelEfetivo, permissoesDoNivel } from '@/lib/atendimentoLojaAcesso';
import { fetchLojaTemMembros, fetchMeuMembro } from '@/lib/atendimentoLojaData';

export const ATENDIMENTO_MEMBRO_EVENT = 'planeje:atendimento-membro-changed';

const cache = new Map();

function cacheKey(clienteId, userId) {
  return clienteId && userId ? `${clienteId}:${userId}` : null;
}

/** Linha de cliente_atend_membros do usuário logado (página Atendimento permitida). */
export function useAtendimentoLojaMembro() {
  const { user, profile } = useAuth();
  const clienteIdHint = profile?.role === 'cliente' ? profile?.cliente_id : null;
  const pageAllowed = canSeeAtendimentoPreview(profile);
  const key = cacheKey(clienteIdHint, user?.id);
  const cached = key ? cache.get(key) : null;
  const [state, setState] = useState(() => ({
    loading: Boolean(key && pageAllowed) && !cached,
    membro: cached?.membro || null,
    lojaHabilitada: cached?.lojaHabilitada ?? pageAllowed,
    temMembros: cached?.temMembros === true,
  }));

  const load = useCallback(async () => {
    if (!key || !clienteIdHint || !pageAllowed) {
      setState({ loading: false, membro: null, lojaHabilitada: false, temMembros: false });
      return;
    }
    try {
      const membro = await fetchMeuMembro(clienteIdHint, user.id);
      const temMembros = membro ? true : await fetchLojaTemMembros(clienteIdHint);
      const next = { membro, lojaHabilitada: true, temMembros };
      cache.set(key, next);
      setState({ loading: false, ...next });
    } catch {
      const fallback = cache.get(key);
      setState({
        loading: false,
        membro: fallback?.membro || null,
        lojaHabilitada: fallback?.lojaHabilitada ?? pageAllowed,
        temMembros: fallback?.temMembros === true,
      });
    }
  }, [key, clienteIdHint, user?.id, pageAllowed]);

  useEffect(() => {
    load();
    const onChange = () => {
      if (key) cache.delete(key);
      load();
    };
    window.addEventListener(ATENDIMENTO_MEMBRO_EVENT, onChange);
    return () => window.removeEventListener(ATENDIMENTO_MEMBRO_EVENT, onChange);
  }, [load, key]);

  const gate = canSeeAtendimentoPreview(profile);
  const clienteId = gate ? profile?.cliente_id : null;
  const implicitAdmin = gate && !state.membro && !state.temMembros;
  const nivel = gate
    ? nivelEfetivo(state.membro, clienteId, {
        lojaHabilitada: true,
        implicitAdmin,
      })
    : null;
  return {
    gate,
    clienteId,
    loading: state.loading,
    membro: state.membro,
    nivel,
    permissoes: permissoesDoNivel(nivel),
    implicitAdmin,
  };
}
