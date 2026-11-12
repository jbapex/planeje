import assert from 'node:assert/strict';
import { grupoResponsavelLinha, slaMedeConversa } from '../src/lib/atendimentoGrupoResponsavel.js';

const names = { 'user-1': 'Raphael' };

assert.equal(slaMedeConversa({ is_group: false }), true);
assert.equal(slaMedeConversa({ is_group: true }), false);
assert.equal(slaMedeConversa(null), false);

assert.equal(grupoResponsavelLinha({ is_group: false, assigned_to: 'user-1' }, names), null);

assert.deepEqual(
  grupoResponsavelLinha({ is_group: true, status: 'em_atendimento', assigned_to: 'user-1' }, names),
  { text: 'Responsável: Raphael', missing: false },
);

assert.deepEqual(
  grupoResponsavelLinha({ is_group: true, status: 'aguardando', assigned_to: null }, names),
  { text: 'Sem responsável', missing: true },
);

assert.deepEqual(
  grupoResponsavelLinha({ is_group: true, status: 'em_atendimento', assigned_to: 'user-2' }, names),
  { text: 'Responsável atribuído', missing: false },
);

assert.equal(
  grupoResponsavelLinha({ is_group: true, status: 'resolvido', assigned_to: null }, names),
  null,
);

console.log('atendimentoGrupoResponsavel: ok');
