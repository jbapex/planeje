import { attachPreviewDatabase, CLIENT, WEEK } from './db.mjs';
import { serveStaticPreview } from './static.mjs';

const db = attachPreviewDatabase(process.argv[2]);
const port = Number(process.argv[3] || 4394);
const server = await serveStaticPreview(db, port);
console.log(JSON.stringify({ preview: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}`, editor: `http://127.0.0.1:${port}/gestor-ia/rotina?semana=${WEEK}&cliente=${CLIENT}`,
  pid: process.pid, postgresPid: db.postgresPid, database: db.directory, staticAssets: server.output }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
