import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCentralTrafegoHoje, fetchTrafficWeeklyBoard } from '@/lib/centralTrafegoApi';
import { fetchIdsClientesAtivosCarteira, keepClientesAtivos } from '@/lib/clientesAtivosCarteira';
import {
  HOJE_DEMANDS_TTL_MS,
  CENTRAL_HOJE_CHANGED,
  isHojeCacheFresh,
  readCentralHojeCache,
  writeCentralHojeCache,
} from '@/lib/trafegoHojeCache';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const EMPTY = {
  atrasadas: [],
  vencem_hoje: [],
  rotina: [],
  revisoes_48h: [],
  aguardando_cliente: [],
  publicacoes_pendentes: [],
  demais: [],
};

export function useCentralTrafegoHoje() {
  const { user } = useAuth();
  const initialCache = useMemo(() => readCentralHojeCache(user?.id), [user?.id]);
  const [loading, setLoading] = useState(() => !initialCache?.clients?.length);
  const [error, setError] = useState(null);
  const [buckets, setBuckets] = useState(() => initialCache?.buckets || EMPTY);
  const [clients, setClients] = useState(() => initialCache?.clients || []);
  const [campaigns, setCampaigns] = useState(() => initialCache?.campaigns || []);
  const [team, setTeam] = useState(() => initialCache?.team || []);
  const [weeklyReviews, setWeeklyReviews] = useState(() => initialCache?.weeklyReviews || []);
  const [weeklyClients, setWeeklyClients] = useState(() => initialCache?.weeklyClients || []);
  const [weeklyToday, setWeeklyToday] = useState(() => initialCache?.weeklyToday || '');
  const [fetchedAt, setFetchedAt] = useState(() => initialCache?.fetchedAt || 0);
  const fetchingRef = useRef(false);
  const reloadPending = useRef(false);
  const clientsRef = useRef(clients);

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  const reload = useCallback(
    async ({ force = false } = {}) => {
      const cached = readCentralHojeCache(user?.id);
      if (!force && cached && isHojeCacheFresh(cached.fetchedAt, HOJE_DEMANDS_TTL_MS)) {
        if (cached.buckets) setBuckets(cached.buckets);
        setClients(cached.clients);
        setCampaigns(cached.campaigns);
        setTeam(cached.team);
        setWeeklyReviews(cached.weeklyReviews || []);
        setWeeklyClients(cached.weeklyClients || []);
        setWeeklyToday(cached.weeklyToday || '');
        setFetchedAt(cached.fetchedAt);
        setLoading(false);
        return;
      }
      if (fetchingRef.current) { if (force) reloadPending.current = true; return; }
      fetchingRef.current = true;

      setError(null);
      const hadData = Boolean(cached?.clients?.length || clientsRef.current.length);
      if (!hadData) setLoading(true);
      try {
        const [{ data, error: err }, weekly] = await Promise.all([
          fetchCentralTrafegoHoje(),
          fetchTrafficWeeklyBoard(),
        ]);
        if (err) throw err;
        const payload = data || {};
        const ativoIds = await fetchIdsClientesAtivosCarteira();
        const nextBuckets = {
          atrasadas: keepClientesAtivos(payload.atrasadas, ativoIds),
          vencem_hoje: keepClientesAtivos(payload.vencem_hoje, ativoIds),
          rotina: keepClientesAtivos(payload.rotina, ativoIds),
          revisoes_48h: keepClientesAtivos(payload.revisoes_48h, ativoIds),
          aguardando_cliente: keepClientesAtivos(payload.aguardando_cliente, ativoIds),
          publicacoes_pendentes: keepClientesAtivos(payload.publicacoes_pendentes, ativoIds),
          demais: keepClientesAtivos(payload.demais, ativoIds),
        };
        const nextClients = keepClientesAtivos(payload.clients, ativoIds);
        const nextCampaigns = keepClientesAtivos(payload.campaigns, ativoIds);
        const nextTeam = payload.team || [];
        const nextWeekly = weekly.error
          ? []
          : keepClientesAtivos(weekly.data?.reviews || [], ativoIds);
        const nextWeeklyClients = weekly.error
          ? []
          : keepClientesAtivos(weekly.data?.clients || [], ativoIds);
        const nextWeeklyToday = weekly.error ? '' : weekly.data?.today || '';
        setBuckets(nextBuckets);
        setClients(nextClients);
        setCampaigns(nextCampaigns);
        setTeam(nextTeam);
        setWeeklyReviews(nextWeekly);
        setWeeklyClients(nextWeeklyClients);
        setWeeklyToday(nextWeeklyToday);
        const ts = Date.now();
        setFetchedAt(ts);
        writeCentralHojeCache(user?.id, {
          buckets: nextBuckets,
          clients: nextClients,
          campaigns: nextCampaigns,
          team: nextTeam,
          weeklyReviews: nextWeekly,
          weeklyClients: nextWeeklyClients,
          weeklyToday: nextWeeklyToday,
        });
      } catch (e) {
        setError(e?.message || String(e));
        if (!clientsRef.current.length) {
          setBuckets(EMPTY);
          setClients([]);
          setCampaigns([]);
          setTeam([]);
          setWeeklyReviews([]);
          setWeeklyClients([]);
          setWeeklyToday('');
        }
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        if (reloadPending.current) { reloadPending.current = false; void reload({ force: true }); }
      }
    },
    [user?.id]
  );

  useEffect(() => {
    reload({ force: false });
  }, [reload]);

  useEffect(() => {
    const changed = (event) => { if (event.detail?.userId === user?.id) void reload({ force: true }); };
    window.addEventListener(CENTRAL_HOJE_CHANGED, changed);
    return () => window.removeEventListener(CENTRAL_HOJE_CHANGED, changed);
  }, [reload, user?.id]);

  return { loading, error, buckets, clients, campaigns, team, weeklyReviews, weeklyClients, weeklyToday, fetchedAt, reload: () => reload({ force: true }) };
}
