import assert from 'node:assert/strict';
import {
  aplicarNomeEquipe,
  classificarRemetenteGrupo,
  efeitoAguardoGrupo,
  normalizeWhatsappPhone,
  phonesMatch,
  rowForUser,
} from '../src/lib/atendimentoGrupoIdentidade.js';

assert.equal(normalizeWhatsappPhone('(41) 99525-2559'), '5541995252559');
assert.equal(phonesMatch('5541995252559', '41995252559'), true);
assert.equal(phonesMatch('5541995252559', '554188630941'), false);

const staff = [{ label: 'Josias — Equipe', phone: '5541995252559', profile_id: 'u1' }];
const contatos = [{ phone: '5541988887777', label: 'Loja' }];

assert.equal(
  classificarRemetenteGrupo({
    staffRows: staff,
    contatos,
    sender: { phone: '41995252559' },
  }).kind,
  'equipe',
);

assert.equal(
  classificarRemetenteGrupo({
    staffRows: staff,
    contatos,
    sender: { senderPhoneDigits: '5541988887777' },
  }).kind,
  'contato',
);

assert.equal(
  classificarRemetenteGrupo({
    staffRows: staff,
    contatos,
    sender: { phone: '5541977776666' },
  }).kind,
  'outro',
);

assert.equal(
  classificarRemetenteGrupo({
    staffRows: staff,
    contatos: [],
    sender: { phone: '5541977776666' },
  }).kind,
  'indefinido',
);

assert.deepEqual(efeitoAguardoGrupo('equipe'), { action: 'clear' });
assert.deepEqual(efeitoAguardoGrupo('contato', '2026-10-07T12:00:00Z'), {
  action: 'start',
  at: '2026-10-07T12:00:00Z',
});
assert.deepEqual(efeitoAguardoGrupo('outro'), { action: 'keep' });
assert.deepEqual(efeitoAguardoGrupo('indefinido'), { action: 'ia' });

const stamped = aplicarNomeEquipe(
  [{ isGroup: true, direction: 'in', senderPhoneDigits: '5541995252559', senderName: 'Josias' }],
  staff,
);
assert.equal(stamped[0].senderName, 'Josias');
assert.equal(stamped[0].senderSubtitle, 'Equipe');
assert.equal(aplicarNomeEquipe(stamped, staff), stamped);

assert.equal(rowForUser(staff, { id: 'u1', full_name: 'Outro Nome' })?.phone, '5541995252559');
assert.equal(rowForUser([{ label: 'Poliana — Equipe', phone: '1' }], { id: 'u2', full_name: 'Poliana Geffer' })?.phone, '1');
assert.equal(
  rowForUser([{ label: 'Jheimison — Equipe', name_match: 'jheimison', phone: '2' }], { id: 'u3', full_name: 'Jheimisson Ray De Sousa Lima' })?.phone,
  '2',
);
assert.equal(
  rowForUser([{ label: 'Raphael — Equipe', name_match: 'raphael', phone: '3' }], { id: 'u4', full_name: 'Rafael restof da Silva' }),
  null,
);

console.log('atendimentoGrupoIdentidade: ok');
