import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checks = ['verify:context', 'test:harness', 'lint', 'lint:typed', 'typecheck', 'test:rules', 'test:local', 'build:check'];
for (const name of checks) {
  console.log(`Verificando ${name}`);
  const result = spawnSync('npm', ['run', name], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
