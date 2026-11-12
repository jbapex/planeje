import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { transform } from 'esbuild';
import { META_AD_IDENTITY_FIELDS, metaAdIdentity } from '../../supabase/functions/_shared/metaAdEnrichment.js';

const patch = await import('./patch-meta-runtime.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const runtime = await fs.readFile(new URL('./fixtures/meta-ads-api-runtime-baseline.ts.txt', import.meta.url), 'utf8');
const helper = await fs.readFile(new URL('../../supabase/functions/_shared/metaAdEnrichment.js', import.meta.url), 'utf8');
const source = await fs.readFile(new URL('../../supabase/functions/meta-ads-api/index.ts', import.meta.url), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('composição preserva cada byte fora das três inserções/substituições na action', async () => {
  assert.equal(typeof patch.composeMetaRuntime, 'function');
  const result = await patch.composeMetaRuntime({ runtime, helper });
  assert.equal(sha(runtime), '29f9a787d3255e2b858eaa0b718c1e11b8c011e7a0cd00d75b128520ee687e38');
  assert.equal(result.receipt.baseline.sha256, sha(runtime));
  assert.equal(result.receipt.candidate.sha256, sha(result.candidate));
  assert.equal(result.receipt.helper.sha256, sha(helper));
  assert.equal(result.receipt.edits.length, 3);
  const action = patch.getAdAction(runtime);
  let before = 0, after = 0;
  const unchanged = [];
  for (const edit of result.receipt.edits) {
    assert.ok(edit.start > action.start && edit.end < action.end);
    const original = runtime.slice(before, edit.start), actual = result.candidate.slice(after, after + original.length);
    assert.ok(Buffer.from(original).equals(Buffer.from(actual)), 'auth, CTWA, outras actions e imagem continuam byte a byte');
    unchanged.push(original);
    before = edit.end; after += original.length + edit.insertedCharacters;
  }
  assert.equal(result.candidate.slice(after), runtime.slice(before));
  unchanged.push(runtime.slice(before));
  assert.equal(result.receipt.untouchedSha256, sha(unchanged.join('')));
  assert.equal(await fs.readFile(new URL('./fixtures/meta-ads-api-runtime-baseline.ts.txt', import.meta.url), 'utf8'), runtime);
});

async function execute(code, graphData, body = { adId: '90001' }) {
  const action = patch.getAdAction(code), calls = [], thumbs = [];
  const js = await transform(`async function run() { const action = 'get-ad-by-id'; ${code.slice(action.start, action.end)} }`, { loader: 'ts' });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('body', 'metaToken', 'fetch', 'supabase', 'supabaseUrl', 'corsHeaders', 'persistAdThumbnail', 'largeCreativeThumbnailUrl', 'bestVideoPreviewUrl', 'META_AD_IDENTITY_FIELDS', 'metaAdIdentity', 'Deno', 'console', `${js.code}; return run();`);
  const response = await run(body, 'fixture-token', async (input) => {
    const url = new URL(input); assert.equal(url.origin, 'https://graph.facebook.com');
    calls.push(url);
    return Response.json(calls.length === 1 ? graphData : { name: 'Conta fictícia' });
  }, {}, 'https://fixture.invalid', { 'X-Fixture': 'preservado' }, async (_, options) => {
    thumbs.push(options); return 'https://fixture.invalid/thumb.jpg';
  }, async () => null, async () => null, META_AD_IDENTITY_FIELDS, metaAdIdentity, { env: { get: () => null } }, { error() {} });
  return { payload: await response.json(), status: response.status, header: response.headers.get('X-Fixture'), calls, thumbs };
}

test('bundle candidato executa o helper inline e devolve o mesmo contrato da fonte atual', async () => {
  assert.equal(typeof patch.composeMetaRuntime, 'function');
  const { candidate } = await patch.composeMetaRuntime({ runtime, helper });
  const ad = { id: '90001', name: 'Anúncio fictício', campaign: { id: '10001', name: 'Campanha fictícia', account_id: '700' }, adset: { id: '20001', name: 'Conjunto fictício' }, creative: { image_url: 'https://fixture.invalid/original.jpg' } };
  const actual = await execute(candidate, ad), expected = await execute(source, ad);
  assert.deepEqual(actual.payload, expected.payload);
  assert.equal(actual.payload.ad.account_id, '700');
  assert.equal(actual.payload.ad.campaign.id, '10001');
  assert.equal(actual.payload.ad.campaign.account_id, '700');
  assert.equal(actual.payload.ad.adset.id, '20001');
  assert.equal(actual.payload.ad.name, 'Anúncio fictício');
  assert.equal(actual.payload.ad.thumbnail_url, 'https://fixture.invalid/thumb.jpg');
  assert.deepEqual(actual.thumbs, expected.thumbs);
  assert.equal(actual.header, 'preservado');
  assert.equal(actual.calls[0].searchParams.get('fields'), expected.calls[0].searchParams.get('fields'));
  assert.ok(actual.calls[0].searchParams.get('fields').includes('campaign{id,name,account_id}'));
});

test('erros e adId ausente mantêm o contrato anterior e não persistem miniatura', async () => {
  assert.equal(typeof patch.composeMetaRuntime, 'function');
  const { candidate } = await patch.composeMetaRuntime({ runtime, helper });
  for (const [graph, body] of [[{ error: { code: 100, message: 'Erro fictício' } }, { adId: '90001' }], [{}, {}]]) {
    const original = await execute(runtime, graph, body), actual = await execute(candidate, graph, body);
    assert.deepEqual(actual.payload, original.payload);
    assert.equal(actual.status, original.status);
    assert.equal(actual.thumbs.length, 0);
    assert.equal(actual.calls.length, original.calls.length);
  }
});

test('extrator recusa action ausente, duplicada ou condição que injeta outro gatilho', () => {
  assert.equal(typeof patch.getAdAction, 'function');
  assert.throws(() => patch.getAdAction('if (action === "outro") {}'));
  assert.throws(() => patch.getAdAction(`${runtime}\nif (action === 'get-ad-by-id') {}`));
  assert.throws(() => patch.getAdAction(runtime.replace('action === "get-ad-by-id"', 'action === "get-ad-by-id" || true')));
  assert.throws(() => patch.getAdAction(runtime.replace('action === "get-ad-by-id"', 'otherAction === "get-ad-by-id"')));
  assert.throws(() => patch.getAdAction(runtime + '\nfunction broken( {'));
});

test('compositor recusa baseline alterada, helper injetado e reaplicação da candidata', async () => {
  assert.equal(typeof patch.composeMetaRuntime, 'function');
  const result = await patch.composeMetaRuntime({ runtime, helper });
  for (const altered of [runtime + '\nfetch("https://fixture.invalid");', runtime.replace('const params = new URLSearchParams({', 'fetch("https://fixture.invalid"); const params = new URLSearchParams({'), result.candidate]) {
    await assert.rejects(patch.composeMetaRuntime({ runtime: altered, helper }));
  }
  await assert.rejects(patch.composeMetaRuntime({ runtime, helper: helper + '\nfetch("https://fixture.invalid");' }));
});

test('CLI recusa configuração arbitrária e caminhos absolutos ou traversal antes de escrever', async () => {
  assert.equal(typeof patch.writeMetaRuntimeCandidate, 'function');
  for (const args of [['--input', '.local/runtime-meta-ads-api.ts'], ['--output', '/var/www/planeje'], ['../runtime.ts']]) {
    await assert.rejects(patch.writeMetaRuntimeCandidate(args));
  }
  for (const path of ['/var/www/planeje', '.local/../runtime-meta-ads-api.ts', '../.local/runtime-meta-ads-api.ts', 'supabase/functions/gestor-ia-meta/index.ts']) {
    await assert.rejects(patch.checkedLocalPath(path));
  }
});

test('guardas recusam symlink em diretório/input/output e saída já existente', async () => {
  assert.equal(typeof patch.checkedLocalPath, 'function');
  const lstat = fs.lstat;
  for (const [suffix, symlink] of [['/.local', true], ['/.local/runtime-meta-ads-api.ts', true], ['/.local/meta-runtime-candidate.ts', true], ['/.local/meta-runtime-candidate.ts', false]]) {
    fs.lstat = async (path, ...args) => String(path).endsWith(suffix) ? { isSymbolicLink: () => symlink, isFile: () => true, isDirectory: () => true } : lstat(path, ...args);
    try {
      await assert.rejects(patch.checkedLocalPath(suffix.endsWith('/.local') || suffix.endsWith('runtime-meta-ads-api.ts') ? '.local/runtime-meta-ads-api.ts' : '.local/meta-runtime-candidate.ts'));
    } finally { fs.lstat = lstat; }
  }
});

test('helper inline também preserva adId e recusa contradição com source_id', async () => {
  const { candidate } = await patch.composeMetaRuntime({ runtime, helper });
  const action = patch.getAdAction(candidate);
  const declaration = action.node.thenStatement.statements[0];
  const name = declaration.declarationList.declarations[0].name.getText(action.tree);
  const inline = new Function(`${declaration.getText(action.tree)}; return ${name};`)();
  assert.deepEqual(inline.metaAdIds({ adId: '90001' }), ['90001']);
  const details = { ad: { id: '90001', account_id: '700', campaign: { id: '10001', account_id: '700' }, adset: { id: '20001' } } };
  assert.equal(inline.mergeMetaAdEnrichment({ source_id: '90001', adId: '90002' }, details).status, 'conflict');
});
