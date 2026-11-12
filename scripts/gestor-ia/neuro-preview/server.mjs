import { createPreviewDatabase, CLIENT, WEEK } from './db.mjs';
import { serveStaticPreview } from './static.mjs';
import { runRoutineScenario } from './scenario.mjs';

const port = Number(process.argv[2] || 4393);
if (![4393, 4394].includes(port)) throw new Error('Preview port must be 4393 or 4394');
const db = createPreviewDatabase();
let server;
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  if (server) await server.close();
  db.close();
};
try {
  const result = await runRoutineScenario(db);
  server = await serveStaticPreview(db, port);
  console.log(JSON.stringify({ preview: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}`, editor: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}&cliente=${CLIENT}`,
    pid: process.pid, postgresPid: db.postgresPid, database: db.directory, staticAssets: server.output, review_id: result.review.id, state: result.review.validation_state,
    e2e: 'passed', rawPrivacyChecked: result.rawPrivacyChecked, externalNetwork: 'blocked' }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close().then(() => process.exit(0)); });
} catch (error) { await close(); throw error; }
