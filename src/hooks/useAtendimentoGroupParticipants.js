import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enrichParticipantsWithAvatars,
  fetchUazapiGroupParticipants,
} from '@/lib/uazapiGroupParticipants';

export function useAtendimentoGroupParticipants({
  conversation,
  clienteId,
  enabled = true,
}) {
  const [participants, setParticipants] = useState([]);
  const [groupName, setGroupName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestIdRef = useRef(0);

  const isGroup = Boolean(conversation?.is_group);
  const groupJid = conversation?.chat_jid;
  const whatsappConfigId = conversation?.whatsapp_config_id;

  const load = useCallback(
    async (force = false) => {
      if (!enabled || !isGroup || !groupJid || !clienteId) return;
      if (!force && loadedOnce) return;

      const reqId = ++requestIdRef.current;
      setLoading(true);
      setError('');
      try {
        const result = await fetchUazapiGroupParticipants({
          groupJid,
          clienteId,
          whatsappConfigId,
          syncContacts: true,
        });
        if (reqId !== requestIdRef.current) return;

        const enriched = await enrichParticipantsWithAvatars(clienteId, result.participants, {
          groupJid,
        });
        if (reqId !== requestIdRef.current) return;

        setParticipants(enriched);
        setGroupName(result.groupName);
        setLoadedOnce(true);
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        setError(e?.message || 'Não foi possível carregar participantes.');
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [
      enabled,
      isGroup,
      groupJid,
      clienteId,
      whatsappConfigId,
      loadedOnce,
    ],
  );

  useEffect(() => {
    setParticipants([]);
    setGroupName(null);
    setLoadedOnce(false);
    setError('');
  }, [conversation?.id, groupJid]);

  return {
    participants,
    groupName,
    loading,
    error,
    loadedOnce,
    load,
    refresh: () => load(true),
    isGroup,
  };
}
