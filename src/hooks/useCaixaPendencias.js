import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  agirNaPendencia,
  EMPTY_CAIXA,
  listarMinhaCaixa,
} from '@/lib/caixaPendencias';
import { mesclarAvisosGrupoNaCaixa } from '@/lib/atendimentoAvisoEspera';
import { useAvisosGrupoEspera } from '@/hooks/useAvisosGrupoEspera';
import { contarNaoLidos as contarDotNaoLidos } from '@/lib/caixaDot';

export function useCaixaPendencias({ enabled = true } = {}) {
  const { profile } = useAuth();
  const pessoaId = profile?.id ?? null;
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const isActiveProfile = profile?.status === 'active';
  const active = Boolean(enabled && pessoaId && isStaff && isActiveProfile);
  const [data, setData] = useState(EMPTY_CAIXA);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState(null);
  const [actingId, setActingId] = useState(null);
  const mountedRef = useRef(true);
  const { avisos } = useAvisosGrupoEspera();
  const itens = useMemo(
    () => mesclarAvisosGrupoNaCaixa(data.itens, avisos),
    [data.itens, avisos],
  );
  const avisosNaCaixa = Math.max(0, itens.length - (data.itens || []).length);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!active) {
      setData(EMPTY_CAIXA);
      setError(null);
      setLoading(false);
      return EMPTY_CAIXA;
    }

    if (!silent) setLoading(true);
    try {
      const next = await listarMinhaCaixa(pessoaId);
      if (mountedRef.current) {
        setData(next);
        setError(null);
      }
      return next;
    } catch (loadError) {
      if (mountedRef.current) {
        setData(EMPTY_CAIXA);
        setError(loadError);
      }
      return EMPTY_CAIXA;
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [active, pessoaId]);

  const agir = useCallback(async (id, acao) => {
    if (!id || !acao) return null;
    setActingId(id);
    try {
      const result = await agirNaPendencia(id, acao);
      await reload({ silent: true });
      return result;
    } finally {
      if (mountedRef.current) setActingId(null);
    }
  }, [reload]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!active) return undefined;

    const channel = supabase
      .channel(`caixa-pendencias:${pessoaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pendencias_caixa',
          filter: `pessoa_id=eq.${pessoaId}`,
        },
        () => reload({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, pessoaId, reload]);

  return {
    ...data,
    itens,
    badge_total: (Number(data.badge_total) || 0) + avisosNaCaixa,
    contagem: {
      ...data.contagem,
      cliente_sem_resposta: (Number(data.contagem?.cliente_sem_resposta) || 0) + avisosNaCaixa,
    },
    loading,
    error,
    actingId,
    reload,
    agir,
  };
}

export function useCaixaPendenciasBadge() {
  const { badge_total: badgeTotal, loading: pendenciasLoading } = useCaixaPendencias();
  const { profile } = useAuth();
  const pessoaId = profile?.id ?? null;
  const isStaff = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const active = Boolean(pessoaId && isStaff && profile?.status === 'active');
  const [dotUnread, setDotUnread] = useState(0);
  const [dotLoading, setDotLoading] = useState(active);

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setDotUnread(0);
      setDotLoading(false);
      return undefined;
    }
    setDotLoading(true);
    contarDotNaoLidos(pessoaId)
      .then((n) => {
        if (!cancelled) setDotUnread(Number(n) || 0);
      })
      .catch(() => {
        if (!cancelled) setDotUnread(0);
      })
      .finally(() => {
        if (!cancelled) setDotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, pessoaId]);

  return {
    badgeTotal: (Number(badgeTotal) || 0) + (Number(dotUnread) || 0),
    loading: pendenciasLoading || dotLoading,
  };
}

