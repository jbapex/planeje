import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// A verification build must not replace release assets or the extension ZIPs.
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'planeje-verify-build-'));
try {
  const result = spawnSync(process.execPath,
    [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', output],
    { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(output, { recursive: true, force: true });
}
