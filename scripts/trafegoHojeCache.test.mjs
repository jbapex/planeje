/**
 * Cache da última análise da Meta no Hoje: memória + TTL + busca incompleta.
 */
import {
  HOJE_META_TTL_MS,
  hojeMetaCacheHasRows,
  readHojeMetaCache,
  resetHojeMetaCacheForTests,
  shouldReuseHojeMetaCache,
  writeHojeMetaCache,
  readCentralHojeCache,
  writeCentralHojeCache,
  invalidateCentralHojeCache,
} from '../src/lib/trafegoHojeCache.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

resetHojeMetaCacheForTests();

const sample = [{ client: { id: 'c1', empresa: 'Ana' }, spend: 10, groups: [] }];

writeHojeMetaCache('u1', '2026-09-19', { dayRows: sample, weekRows: [], complete: false, clientCount: 4 });
const partial = readHojeMetaCache('u1', '2026-09-19');
assert(hojeMetaCacheHasRows(partial), 'rascunho da busca já mostra contas');
assert(
  !shouldReuseHojeMetaCache(partial, { ttlMs: HOJE_META_TTL_MS }),
  'busca incompleta não dispensa o restante'
);

writeHojeMetaCache('u1', '2026-09-19', {
  dayRows: sample,
  weekRows: sample,
  complete: true,
  clientCount: 1,
});
const full = readHojeMetaCache('u1', '2026-09-19');
assert(shouldReuseHojeMetaCache(full), 'análise completa e recente não chama a Meta de novo');
assert(!shouldReuseHojeMetaCache(full, { force: true }), 'Atualizar força busca nova');

writeHojeMetaCache('u1', '2026-09-19', {
  dayRows: sample,
  weekRows: [],
  complete: true,
  clientCount: 11,
});
assert(
  !shouldReuseHojeMetaCache(readHojeMetaCache('u1', '2026-09-19')),
  'menos contas que a carteira continua a busca'
);

writeHojeMetaCache('u1', '2026-09-19', {
  dayRows: sample,
  weekRows: [],
  complete: true,
  clientCount: 1,
  fetchedAt: Date.now() - HOJE_META_TTL_MS - 1000,
});
assert(
  !shouldReuseHojeMetaCache(readHojeMetaCache('u1', '2026-09-19')),
  'TTL vencido volta a buscar, mas as contas continuam na memória'
);
assert(
  hojeMetaCacheHasRows(readHojeMetaCache('u1', '2026-09-19')),
  'sair e voltar ainda encontra o que já tinha'
);

assert(!hojeMetaCacheHasRows(null), 'sem cache não inventa fila');
assert(!shouldReuseHojeMetaCache(null), 'sem cache busca');

function resetCache() {
  resetHojeMetaCacheForTests();
  try {
    localStorage.removeItem('planeje-hoje-meta:v4:u1:2026-09-19');
    localStorage.removeItem('planeje-hoje-meta:v3:u1:2026-09-19');
  } catch {
    /* node sem storage */
  }
}

resetCache();
writeHojeMetaCache('u1', '2026-09-18', { dayRows: sample, complete: true, clientCount: 1 });
assert(!readHojeMetaCache('u1', '2026-09-19'), 'o dia de hoje não mistura com o de ontem');

resetCache();
assert(!readHojeMetaCache('u1', '2026-09-19'), 'reset de teste limpa a memória');

resetCache();
localStorage.setItem(
  'planeje-hoje-meta:v3:u1:2026-09-19',
  JSON.stringify({
    dayRows: sample,
    weekRows: [],
    complete: true,
    fetchedAt: Date.now(),
  })
);
const migrated = readHojeMetaCache('u1', '2026-09-19');
assert(hojeMetaCacheHasRows(migrated), 'cache antigo ainda mostra as contas');
assert(!shouldReuseHojeMetaCache(migrated), 'cache antigo completa a leitura em segundo plano');

writeCentralHojeCache('u1', { weeklyReviews: [{ id: 'pending' }] });
writeCentralHojeCache('u2', { weeklyReviews: [{ id: 'other-user' }] });
invalidateCentralHojeCache('u1');
assert(readCentralHojeCache('u1') === null, 'salvar a rotina invalida a lista antiga do Hoje');
assert(readCentralHojeCache('u2')?.weeklyReviews[0]?.id === 'other-user', 'invalidar não mistura usuários');
assert(hojeMetaCacheHasRows(readHojeMetaCache('u1', '2026-09-19')), 'concluir a rotina preserva o cache de anúncios');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK cache Hoje Meta');
