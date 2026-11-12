import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createReadStream, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { ROOT } from './db.mjs';
import { previewMiddleware } from './bridge.mjs';

const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' };

/** Freeze bundled assets so dependency optimization and HMR cannot interrupt the review. */
export async function serveStaticPreview(db, port) {
  if (![4393, 4394, 4395, 4396].includes(port)) throw new Error('Preview port must be 4393, 4394, 4395 or 4396');
  const output = mkdtempSync('/tmp/planeje-neuro-web-');
  const api = previewMiddleware(db);
  let server;
  try {
    await build({ configFile: `${ROOT}/scripts/gestor-ia/neuro-preview/vite.config.mjs`, logLevel: 'warn',
      build: { outDir: output, emptyOutDir: true, chunkSizeWarningLimit: 10000 } });
    server = createServer(async (req, res) => {
      if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
      try {
        if (req.url?.startsWith('/rest/v1/') || req.url?.startsWith('/auth/v1/')) return await api(req, res, () => {});
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
        let file = path.resolve(output, `.${pathname}`);
        if (!file.startsWith(`${output}${path.sep}`) && file !== output) { res.writeHead(403); res.end(); return; }
        try { if (!statSync(file).isFile()) throw new Error('Not a file'); }
        catch { file = path.extname(pathname) ? '' : path.join(output, 'index.html'); }
        if (!file) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        if (req.method === 'HEAD') res.end();
        else createReadStream(file).on('error', () => res.destroy()).pipe(res);
      } catch { if (!res.headersSent) res.writeHead(500); res.end('Local preview request failed'); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${port}`;
    const page = await fetch(`${origin}/gestor-ia/rotina`);
    assert.equal(page.status, 200, 'Preview entry point must be available');
    assert.ok((await page.text()).includes('/assets/'), 'Preview must serve the built entry point');
    for (const name of readdirSync(path.join(output, 'assets')).filter((file) => /\.(js|css)$/.test(file))) {
      const response = await fetch(`${origin}/assets/${name}`);
      assert.equal(response.status, 200, `Preview asset must be available: ${name}`);
      assert.ok(response.headers.get('content-type')?.includes(name.endsWith('.js') ? 'javascript' : 'css'), `Invalid asset MIME: ${name}`);
      assert.ok(!readFileSync(path.join(output, 'assets', name), 'utf8').includes('/@vite/client'), 'Preview assets must not depend on HMR');
    }
    const board = await fetch(`${origin}/rest/v1/rpc/traffic_weekly_board`, { method: 'POST', headers: { Authorization: 'Bearer fixture-human-only', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(board.status, 200, 'Preview API must use the existing disposable database');
    await board.arrayBuffer();
    return { output, close: async () => { await new Promise((resolve) => server.close(resolve)); rmSync(output, { recursive: true, force: true }); } };
  } catch (error) { if (server?.listening) server.close(); rmSync(output, { recursive: true, force: true }); throw error; }
}
