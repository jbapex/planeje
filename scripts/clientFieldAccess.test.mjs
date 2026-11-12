import assert from 'node:assert/strict';
import {
  roleCanViewField,
  rolePermissionMap,
  userCanViewClientValor,
  usersWhoCanViewValor,
  valorRoleSummary,
} from '../src/lib/clientFieldAccess.js';

const roles = rolePermissionMap([
  { role: 'admin', field_name: 'valor', can_view: false },
  { role: 'colaborador', field_name: 'valor', can_view: false },
  { role: 'admin', field_name: 'instagram', can_view: true },
]);

assert.equal(roleCanViewField(roles, 'admin'), false);
assert.equal(roleCanViewField(roles, 'colaborador'), false);
assert.equal(roleCanViewField(roles, 'superadmin'), true);
assert.equal(roleCanViewField({}, 'admin'), true);
assert.equal(roleCanViewField(roles, 'admin', 'instagram'), true);

assert.equal(userCanViewClientValor({ role: 'colaborador', roleCanView: false, override: undefined }), false);
assert.equal(userCanViewClientValor({ role: 'colaborador', roleCanView: false, override: true }), true);
assert.equal(userCanViewClientValor({ role: 'admin', roleCanView: true, override: false }), false);
assert.equal(userCanViewClientValor({ role: 'superadmin', roleCanView: false, override: false }), true);

const users = [
  { id: 's', full_name: 'Super', role: 'superadmin' },
  { id: 'a', full_name: 'Ana', role: 'admin' },
  { id: 'c', full_name: 'Caio', role: 'colaborador' },
];
const viewers = usersWhoCanViewValor(users, roles, { a: true, c: false });
assert.deepEqual(viewers.map((user) => user.id), ['s', 'a']);
assert.match(valorRoleSummary(roles), /Admin oculto/);
assert.match(valorRoleSummary(roles), /Colaborador oculto/);

console.log('clientFieldAccess.test.mjs ok');
