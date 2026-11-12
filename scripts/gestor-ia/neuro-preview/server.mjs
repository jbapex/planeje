import { createPreviewDatabase, CLIENT, WEEK } from './db.mjs';
import { serveStaticPreview } from './static.mjs';
import { runRoutineScenario } from './scenario.mjs';
import { runAttributionScenario } from './attribution.mjs';

const port = Number(process.argv[2] || 4395);
if (![4393, 4394, 4395, 4396].includes(port)) throw new Error('Preview port must be 4393, 4394, 4395 or 4396');
const attribution = port === 4395 || port === 4396;
const db = createPreviewDatabase({ attribution });
let server;
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  if (server) await server.close();
  db.close();
};
try {
  const result = attribution ? await runAttributionScenario(db, { current: true }) : await runRoutineScenario(db);
  server = await serveStaticPreview(db, port);
  console.log(JSON.stringify({ preview: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}`, editor: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}&cliente=${CLIENT}`,
    pid: process.pid, postgresPid: db.postgresPid, database: db.directory, staticAssets: server.output, review_id: result.review.id, state: result.review.validation_state,
    e2e: 'passed', rawPrivacyChecked: result.rawPrivacyChecked, initialAggregates: result.initialAggregates,
    syntheticAggregates: result.syntheticAggregates, externalNetwork: 'blocked' }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close().then(() => process.exit(0)); });
} catch (error) { await close(); throw error; }
