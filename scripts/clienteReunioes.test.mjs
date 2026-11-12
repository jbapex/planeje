import assert from 'node:assert/strict';
import {
  parseMeetCode,
  meetUrl,
  pushCaption,
  settleCaption,
  dominantSpeaker,
  captionDelta,
  wordOverlap,
  cleanFalaText,
  groupFalas,
  speakerNames,
  transcriptText,
  reuniaoStatusLabel,
} from '../src/lib/clienteReunioes.js';

assert.equal(parseMeetCode('https://meet.google.com/abc-defg-hij?authuser=0'), 'abc-defg-hij');
assert.equal(parseMeetCode('ABC-DEFG-HIJ'), 'abc-defg-hij');
assert.equal(parseMeetCode('https://meet.google.com/new'), '');
assert.equal(parseMeetCode('não é link'), '');
assert.equal(meetUrl('abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');

const t0 = 1_000_000;
let step = pushCaption(null, { speaker: 'Ana', text: 'podemos' }, t0);
assert.equal(step.closed, null);
assert.equal(step.open.text, 'podemos');

step = pushCaption(step.open, { speaker: 'Ana', text: 'podemos fechar sexta' }, t0 + 400);
assert.equal(step.closed, null);
assert.equal(step.open.text, 'podemos fechar sexta');
assert.equal(step.open.inicio, t0);

step = pushCaption(step.open, { speaker: 'Ana', text: 'podemos' }, t0 + 500);
assert.equal(step.open.text, 'podemos fechar sexta');

step = pushCaption(step.open, { speaker: 'Bruno', text: 'fechado' }, t0 + 900);
assert.equal(step.closed.speaker, 'Ana');
assert.equal(step.closed.text, 'podemos fechar sexta');
assert.equal(step.open.speaker, 'Bruno');

const voices = [
  { t: 10, name: 'Ana' },
  { t: 20, name: 'Ana' },
  { t: 30, name: 'Bruno' },
];
assert.equal(dominantSpeaker(voices, 10, 30, ''), 'Ana');
assert.equal(dominantSpeaker(voices, 10, 30, 'Ana'), 'Bruno');
assert.equal(dominantSpeaker(voices, 25, 30, ''), 'Bruno');

const held = settleCaption(step.open, t0 + 1000, 2000);
assert.equal(held.closed, null);
const settled = settleCaption(step.open, t0 + 3000, 2000);
assert.equal(settled.open, null);
assert.equal(settled.closed.text, 'fechado');

assert.equal(pushCaption(null, { speaker: 'Ana', text: '   ' }, t0).open, null);
assert.equal(reuniaoStatusLabel('transcrita'), 'Transcrita');

const text = transcriptText(
  { titulo: 'Alinhamento' },
  [{ nome: 'Ana', texto: 'oi', inicio_em: '2026-09-25T17:32:00.000Z' }],
);
assert.match(text, /^Alinhamento\n/);
assert.match(text, /Ana · oi/);

assert.equal(captionDelta('', 'Bom dia'), 'Bom dia');
assert.equal(captionDelta('Bom dia', 'Bom dia pessoal, tudo bem?'), 'pessoal, tudo bem?');
assert.equal(captionDelta('vamos fechar o orçamento hoje', 'fechar o orçamento hoje e mandar amanhã'), 'e mandar amanhã');
assert.equal(captionDelta('Bom dia pessoal', 'Bom dia pessoal'), '');
assert.equal(captionDelta('Eu quero estar com Cristo', 'quero estar com Cristo. Aconteceu um imprevisto'), 'Aconteceu um imprevisto');
assert.ok(wordOverlap('Aconteceu um imprevisto.', 'aconteceu um imprevisto aqui') >= 0.6);
assert.ok(wordOverlap('Vamos fechar o orçamento', 'O cliente pediu desconto') < 0.6);

assert.equal(cleanFalaText('Português do Brasil. context: ###'), '');
assert.equal(cleanFalaText('Português do Brasil. Dor de cabeça, mas não aqui.'), 'Dor de cabeça, mas não aqui.');
const grouped = groupFalas([
  { id: 1, nome: 'Ana', texto: 'Oi', inicio_em: '2026-09-26T04:00:00Z' },
  { id: 2, nome: 'Ana', texto: 'tudo bem?', inicio_em: '2026-09-26T04:00:05Z' },
  { id: 3, nome: 'Ana', texto: 'Português do Brasil. context:', inicio_em: '2026-09-26T04:00:06Z' },
  { id: 4, nome: 'Bruno', texto: 'Tudo', inicio_em: '2026-09-26T04:00:09Z' },
]);
assert.equal(grouped.length, 2);
assert.deepEqual(grouped[0].textos, ['Oi', 'tudo bem?']);
const grown = groupFalas([
  { id: 1, nome: 'Você', texto: 'Oi complicado', inicio_em: 'a' },
  { id: 2, nome: 'Você', texto: 'Oi Complicado mano, quero comprar.', inicio_em: 'b' },
  { id: 3, nome: 'Você', texto: 'Oi Complicado mano. Quero comprar novo.', inicio_em: 'c' },
  { id: 4, nome: 'Você', texto: 'aquele Binho', inicio_em: 'd' },
]);
assert.deepEqual(grown[0].textos, ['Oi Complicado mano. Quero comprar novo.', 'aquele Binho']);
assert.deepEqual(speakerNames([{ nome: 'Ana', texto: 'a b' }, { nome: 'Bruno', texto: 'x' }, { nome: 'Ana', texto: 'c' }]).map((s) => s.nome), ['Ana', 'Bruno']);

console.log('clienteReunioes.test.mjs ok');
