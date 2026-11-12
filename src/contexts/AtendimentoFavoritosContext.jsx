import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAtendimentoUsuarioAcesso } from '@/hooks/useAtendimentoUsuarioAcesso';
import { useAtendimentoFavoritos } from '@/hooks/useAtendimentoFavoritos';
import AtendimentoFavoritosRail from '@/components/atendimento/AtendimentoFavoritosRail';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { mergeConversationForFavorito } from '@/lib/atendimentoFavoritos';

const AtendimentoFavoritosContext = createContext(null);

export function useAtendimentoFavoritosContext() {
  const ctx = useContext(AtendimentoFavoritosContext);
  return ctx;
}

export function AtendimentoFavoritosProvider({ children }) {
  const { profile } = useAuth();
  const isStaff = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role);

  const {
    effectiveClienteId,
    conversasAccessMissing,
  } = useClienteWhatsAppConfig({ forConversas: true });

  const { accessRows, filaCanaisByConfigId } = useAtendimentoUsuarioAcesso({
    enabled: Boolean(isStaff),
  });

  const favoritosApi = useAtendimentoFavoritos({
    clienteId: effectiveClienteId,
    userId: profile?.id,
    role: profile?.role,
    userAccess: accessRows,
    filaCanaisByConfigId,
  });

  const [liveById, setLiveById] = useState(() => new Map());

  const registerLiveConversations = useCallback((conversations = []) => {
    setLiveById((prev) => {
      const next = new Map(prev);
      for (const conv of conversations || []) {
        if (!conv?.id) continue;
        const existing = next.get(conv.id);
        next.set(conv.id, mergeConversationForFavorito(existing, conv));
      }
      return next;
    });
  }, []);

  const favoritesDisplay = useMemo(
    () =>
      favoritosApi.favorites.map((fav) =>
        mergeConversationForFavorito(fav, liveById.get(fav.id)),
      ),
    [favoritosApi.favorites, liveById],
  );

  const value = useMemo(
    () => ({
      ...favoritosApi,
      favorites: favoritesDisplay,
      registerLiveConversations,
      enabled: Boolean(isStaff) && !conversasAccessMissing && effectiveClienteId,
    }),
    [favoritosApi, favoritesDisplay, registerLiveConversations, isStaff, conversasAccessMissing, effectiveClienteId],
  );

  if (!isStaff) {
    return children;
  }

  return (
    <AtendimentoFavoritosContext.Provider value={value}>
      {children}
    </AtendimentoFavoritosContext.Provider>
  );
}

export function AtendimentoFavoritosGlobalRail() {
  const ctx = useAtendimentoFavoritosContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  if (!ctx?.enabled || !ctx.favorites?.length) {
    return null;
  }

  const chatFromUrl = searchParams.get('chat');
  const selectedId =
    ctx.favorites.find((f) => f.chat_jid === chatFromUrl)?.id ?? null;

  const handleSelect = (conv) => {
    if (!conv) return;
    navigate(
      buildConversasUrl({
        statusTab: conv.status,
        chatJid: conv.chat_jid,
      }),
    );
  };

  return (
    <AtendimentoFavoritosRail
      favorites={ctx.favorites}
      selectedId={selectedId}
      onSelect={handleSelect}
      variant="global"
    />
  );
}

/** Sincroniza contadores ao vivo quando a página Conversas está aberta. */
export function AtendimentoFavoritosLiveSync({ conversations = [] }) {
  const ctx = useAtendimentoFavoritosContext();

  useEffect(() => {
    ctx?.registerLiveConversations?.(conversations);
  }, [ctx, conversations]);

  return null;
}
