import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { documents, verifyContext } from './verify-context.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'planeje-context-test-'));
  for (const file of documents) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '# Fixture\n');
  }
  const body = '---\nname: example\n---\n';
  mkdirSync(join(root, '.agents/skills/example'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/example/SKILL.md'), body);
  const files = { 'SKILL.md': createHash('sha256').update(body).digest('hex') };
  writeFileSync(join(root, '.agents/skills.lock.json'), JSON.stringify({ skills: { example: { files } } }));
  return root;
}

test('context accepts complete docs and pinned skills, rejects broken links and changed source', () => {
  const root = fixture();
  try {
    assert.deepEqual(verifyContext(root), []);
    writeFileSync(join(root, 'README.md'), '[missing](docs/missing.md)\n');
    assert.match(verifyContext(root).join('\n'), /Link ausente/);
    writeFileSync(join(root, '.agents/skills/example/SKILL.md'), '---\nname: other\n---\n');
    const failures = verifyContext(root).join('\n');
    assert.match(failures, /Skill alterada/); assert.match(failures, /Nome da skill/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('context rejects a lock entry escaping the skill directory', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, '.agents/skills.lock.json'), JSON.stringify({
      skills: { example: { files: { '../../../README.md': 'wrong' } } },
    }));
    assert.match(verifyContext(root).join('\n'), /fora do diretório/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const fail of ['', 'lint:typed']) {
  test(`combined check ${fail ? 'stops on the first failure' : 'runs every selected tier'}`, { skip: process.platform === 'win32' }, () => {
    const root = mkdtempSync(join(tmpdir(), 'planeje-check-test-'));
    try {
      const fake = join(root, 'npm');
      writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$2" >> "$TOOLKIT_TEST_LOG"\nif [ "$2" = "$TOOLKIT_TEST_FAIL" ]; then exit 7; fi\n', { mode: 0o700 });
      const log = join(root, 'calls');
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url))], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}`, TOOLKIT_TEST_LOG: log, TOOLKIT_TEST_FAIL: fail },
        encoding: 'utf8',
      });
      assert.equal(result.status, fail ? 7 : 0);
      const names = readFileSync(log, 'utf8').trim().split('\n');
      assert.deepEqual(names, fail ? ['verify:context', 'test:harness', 'lint', 'lint:typed']
        : ['verify:context', 'test:harness', 'lint', 'lint:typed', 'typecheck', 'test:rules', 'test:local', 'build:check']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
