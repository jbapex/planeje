import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TRAFFIC_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.TRAFFIC_CHROME_PATH });
const checks = [], failures = [];
async function scenario(name, query, run) {
  if (process.env.TRAFFIC_TEST_FILTER && !name.includes(process.env.TRAFFIC_TEST_FILTER)) return;
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === '4368') return route.continue();
    external.push(url.origin); return route.abort();
  });
  try {
    const kind = query.includes('kind=review') ? '' : '&tipo=optimization';
    await page.goto(`http://127.0.0.1:4368/?${query}#/paid-traffic/rotina?cliente=client-1&semana=2026-10-19${kind}`);
    await page.getByRole('button', { name: 'Salvar', exact: true }).waitFor();
    await run(page);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    checks.push(name); console.log(`PASS ${name}`);
  } catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message.slice(0, 400)}`); }
  finally { await page.close(); }
}
try {
  await scenario('clean save releases button and confirms saved', '', async page => {
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Salvar')?.disabled, null, { timeout: 1800 });
    assert.match(await page.locator('.tw-autosave').innerText(), /Salvo/);
  });
  await scenario('invalid completion keeps editing available', '', async page => {
    await page.getByLabel('Ajustes feitos').fill('');
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('textarea').disabled, null, { timeout: 1800 });
    assert.match(await page.locator('.tw-autosave').innerText(), /análise/);
  });
  await scenario('first save retains typed text and revision', 'new=1', async page => {
    await page.getByLabel('Ajustes feitos').fill('Texto que precisa permanecer');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => window.trafficFixture.saves.length === 1);
    await page.waitForTimeout(300);
    assert.equal(await page.getByLabel('Ajustes feitos').inputValue(), 'Texto que precisa permanecer');
    await page.getByLabel('Ajustes feitos').fill('Segunda edição preservada');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => window.trafficFixture.record.revision === 2);
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Segunda edição preservada');
  });
  for (const kind of ['optimization', 'review']) await scenario(`${kind} completion clears late in mounted Hoje`, `kind=${kind}`, async page => {
    assert.equal(await page.getByLabel('Atrasadas no Hoje').textContent(), '1');
    await page.getByRole('button', { name: kind === 'review' ? 'Concluir revisão' : 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => window.trafficFixture.record.finalized_at);
    await page.waitForFunction(() => document.querySelector('[aria-label="Atrasadas no Hoje"]').textContent === '0', null, { timeout: 1800 });
    await page.waitForFunction(() => !document.querySelector('.tw-workspace'));
    assert.equal(await page.locator('.tw-cadence.is-late').count(), 0);
  });
  await scenario('concurrent edit is not silently overwritten', '', async page => {
    await page.evaluate(() => { window.trafficFixture.record.revision++; window.trafficFixture.record.analysis = 'Texto de outra pessoa'; });
    await page.getByLabel('Ajustes feitos').fill('Meu texto local');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Texto de outra pessoa');
    assert.equal(await page.getByLabel('Ajustes feitos').inputValue(), 'Meu texto local');
  });
  await scenario('editing finalized record and concluding immediately saves edits', 'finalized=1', async page => {
    await page.getByLabel('Ajustes feitos').fill('Correção depois da conclusão');
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tw-workspace'));
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Correção depois da conclusão');
  });
  await scenario('failed re-finalization refreshes the already saved reopened draft', 'finalized=1', async page => {
    await page.evaluate(() => { window.trafficFixture.finalizeFail = 'Conclusão indisponível'; });
    await page.getByLabel('Ajustes feitos').fill('Correção gravada como rascunho');
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.tw-autosave').classList.contains('is-error'));
    assert.equal(await page.evaluate(() => window.trafficFixture.record.finalized_at), null);
    await page.waitForFunction(() => document.querySelector('[aria-label="Atrasadas no Hoje"]').textContent === '1', null, { timeout: 2000 });
    assert.equal(await page.getByLabel('Ajustes feitos').inputValue(), 'Correção gravada como rascunho');
  });
  await scenario('explicit discard never saves when leaving failed draft', '', async page => {
    await page.evaluate(() => { window.trafficFixture.fail = 'Sem permissão para gravar.'; });
    await page.getByLabel('Ajustes feitos').fill('Texto descartado');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).waitFor();
    await page.evaluate(() => { window.trafficFixture.fail = ''; });
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Análise inicial');
    assert.equal(await page.locator('.tw-workspace').count(), 0);
  });
  await scenario('autosave then manual save remains responsive without duplicate writes', '', async page => {
    await page.getByLabel('Ajustes feitos').fill('Gravado automaticamente');
    await page.waitForFunction(() => window.trafficFixture.saves.length === 1);
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Salvar')?.disabled);
    assert.equal(await page.evaluate(() => window.trafficFixture.saves.length), 1);
    assert.match(await page.locator('.tw-autosave').innerText(), /Salvo/);
  });
  await scenario('failed completion retains late status and can be retried', '', async page => {
    await page.evaluate(() => { window.trafficFixture.fail = 'Falha de conexão da fixture'; });
    await page.getByLabel('Ajustes feitos').fill('Não perder após falha');
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.tw-autosave').classList.contains('is-error'));
    assert.equal(await page.getByLabel('Atrasadas no Hoje').textContent(), '1');
    assert.equal(await page.getByLabel('Ajustes feitos').inputValue(), 'Não perder após falha');
    await page.evaluate(() => { window.trafficFixture.fail = ''; });
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tw-workspace'));
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Não perder após falha');
  });
  await scenario('completion during an older Hoje read queues fresh data', '', async page => {
    await page.evaluate(() => {
      window.trafficFixture.boardDelay = 750;
      window.dispatchEvent(new CustomEvent('planeje-central-hoje-changed', { detail: { userId: 'person' } }));
    });
    await page.getByRole('button', { name: 'Concluir otimização', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Atrasadas no Hoje"]').textContent === '0', null, { timeout: 4000 });
    await page.waitForTimeout(1000);
    assert.equal(await page.getByLabel('Atrasadas no Hoje').textContent(), '0');
    assert.equal(await page.locator('.tw-workspace').count(), 0);
  });
  await scenario('closing waits for the save and does not reopen the sheet', '', async page => {
    await page.evaluate(() => { window.trafficFixture.delay = 200; });
    await page.getByLabel('Ajustes feitos').fill('Salvo antes de sair');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tw-workspace'));
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.trafficFixture.record.analysis), 'Salvo antes de sair');
    assert.equal(await page.locator('.tw-workspace').count(), 0);
  });
  await scenario('mobile keyboard save confirms and stays editable', '', async page => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Ajustes feitos').fill('Edição no celular');
    await page.getByRole('button', { name: 'Salvar', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.trafficFixture.record.analysis === 'Edição no celular');
    assert.equal(await page.getByLabel('Ajustes feitos').isEnabled(), true);
    assert.match(await page.locator('.tw-autosave').innerText(), /Salvo/);
  });
  await scenario('timeout releases save queue and preserves draft for retry', '', async page => {
    await page.evaluate(() => { window.trafficFixture.hang = true; });
    await page.getByLabel('Ajustes feitos').fill('Texto após timeout');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.tw-autosave')?.classList.contains('is-error'), null, { timeout: 23000 });
    await page.evaluate(() => { window.trafficFixture.hang = false; });
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => window.trafficFixture.record.analysis === 'Texto após timeout', null, { timeout: 2500 });
    assert.equal(await page.getByLabel('Ajustes feitos').inputValue(), 'Texto após timeout');
  });
} finally { await browser.close(); }
console.log(JSON.stringify({ checks, failures }));
assert.equal(failures.length, 0, 'All isolated traffic save scenarios must pass');
