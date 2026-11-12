import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { build, version as esbuildVersion } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const baselineSha = '29f9a787d3255e2b858eaa0b718c1e11b8c011e7a0cd00d75b128520ee687e38';
const helperSha = '0a52ed2df0be76efa1f918cc1d8f3401586a9378aa28145211c1852cd906c451';
const legacyActionSha = '8be7ef5b2a6bbb443df4b5ba711131b273f1796cf770cdcb0555cd33b1cc6c96';
const globalName = '__planejeMetaAdEnrichment_0a52ed2d';
const input = '.local/runtime-meta-ads-api.ts', helperInput = 'supabase/functions/_shared/metaAdEnrichment.js';
const sourceInput = 'supabase/functions/meta-ads-api/index.ts';
const scriptInput = 'scripts/gestor-ia/patch-meta-runtime.mjs', testInput = 'scripts/gestor-ia/meta-runtime.test.mjs';
const output = '.local/meta-runtime-candidate.ts', receiptOutput = '.local/meta-runtime-candidate.json';
const inputs = [input, helperInput, sourceInput, scriptInput, testInput];
const outputs = [output, receiptOutput];
const sha = (text) => createHash('sha256').update(text).digest('hex');
const fail = (message) => { throw new Error(message); };

function visit(node, callback) { callback(node); ts.forEachChild(node, (child) => visit(child, callback)); }

export function getAdAction(text) {
  if (typeof text !== 'string') fail('Código inválido.');
  const tree = ts.createSourceFile('meta-runtime.ts', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (tree.parseDiagnostics.length) fail('Código com sintaxe inesperada.');
  const matches = [];
  visit(tree, (node) => {
    if (!ts.isIfStatement(node)) return;
    let target = false;
    visit(node.expression, (part) => { if (ts.isStringLiteral(part) && part.text === 'get-ad-by-id') target = true; });
    if (target) matches.push(node);
  });
  if (matches.length !== 1) fail('A action deve existir uma única vez.');
  const node = matches[0], condition = node.expression;
  if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
    || !ts.isIdentifier(condition.left) || condition.left.text !== 'action'
    || !ts.isStringLiteral(condition.right) || condition.right.text !== 'get-ad-by-id'
    || !ts.isBlock(node.thenStatement) || node.elseStatement) fail('Condição da action inesperada.');
  return { start: node.getStart(tree), end: node.end, tree, node };
}

export async function composeMetaRuntime({ runtime, helper }) {
  if (typeof runtime !== 'string' || Buffer.byteLength(runtime) !== 233287 || sha(runtime) !== baselineSha) fail('Baseline diferente da cópia aprovada.');
  if (typeof helper !== 'string' || sha(helper) !== helperSha) fail('Helper diferente da versão revisada.');
  const action = getAdAction(runtime), original = runtime.slice(action.start, action.end);
  if (sha(original) !== legacyActionSha) fail('Contrato da action inesperado.');
  const fields = [], ads = [];
  visit(action.tree, (node) => { if (ts.isIdentifier(node) && node.text === globalName) fail('Nome do helper já existe no bundle.'); });
  visit(action.node, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'fields') fields.push(node);
    if (ts.isPropertyAssignment(node) && node.name.getText(action.tree) === 'ad' && ts.isObjectLiteralExpression(node.initializer)) ads.push(node.initializer);
  });
  const oldFields = 'name,campaign{name,account_id},adset{name},creative{id,thumbnail_url,image_url,object_type,video_id}';
  if (fields.length !== 1 || !fields[0].initializer || !ts.isStringLiteral(fields[0].initializer)
    || fields[0].initializer.text !== oldFields || ads.length !== 1) fail('Campos da action inesperados.');
  const properties = ads[0].properties;
  if (properties.length !== 7 || properties.some((property) => !ts.isPropertyAssignment(property))
    || properties.map((property) => property.name.getText(action.tree)).join(',') !== 'id,name,campaign,adset,thumbnail_url,thumbnail_stored_url,thumbnail_source_url') fail('Resposta da action inesperada.');
  const compiled = await build({ stdin: { contents: helper, loader: 'js', sourcefile: 'metaAdEnrichment.js' },
    bundle: true, write: false, platform: 'neutral', format: 'iife', globalName, target: 'es2022',
    sourcemap: false, legalComments: 'none', charset: 'utf8', logLevel: 'silent' });
  if (compiled.warnings.length || compiled.outputFiles.length !== 1) fail('Compilação do helper inesperada.');
  const inline = `\n${compiled.outputFiles[0].text.trimEnd().split('\n').map((line) => `      ${line}`).join('\n')}`;
  const edits = [
    { kind: 'helper', start: action.node.thenStatement.getStart(action.tree) + 1, end: action.node.thenStatement.getStart(action.tree) + 1, text: inline },
    { kind: 'fields', start: fields[0].initializer.getStart(action.tree), end: fields[0].initializer.end,
      text: `${globalName}.META_AD_IDENTITY_FIELDS + ",creative{id,thumbnail_url,image_url,object_type,video_id}"` },
    { kind: 'identity', start: properties[0].getStart(action.tree), end: properties[3].end, text: `...${globalName}.metaAdIdentity(data)` },
  ].sort((a, b) => a.start - b.start);
  let cursor = 0, candidate = '';
  const unchanged = [];
  for (const edit of edits) {
    if (edit.start <= action.start || edit.end >= action.end || edit.start < cursor) fail('Faixa de edição inválida.');
    const preserved = runtime.slice(cursor, edit.start);
    unchanged.push(preserved); candidate += preserved + edit.text; cursor = edit.end;
  }
  unchanged.push(runtime.slice(cursor)); candidate += runtime.slice(cursor);
  getAdAction(candidate);
  return { candidate, receipt: {
    schema: 'planeje-meta-runtime-candidate/v1',
    baseline: { path: input, bytes: Buffer.byteLength(runtime), sha256: sha(runtime) },
    helper: { path: helperInput, sha256: sha(helper) },
    candidate: { path: output, bytes: Buffer.byteLength(candidate), sha256: sha(candidate) },
    toolchain: { typescript: ts.version, esbuild: esbuildVersion },
    legacyActionSha256: legacyActionSha, untouchedSha256: sha(unchanged.join('')),
    edits: edits.map((edit) => ({ kind: edit.kind, start: edit.start, end: edit.end,
      byteStart: Buffer.byteLength(runtime.slice(0, edit.start)), byteEnd: Buffer.byteLength(runtime.slice(0, edit.end)),
      removedSha256: sha(runtime.slice(edit.start, edit.end)), insertedSha256: sha(edit.text), insertedCharacters: edit.text.length })),
  } };
}

