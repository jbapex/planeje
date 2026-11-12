import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const modelUrl = new URL('../../src/components/crm-ia/crmIaConversationModel.js', import.meta.url);
const model = await import(modelUrl).catch(error => error.code === 'ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(error));
test('presets usam dia civil, mostram intenção e invalidam horário vencido', () => {
  assert.equal(typeof model.conversationSchedulePresets, 'function', 'presets precisam de um cálculo compartilhado');
  const now = new Date(2026, 11, 31, 16, 0);
  const presets = model.conversationSchedulePresets(now);
  assert.deepEqual(presets.map(item => item.id), ['today15', 'tomorrow9', 'tomorrow15', 'week9']);
  assert.deepEqual(presets.map(item => item.disabled), [true, false, false, false]);
  assert.equal(new Date(presets[1].scheduled_at).getFullYear(), 2027);
  assert.equal(new Date(presets[1].scheduled_at).getMonth(), 0);
  assert.equal(new Date(presets[3].scheduled_at).getDate(), 7);
  assert.equal(new Date(presets[3].scheduled_at).getHours(), 9);
  for (const item of presets) assert.match(item.label, /\d{2}\/\d{2}\/\d{4}.*\d{2}:\d{2}/);
});
test('datas customizadas recusam vazio, inválido e passado', () => {
  assert.equal(typeof model.futureConversationSchedule, 'function');
  const now = new Date(2026, 0, 31, 14, 0);
  for (const value of ['', 'inválido', '2026-01-31T13:59', '2026-01-31T14:00']) assert.throws(() => model.futureConversationSchedule(value, now), /futur/i);
  assert.equal(model.futureConversationSchedule('2026-02-01T09:00', now), new Date(2026, 1, 1, 9).toISOString());
  assert.throws(() => model.futureConversationSchedule('2026-02-31T09:00', now), /data|futur/i);
});
test('+7 dias preserva nove horas locais durante mudança de horário de verão', () => {
  assert.equal(typeof model.conversationSchedulePresets, 'function');
  const script = `import {conversationSchedulePresets} from ${JSON.stringify(modelUrl.href)};const start=new Date(2026,2,1,9);const last=conversationSchedulePresets(start).at(-1);console.log(JSON.stringify({hour:new Date(last.scheduled_at).getHours(),hours:(new Date(last.scheduled_at)-start)/3600000}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { hour: 9, hours: 167 });
  const invalid = spawnSync(process.execPath, ['--input-type=module', '-e', `import {futureConversationSchedule} from ${JSON.stringify(modelUrl.href)};try{futureConversationSchedule('2026-03-08T02:30',new Date(2026,2,1));process.exit(1)}catch(error){if(!/data|futur/i.test(error.message))process.exit(2)}`], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.equal(invalid.status, 0, 'hora local inexistente não pode ser ajustada em silêncio');
});
test('categorias conservam os sete rótulos observados e chaves estáveis', () => {
  assert.deepEqual(model.AI_FLAG_CATEGORIES?.map(item => item.label), ['Fugiu do assunto', 'Faltou informação', 'Tom inadequado', 'Longa demais', 'Informação incorreta', 'Usou a ferramenta errada', 'Outro motivo']);
  assert.equal(new Set(model.AI_FLAG_CATEGORIES?.map(item => item.value)).size, 7);
});
