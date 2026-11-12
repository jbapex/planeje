import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const documents = ['README.md', 'PRODUCT.md', 'AGENTS.md', 'CLAUDE.md',
  'docs/architecture.md', 'docs/design.md', 'docs/onboarding.md',
  'docs/quality.md', 'docs/setup.md'];

export function verifyContext(root) {
  const issues = [];
  for (const name of documents) {
    const file = resolve(root, name);
    if (!existsSync(file)) { issues.push(`Documento ausente: ${name}`); continue; }
    const text = readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const destination = decodeURIComponent(target.split('#')[0]);
      if (!existsSync(resolve(dirname(file), destination))) {
        issues.push(`Link ausente em ${name}: ${target}`);
      }
    }
  }
  const lock = JSON.parse(readFileSync(resolve(root, '.agents/skills.lock.json'), 'utf8'));
  for (const [name, skill] of Object.entries(lock.skills)) {
    const directory = resolve(root, '.agents/skills', name);
    if (!existsSync(directory)) { issues.push(`Skill ausente: ${name}`); continue; }
    const canonical = realpathSync(directory);
    for (const [file, expected] of Object.entries(skill.files)) {
      const path = resolve(directory, file);
      if (!existsSync(path)) { issues.push(`Arquivo de skill ausente: ${name}/${file}`); continue; }
      const inside = relative(canonical, realpathSync(path));
      if (inside.startsWith('..') || isAbsolute(inside)) {
        issues.push(`Arquivo de skill fora do diretório: ${name}/${file}`); continue;
      }
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (hash !== expected) issues.push(`Skill alterada; revisar origem: ${name}/${file}`);
    }
    const body = readFileSync(resolve(directory, 'SKILL.md'), 'utf8');
    if (!new RegExp(`^name: ["']?${name}["']?\\s*$`, 'm').test(body)) {
      issues.push(`Nome da skill diverge do diretório: ${name}`);
    }
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = verifyContext(fileURLToPath(new URL('../../', import.meta.url)));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Contexto: nove documentos, links e integridade das skills conferidos.');
}
