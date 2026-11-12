import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCentralTrafegoCheckupBoard } from '@/lib/centralTrafegoApi';
import { partitionCheckupClients, summarizeCheckupBoard } from '@/lib/centralTrafegoCheckup';
import { fetchIdsClientesAtivosCarteira, keepClientesAtivos } from '@/lib/clientesAtivosCarteira';

export function useCentralTrafegoCheckup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [operationalDate, setOperationalDate] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await fetchCentralTrafegoCheckupBoard();
      if (err) throw err;
      const ativoIds = await fetchIdsClientesAtivosCarteira();
      const rows = keepClientesAtivos(data?.clients || [], ativoIds, (row) => row.client_id || row.id);
      setClients(rows);
      setTeam(data?.team || []);
      setOperationalDate(data?.operational_date || null);
    } catch (e) {
      setError(e?.message || String(e));
      setClients([]);
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = useMemo(() => summarizeCheckupBoard(clients), [clients]);
  const groups = useMemo(() => partitionCheckupClients(clients), [clients]);

  return { loading, error, clients, team, operationalDate, summary, groups, reload };
}
