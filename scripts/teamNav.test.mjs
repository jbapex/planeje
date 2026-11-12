import assert from 'node:assert/strict';
import { TEAM_NAV_SPEC, cacheBustHref, filterTeamNav } from '../src/lib/teamNavAccess.js';
import * as navigation from '../src/lib/teamNavAccess.js';

const allOn = Object.fromEntries(TEAM_NAV_SPEC.filter((item) => item.module).map((item) => [item.module, true]));

const admin = filterTeamNav(TEAM_NAV_SPEC, 'admin', allOn).map((item) => item.to);
assert.ok(admin.includes('/financeiro'));
assert.ok(admin.includes('/mini-crm'));
assert.ok(admin.includes('/crm'));
assert.ok(admin.includes('/cobertura'));
assert.ok(admin.includes('/client-area'));
assert.ok(admin.includes('/automacoes'));

const colaborador = filterTeamNav(TEAM_NAV_SPEC, 'colaborador', allOn).map((item) => item.to);
assert.equal(colaborador.includes('/financeiro'), false);
assert.equal(colaborador.includes('/automacoes'), false);
assert.equal(colaborador.includes('/requests'), false);
assert.ok(colaborador.includes('/mini-crm'));
assert.ok(colaborador.includes('/caixa'));

const miniOff = filterTeamNav(TEAM_NAV_SPEC, 'admin', { ...allOn, mini_crm: false }).map((item) => item.to);
assert.equal(miniOff.includes('/mini-crm'), false);
assert.ok(miniOff.includes('/crm'));

const tasksOff = filterTeamNav(TEAM_NAV_SPEC, 'admin', { ...allOn, tasks: false }).map((item) => item.to);
assert.equal(tasksOff.includes('/tasks'), false);
assert.equal(tasksOff.includes('/cobertura'), false);

const dashboardOff = filterTeamNav(TEAM_NAV_SPEC, 'admin', { ...allOn, dashboard: false }).map((item) => item.to);
assert.ok(dashboardOff.includes('/dashboard'));

const areaOff = filterTeamNav(TEAM_NAV_SPEC, 'admin', { ...allOn, client_area: false }).map((item) => item.to);
assert.equal(areaOff.includes('/client-area'), false);
assert.ok(areaOff.includes('/clients'));

const busted = cacheBustHref('https://planeje.jbapex.com.br/#/clients', 'e74e03f4');
assert.equal(busted, 'https://planeje.jbapex.com.br/?v=e74e03f4#/clients');

const replaced = cacheBustHref('https://planeje.jbapex.com.br/?v=antigo#/financeiro?aba=resumo', 'novo');
assert.equal(replaced, 'https://planeje.jbapex.com.br/?v=novo#/financeiro?aba=resumo');

const { groupTeamNav, isTeamNavItemActive, TEAM_NAV_SHORTCUT_IDS, TEAM_NAV_MOBILE_SHORTCUT_IDS } = navigation;
assert.equal(typeof groupTeamNav, 'function', 'O menu precisa organizar os destinos autorizados em categorias.');

const allowed = filterTeamNav(TEAM_NAV_SPEC, 'admin', allOn);
const desktop = groupTeamNav(allowed, TEAM_NAV_SHORTCUT_IDS);
assert.deepEqual(desktop.shortcuts.map(item => item.id), ['dashboard', 'caixa', 'conversas']);
assert.deepEqual(desktop.groups.map(group => group.label), ['Operação', 'Clientes e vendas', 'Marketing', 'IA e automações', 'Gestão']);
assert.deepEqual(desktop.groups[0].items.map(item => item.id), ['tasks', 'projects', 'cobertura', 'requests']);
const destinations = sections => [...sections.shortcuts, ...sections.groups.flatMap(group => group.items)];
assert.deepEqual(destinations(desktop).map(item => item.id).sort(), [
  'assistant', 'automacoes', 'caixa', 'client_area', 'clients', 'conversas', 'cobertura',
  'crm', 'dashboard', 'financeiro', 'mini_crm', 'onboarding', 'projects', 'rastreamento',
  'reports', 'requests', 'social', 'tasks', 'traffic',
].sort(), 'Cada página deve aparecer uma vez, sem perder destinos.');

const mobile = groupTeamNav(allowed, TEAM_NAV_MOBILE_SHORTCUT_IDS);
assert.deepEqual(mobile.shortcuts.map(item => item.id), ['dashboard', 'caixa', 'conversas', 'tasks']);
assert.equal(mobile.groups[0].items.some(item => item.id === 'tasks'), false, 'O atalho móvel não se repete em Mais.');
assert.equal(new Set(destinations(mobile).map(item => item.id)).size, 19);
assert.equal(destinations(mobile).length, 19);

const noTasks = groupTeamNav(filterTeamNav(TEAM_NAV_SPEC, 'admin', { ...allOn, tasks: false }), TEAM_NAV_MOBILE_SHORTCUT_IDS);
assert.deepEqual(noTasks.shortcuts.map(item => item.id), ['dashboard', 'caixa', 'conversas'], 'Desativar Tarefas não promove Clientes para os atalhos.');
const collaboratorSections = groupTeamNav(filterTeamNav(TEAM_NAV_SPEC, 'colaborador', allOn));
assert.equal(destinations(collaboratorSections).some(item => ['financeiro', 'automacoes', 'requests'].includes(item.id)), false);
const allOff = Object.fromEntries(Object.keys(allOn).map(module => [module, false]));
const minimal = groupTeamNav(filterTeamNav(TEAM_NAV_SPEC, 'admin', allOff));
assert.deepEqual(minimal.shortcuts.map(item => item.id), ['dashboard', 'caixa']);
assert.deepEqual(minimal.groups, [], 'Categorias sem páginas autorizadas desaparecem.');
assert.deepEqual(groupTeamNav(filterTeamNav(TEAM_NAV_SPEC, null, allOn)), { shortcuts: [], groups: [] });

const customTraffic = Object.freeze({ ...allowed.find(item => item.id === 'traffic'), to: '/paid-traffic/hoje' });
const customItems = Object.freeze(allowed.map(item => item.id === 'traffic' ? customTraffic : item));
const customGroup = groupTeamNav(customItems).groups.find(group => group.id === 'marketing');
assert.equal(customGroup.items.find(item => item.id === 'traffic'), customTraffic, 'A rota por perfil conserva o objeto e seu destino.');

for (const [id, pathname, expected] of [
  ['clients', '/clients/cliente-exemplo', true],
  ['clients', '/clients-extra', false],
  ['crm', '/crm-ia/painel', false],
  ['crm', '/crm/funil', true],
  ['conversas', '/conversas/aguardando', true],
  ['conversas', '/conversas/resolvidos', true],
  ['conversas', '/conversas/canais', true],
  ['conversas', '/conversas-falso', false],
  ['traffic', '/paid-traffic/rotina', true],
  ['traffic', '/paid-traffic-falso', false],
  ['tasks', '/tasks/123', true],
]) {
  assert.equal(isTeamNavItemActive(allowed.find(item => item.id === id), pathname), expected, `${id}: ${pathname}`);
}
assert.equal(isTeamNavItemActive(customTraffic, '/paid-traffic/dashboard'), true);

console.log('PASS team nav: permissões, categorias, atalhos e rotas ativas');