/** Só os nomes locais fixos são aceitos; arquivos existentes nunca são substituídos. */
export async function checkedLocalPath(relative) {
  if (![...inputs, ...outputs].includes(relative) || path.isAbsolute(relative) || relative.split('/').includes('..')) fail('Caminho não permitido.');
  if (await fs.realpath(root) !== root) fail('Checkout com symlink não permitido.');
  const parts = relative.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const last = i === parts.length - 1;
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT' && last && outputs.includes(relative)) return current;
      fail('Caminho local indisponível.');
    }
    if (stat.isSymbolicLink()) fail('Symlink não permitido.');
    if (last && outputs.includes(relative)) fail('Candidata ou receipt já existe; preserve a entrega anterior.');
    if (last ? !stat.isFile() : !stat.isDirectory()) fail('Tipo de arquivo inesperado.');
  }
  return current;
}

async function readText(relative) {
  const bytes = await fs.readFile(await checkedLocalPath(relative)), text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) fail('Código não é UTF-8 válido.');
  return text;
}

async function writeExclusive(relative, text) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) fail('Plataforma sem proteção de symlink.');
  const target = await checkedLocalPath(relative);
  const file = await fs.open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(text, 'utf8'); await file.sync(); }
  finally { await file.close(); }
}

export async function writeMetaRuntimeCandidate(argv = []) {
  if (!Array.isArray(argv) || argv.length) fail('Este comando não aceita opções ou caminhos.');
  const texts = await Promise.all(inputs.map(readText));
  const { candidate, receipt } = await composeMetaRuntime({ runtime: texts[0], helper: texts[1] });
  receipt.sourceIndex = { path: sourceInput, sha256: sha(texts[2]) };
  receipt.script = { path: scriptInput, sha256: sha(texts[3]) };
  receipt.tests = { path: testInput, sha256: sha(texts[4]) };
  await Promise.all(outputs.map(checkedLocalPath));
  const current = await Promise.all(inputs.map(readText));
  if (current.some((text, index) => sha(text) !== sha(texts[index]))) fail('Fonte alterada durante a composição.');
  await writeExclusive(output, candidate);
  await writeExclusive(receiptOutput, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify((await writeMetaRuntimeCandidate(process.argv.slice(2))).candidate)); }
  catch { console.error('Candidata não gerada. Confira a baseline, o helper, os caminhos e saídas locais existentes.'); process.exitCode = 1; }
}
