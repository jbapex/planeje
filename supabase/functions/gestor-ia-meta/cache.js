import { selectMetaHistory } from './history.js';

const CACHE = 'gestor_ia_meta_cache';
export const periodKey = ({ since, until }) => `${since}:${until}`;

function unwrap({ data, error }) {
  if (error) throw new Error('Leituras salvas indisponíveis.');
  return data;
}

export function createMetaCache(db) {
  const source = (client) => db.from(CACHE).select('conta_id,janela,dados,lido_em').eq('cliente_id', client);
  const reading = (row) => row && { ...row.dados, fetchedAt: row.lido_em };
  return {
    async history(client, account) {
      return reading(unwrap(await source(client).eq('conta_id', account).eq('janela', 'historico').maybeSingle()));
    },
    async metrics(client, account, period, fallback = true) {
      const key = periodKey(period);
      const query = () => source(client).eq('conta_id', account);
      const rows = unwrap(await query().in('janela', [key, 'historico']));
      const exact = reading(rows.find((row) => row.janela === key));
      const history = reading(rows.find((row) => row.janela === 'historico')) || null;
      const filtered = selectMetaHistory(history, period);
      if (exact && (!filtered?.exact || Date.parse(exact.fetchedAt) >= Date.parse(filtered.fetchedAt))) {
        return { reading: { ...exact, comparison: exact.comparison || (filtered?.exact ? filtered.comparison : null), coverage: history?.period }, exact: true, history };
      }
      if (filtered && !filtered.exact && filtered.period.since === period.since) {
        const coveredKey = periodKey(filtered.period);
        const { data, error } = await query().eq('janela', coveredKey).maybeSingle();
        const saved = !error && reading(data);
        if (saved?.period && periodKey(saved.period) === coveredKey && Date.parse(saved.fetchedAt) >= Date.parse(filtered.fetchedAt)) {
          return { reading: { ...saved, comparison: saved.comparison || filtered.comparison, coverage: history.period }, exact: false, history };
        }
      }
      if (filtered || !fallback) return { reading: filtered, exact: filtered?.exact === true, history };
      const latest = unwrap(await query().not('janela', 'in', '(conta,historico)').order('lido_em', { ascending: false }).limit(1).maybeSingle());
      return { reading: reading(latest), exact: false, history };
    },
    async accounts(client, accounts) {
      const rows = [];
      for (let start = 0; start < accounts.length; start += 100) {
        rows.push(...unwrap(await source(client).eq('janela', 'conta').in('conta_id', accounts.slice(start, start + 100))));
      }
      return rows.map(reading);
    },
    async portalHistories(client, revision) {
      return unwrap(await db.rpc('gestor_ia_historicos_metricas_portal', { p_client_id: client, p_revision: revision }));
    },
    async reserve(client, account) {
      return unwrap(await db.rpc('gestor_ia_meta_reservar', { p_cliente_id: client, p_conta_id: account }));
    },
    async finish(lease, rows, rateLimited) {
      return unwrap(await db.rpc('gestor_ia_meta_concluir', { p_reserva: lease, p_leituras: rows, p_limitado: rateLimited }));
    },
  };
}

