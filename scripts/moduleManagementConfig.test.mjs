import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATENDIMENTO_LOJA_MODULE,
  MODULE_NAMES,
  buildGlobalSettingsMap,
  defaultClientStoreModuleEnabled,
  effectiveClientStoreModuleEnabled,
  effectiveModuleEnabled,
  modulesForUserRole,
} from '../src/lib/moduleManagementConfig.js';

assert.ok(MODULE_NAMES.includes('financeiro'));
assert.ok(MODULE_NAMES.includes('mini_crm'));
assert.ok(MODULE_NAMES.includes('crm'));
assert.ok(MODULE_NAMES.includes('client_area'));
assert.ok(MODULE_NAMES.includes('pgm'));
assert.equal(MODULE_NAMES.includes('atendimento_loja'), false);

const APICE = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
const OUTRA = '11111111-2222-3333-4444-555555555555';
assert.equal(ATENDIMENTO_LOJA_MODULE, 'atendimento_loja');
assert.equal(defaultClientStoreModuleEnabled('atendimento_loja', APICE), true);
assert.equal(defaultClientStoreModuleEnabled('atendimento_loja', OUTRA), false);
assert.equal(effectiveClientStoreModuleEnabled('atendimento_loja', APICE, undefined), true);
assert.equal(effectiveClientStoreModuleEnabled('atendimento_loja', OUTRA, undefined), false);
assert.equal(effectiveClientStoreModuleEnabled('atendimento_loja', APICE, false), false);
assert.equal(effectiveClientStoreModuleEnabled('atendimento_loja', OUTRA, true), true);

const globals = buildGlobalSettingsMap([]);
assert.equal(globals.financeiro, true);
assert.equal(globals.mini_crm, true);
assert.equal(globals.crm, true);
assert.equal(globals.client_area, true);
assert.equal(globals.pgm, true);

assert.equal(effectiveModuleEnabled(globals, {}, 'financeiro'), true);
assert.equal(effectiveModuleEnabled(globals, { financeiro: false }, 'financeiro'), false);
assert.equal(effectiveModuleEnabled({ mini_crm: false }, {}, 'mini_crm'), false);
assert.equal(effectiveModuleEnabled({ mini_crm: false }, { mini_crm: true }, 'mini_crm'), true);

const colaborador = modulesForUserRole('colaborador').map((mod) => mod.name);
assert.equal(colaborador.includes('financeiro'), false);
assert.equal(colaborador.includes('mini_crm'), true);

const admin = modulesForUserRole('admin').map((mod) => mod.name);
assert.equal(admin.includes('financeiro'), true);
assert.equal(admin.includes('mini_crm'), true);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const nav = source('../src/lib/teamNavAccess.js');
assert.match(nav, /to: '\/financeiro'[^}]*module: 'financeiro'/);
assert.match(nav, /to: '\/mini-crm'[^}]*module: 'mini_crm'/);
assert.match(nav, /to: '\/client-area'[^}]*module: 'client_area'/);
assert.doesNotMatch(nav, /to: '\/mini-crm'[^}]*module: 'crm'/);

const sidebar = source('../src/components/layout/Sidebar.jsx');
assert.match(sidebar, /filterTeamNav\(withPaidTrafficPath\(TEAM_NAV_ITEMS/);

const bottom = source('../src/components/layout/BottomNav.jsx');
assert.match(bottom, /TEAM_NAV_ITEMS/);
assert.match(bottom, /reloadCurrentPage/);
assert.match(bottom, /module: 'pgm'/);

const app = source('../src/App.jsx');
assert.match(
  app,
  /path="financeiro" element=\{<ProtectedRoute allowedRoles=\{\['superadmin', 'admin'\]\} requiredModule="financeiro">/
);
assert.match(
  app,
  /path="mini-crm" element=\{<ProtectedRoute allowedRoles=\{\['superadmin', 'admin', 'colaborador'\]\} requiredModule="mini_crm">/
);
assert.match(app, /path="\/client-area"[^>]*requiredModule="client_area"/);
assert.match(app, /path="pgm-panel"[^>]*requiredModule="pgm"/);
assert.equal((app.match(/path="mini-crm" element=\{<MiniCrmPage/g) || []).length, 2);

const palette = source('../src/components/layout/CommandPalette.jsx');
assert.match(palette, /to: '\/financeiro'[^}]*module: 'financeiro'/);
assert.match(palette, /to: '\/mini-crm'[^}]*module: 'mini_crm'/);

const panel = source('../src/components/atendimento/AtendimentoSidePanel.jsx');
assert.match(panel, /miniCrmOn/);
assert.match(panel, /moduleSettings\?\.mini_crm === true/);

const modulesUi = source('../src/components/pages/ModuleManagement.jsx');
assert.doesNotMatch(modulesUi, /Atendimento da loja/);
assert.doesNotMatch(modulesUi, /CLIENT_STORE_MODULES/);
assert.doesNotMatch(modulesUi, /handleStoreModuleToggle/);
assert.doesNotMatch(modulesUi, /requiredModule="atendimento_loja"/);

const teamNav = source('../src/lib/teamNavAccess.js');
assert.doesNotMatch(teamNav, /atendimento_loja/);
assert.match(teamNav, /module: 'atendimento'/);

console.log('PASS module management financeiro, mini crm e atendimento da loja');
