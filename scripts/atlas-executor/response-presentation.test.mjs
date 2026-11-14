import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasResponseToHtml } from '../../src/lib/atlasResponsePresentation.js';
import { plainTextToRichHtml } from '../../src/lib/richText.js';

const origin = 'https://planeje.fixture.invalid';
const client = '00000000-0000-4000-8000-000000000011';
const href = `/crm-ia/painel?cliente=${client}`;
const links = [{ label:'Abrir CRM IA',href }];
const render = (content,allowed = links) => atlasResponseToHtml(content,allowed,{ origin });
const anchors = html => [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match => match[1].replaceAll('&amp;','&'));

test('verified app links accept relative, hash and same-origin absolute equivalents as HashRouter paths',() => {
  for (const destination of [href,'#'+href,origin+href,origin+'/#'+href]) {
    assert.deepEqual(anchors(render(`[Abrir CRM](${destination})`)),['#'+href],destination);
  }
});
test('query scope and fragments must exactly match an official allowed destination',() => {
  const official = href+'&aba=visao#resumo';
  assert.deepEqual(anchors(render(`[Painel](/crm-ia/painel?aba=visao&cliente=${client}#resumo)`,[{ href:official } ])),[`#/crm-ia/painel?aba=visao&cliente=${client}#resumo`]);
  for (const destination of [href.replace(client,'00000000-0000-4000-8000-000000000012'),href+'&aba=outra',href+'&cliente=outra','/crm-ia/painel',href+'#inventado','/cs-ia/hoje']) {
    assert.deepEqual(anchors(render(`[Destino não conferido](${destination})`)),[],destination);
  }
});
test('invented external hosts remain text and are never laundered into official application links',() => {
  for (const destination of ['https://example.com'+href,'https://evil.invalid/#'+href,'//evil.invalid'+href]) {
    const html = render(`[Link do modelo](${destination})`,[...links,{ label:'Não é origem oficial',href:destination }]);
    assert.deepEqual(anchors(html),[],destination);assert.ok(html.includes(destination.replaceAll('&','&amp;')));
  }
});
test('empty or malformed allowlists do not validate a link merely because its path looks official',() => {
  for (const allowed of [[],null,[{ href:17 }],[{ href:'javascript:alert(1)' }]]) assert.deepEqual(anchors(render(`[CRM](${href})`,allowed)),[]);
});
test('unsafe schemes, credentials and origin confusion cannot create anchors',() => {
  for (const destination of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:msgbox(1)','https://name:password@planeje.fixture.invalid'+href,'https://planeje.fixture.invalid.evil.invalid'+href,'#//evil.invalid'+href]) {
    const html = render(`[Abrir](${destination})`,[{ href:destination }]);
    assert.deepEqual(anchors(html),[],destination);assert.ok(!/<script\b|<img\b/i.test(html));
  }
});
test('house formatting is preserved while raw HTML and anchor labels stay escaped',() => {
  const markdown = '# Situação\n- **Atendimento**\n> Fonte conferida';
  assert.equal(render(markdown),plainTextToRichHtml(markdown));
  const html = render(`<script>alert(1)</script>\n[<img src=x onerror=alert(1)> **CRM**](${href})`);
  assert.deepEqual(anchors(html),['#'+href]);assert.ok(!/<script\b|<img\b|<a[^>]*\bonerror=/i.test(html));
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('<strong>CRM</strong>'));
});
test('invalid link text is preserved and user-supplied placeholder text cannot become an anchor',() => {
  const text = '\uE000atlas-link-0\uE001 [Falso](https://example.com/crm-ia/painel)';
  const html = render(text);
  assert.deepEqual(anchors(html),[]);assert.ok(html.includes('\uE000atlas-link-0\uE001'));assert.ok(html.includes('[Falso](https://example.com/crm-ia/painel)'));
});
test('default isolated origin accepts explicit internal paths without inventing an absolute host',() => {
  const html = atlasResponseToHtml(`[CRM](${href})`,links);
  assert.deepEqual(anchors(html),['#'+href]);assert.ok(!html.includes('https://'));
});
