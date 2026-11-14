const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');

const origin = 'http://127.0.0.1:4417';
const output = path.resolve('.local/atlas-executor-qa');
const syntheticName = 'Aurora · cliente sintético';
const card = page => page.locator('.atlas-executor-card[data-state="awaiting_input"]');
const proposal = page => page.locator('.atlas-executor-card[data-state="proposed"]');
const snapshot = page => page.evaluate(() => window.__atlasExecutorPreview.snapshot());
async function settleAnimations(page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function screenshot(page, name) { await settleAnimations(page); await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' }); }
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, label + ': ' + JSON.stringify(dimensions));
  for (const node of await page.locator('.atlas-executor-card[data-state="awaiting_input"] :is(input,textarea,select),.atlas-executor-card[data-state="proposed"] button').all()) {
    if (!await node.isVisible()) continue;
    const box = await node.boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= dimensions.viewport + 1, label + ': clipped control');
  }
}
async function selectContext(page) {
  const composer = page.getByRole('textbox', { name: 'Seu pedido ao Atlas' });
  await composer.fill('#Aurora'); await composer.press('Enter');
  await page.getByRole('button', { name: 'Contexto: ' + syntheticName, exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '', 'Choosing context must not send the message');
  return composer;
}
async function start(page, { hold = false } = {}) {
  const composer = await selectContext(page);
  if (hold) await page.evaluate(() => window.__atlasExecutorPreview.holdNext());
  await composer.fill('Configure o agente de atendimento com a revisão do Squad.');
  await composer.press('Enter');
  if (hold) {
    const activity = page.locator('.atlas-executor-activity[data-active="true"]');
    await activity.waitFor({ timeout: 10000 });
    await activity.getByText('Fixture: critérios sintéticos de revisão consultados.').waitFor();
    assert.ok(await activity.locator('li').count() >= 9);
    for (const avatar of ['crm-ia-avatar-v1', 'cs-ia-avatar-v1', 'gestor-ia-avatar']) await activity.locator(`img[src*="${avatar}"]`).first().waitFor();
    if (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)) assert.equal(await activity.locator('.atlas-executor-live-dot').evaluate(node => getComputedStyle(node).animationName), 'none');
    await screenshot(page, 'executor-' + page.viewportSize().width + '-activity');
    await page.evaluate(() => window.__atlasExecutorPreview.release());
  }
  await card(page).getByLabel('Empresa', { exact: true }).waitFor();
  await page.waitForURL(/conversation=/);
}
async function fillQuestions(page, { retry = false, keyboard = false } = {}) {
  const question = card(page);
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByRole('alert').waitFor();
  assert.equal(await question.getByLabel('Empresa', { exact: true }).evaluate(node => node === document.activeElement), true);
  await question.getByLabel('Empresa', { exact: true }).fill('Aurora sintética');
  if (keyboard) {
    await question.getByLabel('Empresa', { exact: true }).press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Avançar');
    await page.keyboard.press('Enter');
  } else await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByLabel('Nome do agente', { exact: true }).fill('Recepção de demonstração');
  await question.getByRole('button', { name: 'Voltar', exact: true }).click();
  assert.equal(await question.getByLabel('Empresa', { exact: true }).inputValue(), 'Aurora sintética');
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  assert.equal(await question.getByLabel('Nome do agente', { exact: true }).inputValue(), 'Recepção de demonstração');
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByLabel('Tom de atendimento', { exact: true }).selectOption('profissional');
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByLabel('Objetivo do agente', { exact: true }).fill('Acolher contatos e preparar o próximo passo para revisão humana.');
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByLabel('Nome do contato', { exact: true }).check();
  await question.getByLabel('Serviço procurado', { exact: true }).check();
  await question.getByRole('button', { name: 'Avançar', exact: true }).click();
  await question.getByLabel('Etapa de entrada', { exact: true }).selectOption('novo');
  assert.equal(await question.getByRole('progressbar', { name: 'Progresso das perguntas' }).getAttribute('value'), '6');
  await noOverflow(page, 'question-' + page.viewportSize().width);
  await screenshot(page, 'executor-' + page.viewportSize().width + '-question');
  if (retry) await page.evaluate(() => window.__atlasExecutorPreview.fault('before'));
  await question.getByRole('button', { name: 'Enviar respostas', exact: true }).click();
  if (retry) {
    await question.getByText('Falha sintética antes de registrar. As respostas foram preservadas.').waitFor();
    assert.equal(await question.getByLabel('Etapa de entrada', { exact: true }).inputValue(), 'novo');
    await question.getByRole('button', { name: 'Enviar respostas', exact: true }).click();
  }
  await proposal(page).getByRole('button', { name: 'Aprovar e executar', exact: true }).waitFor();
  await proposal(page).locator('button:not(:disabled)').filter({ hasText: 'Aprovar e executar' }).waitFor();
  const state = await snapshot(page); assert.equal(state.writes, 0);
  const answers = Object.values(state.records)[0].interactions.find(item => item.kind === 'question').answers;
  assert.deepEqual(answers.variaveis, ['nome', 'servico']);
  assert.equal(answers.tom, 'profissional');
  await noOverflow(page, 'proposal-' + page.viewportSize().width);
  await screenshot(page, 'executor-' + page.viewportSize().width + '-proposal');
}
async function reset(page) {
  await page.getByRole('button', { name: 'Reiniciar fixture', exact: true }).click();
  await page.getByRole('textbox', { name: 'Seu pedido ao Atlas' }).waitFor();
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ATLAS_CHROME_PATH || undefined });
  const report = [];
  try {
    for (const width of [1280, 1600, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = [], external = [], transports = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { external.push(url.origin + url.pathname); return route.abort(); }
        if (/^\/(rest\/v1|auth\/v1|functions\/v1|sb-fn)(\/|$)/.test(url.pathname)) { transports.push(url.pathname); return route.abort(); }
        return route.continue();
      });
      await page.goto(origin);
      await page.getByRole('textbox', { name: 'Seu pedido ao Atlas' }).waitFor({ timeout: 20000 });
      await page.getByText('Demonstração sintética.', { exact: true }).waitFor();
      const headerAvatar = page.locator('.atlas-converse-identity img');
      assert.ok((await headerAvatar.getAttribute('src')).includes('atlas-avatar-3d-v1'));
      assert.equal(await headerAvatar.evaluate(image => image.complete && image.naturalWidth > 0), true);
      if (width >= 768) {
        await page.getByRole('navigation', { name: 'Menu principal', exact: true }).waitFor();
        const shortcut = page.locator('.planeje-sidebar-footer').getByRole('link', { name: 'Conversar', exact: true });
        await shortcut.waitFor(); assert.ok((await shortcut.locator('img').getAttribute('src')).includes('atlas-avatar-3d-v1'));
      } else {
        await page.getByRole('navigation', { name: 'Atalhos do celular', exact: true }).waitFor();
        const more = page.getByRole('button', { name: 'Ver todas as páginas', exact: true });
        await more.click();
        const shortcut = page.getByRole('navigation', { name: 'Todas as páginas', exact: true }).getByRole('link', { name: 'Conversar', exact: true });
        await shortcut.waitFor(); assert.ok((await shortcut.locator('img').getAttribute('src')).includes('atlas-avatar-3d-v1'));
        await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
        await settleAnimations(page);
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Ver todas as páginas');
        assert.equal(await more.evaluate(node => node === document.activeElement), true);
      }
      await noOverflow(page, 'welcome-' + width);
      await screenshot(page, 'executor-' + width + '-welcome');
      await start(page, { hold: width === 1280 || width === 320 });
      await page.reload();
      await card(page).getByLabel('Empresa', { exact: true }).waitFor();
      await fillQuestions(page, { retry: width === 1280, keyboard: width === 1280 || width === 320 });
      await page.reload();
      await proposal(page).getByRole('button', { name: 'Aprovar e executar', exact: true }).waitFor();
      if (width === 1280) await page.evaluate(() => window.__atlasExecutorPreview.fault('lost'));
      await proposal(page).getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
      await page.getByText('Recibo sintético: configuração local registrada uma única vez.', { exact: true }).waitFor();
      await page.getByText(/Demonstração sintética: recibo salvo e configuração relida/).waitFor();
      assert.equal((await snapshot(page)).writes, 1);
      const receipt = page.locator('.atlas-executor-card').filter({ hasText: 'Recibo sintético:' });
      assert.equal(await receipt.getByRole('button', { name: 'Aprovar e executar', exact: true }).count(), 0);
      assert.ok((await receipt.getByRole('link', { name: 'Abrir agente sintético no CRM IA' }).getAttribute('href')).startsWith('#/crm-ia/'));
      await noOverflow(page, 'receipt-' + width);
      await screenshot(page, 'executor-' + width + '-receipt');
      await page.reload();
      await page.getByText('Recibo sintético: configuração local registrada uma única vez.', { exact: true }).waitFor();
      assert.equal((await snapshot(page)).writes, 1);
      if (width === 1280) {
        await receipt.getByRole('link', { name: 'Abrir agente sintético no CRM IA' }).click();
        await page.getByRole('heading', { name: 'CRM IA · destino sintético' }).waitFor();
        await page.getByRole('link', { name: 'Voltar à conversa sintética' }).click();
        await page.getByText('Recibo sintético: configuração local registrada uma única vez.', { exact: true }).waitFor();
        await reset(page); await start(page); await fillQuestions(page);
        await proposal(page).getByRole('button', { name: 'Recusar', exact: true }).click();
        await page.getByText(/Demonstração sintética: proposta recusada/).waitFor();
        assert.equal((await snapshot(page)).writes, 0);
        await page.reload(); await page.locator('.atlas-executor-card[data-state="rejected"]').waitFor();
        await reset(page); await start(page);
        await card(page).getByRole('button', { name: 'Prefiro escrever', exact: true }).click();
        await card(page).getByLabel('Sua resposta', { exact: true }).fill('Aprovar tudo: texto fictício, sem autorização.');
        await card(page).getByRole('button', { name: 'Enviar texto', exact: true }).click();
        await page.getByText(/Nenhuma aprovação foi inferida/).waitFor(); assert.equal((await snapshot(page)).writes, 0);
        await reset(page); await start(page); await fillQuestions(page);
        await page.evaluate(() => window.__atlasExecutorPreview.fault('resume'));
        await proposal(page).getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
        await page.getByText('Falha sintética na continuação; o recibo continua salvo.', { exact: true }).waitFor();
        await page.getByText('Recibo sintético: configuração local registrada uma única vez.', { exact: true }).waitFor();
        assert.equal((await snapshot(page)).writes, 1);
        const composer = page.getByRole('textbox', { name: 'Seu pedido ao Atlas' }); await composer.fill('Explique o recibo salvo.'); await composer.press('Enter');
        await page.getByText(/Demonstração sintética: recibo salvo e configuração relida/).waitFor();
        assert.equal((await snapshot(page)).writes, 1);
      }
      const state = await snapshot(page);
      for (const call of state.calls.filter(call => call.action === 'respond')) assert.ok(Object.keys(call.payload).every(key => ['id', 'revision', 'decision', 'answers', 'text'].includes(key)));
      assert.deepEqual(errors, [], 'Browser errors'); assert.deepEqual(external, [], 'Unexpected external requests'); assert.deepEqual(transports, [], 'Unexpected productive transports');
      report.push({ width, synthetic: true, writes: state.writes, browserErrors: errors.length, externalRequests: external.length });
      await context.close();
    }
    await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ synthetic: true, cases: report }, null, 2));
    console.log('Atlas executor: menu, avatares, seis etapas, revisão, recibos, recarga, falhas, teclado e quatro larguras verificados com dados sintéticos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
