import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canClienteSendAtendimento,
  isAtendimentoInternalSenderRole,
} from '../src/lib/atendimentoPreviewSendAuth.js';

const APICE = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
const OUTRA = '11111111-2222-3333-4444-555555555555';
const admin = { nivel: 'admin', ativo: true, cliente_id: APICE };
const supervisor = { nivel: 'supervisor', ativo: true, cliente_id: APICE };
const atendente = { nivel: 'atendente', ativo: true, cliente_id: APICE };

const base = { role: 'cliente', profileClienteId: APICE, targetClienteId: APICE };

// Usuários ativos da loja Ápice enviam texto e mídia na própria loja, qualquer nível.
assert.equal(canClienteSendAtendimento({ ...base, membro: admin }), true);
assert.equal(canClienteSendAtendimento({ ...base, membro: supervisor }), true);
assert.equal(canClienteSendAtendimento({ ...base, membro: atendente }), true);

// Sem linha de membro, inativo ou nível desconhecido: não.
assert.equal(canClienteSendAtendimento({ ...base, membro: null }), false);
assert.equal(canClienteSendAtendimento({ ...base, membro: { ...atendente, ativo: false } }), false);
assert.equal(canClienteSendAtendimento({ ...base, membro: { nivel: 'dono', ativo: true } }), false);

// Ações (reagir, encaminhar, apagar, sync) seguem só da equipe.
assert.equal(canClienteSendAtendimento({ ...base, membro: admin, isAction: true }), false);

// Outra loja não muda: mesmo com linha de membro não passa.
assert.equal(
  canClienteSendAtendimento({
    role: 'cliente',
    profileClienteId: OUTRA,
    targetClienteId: OUTRA,
    membro: { nivel: 'admin', ativo: true, cliente_id: OUTRA },
  }),
  false
);
// Não eleva cliente_id pelo body.
assert.equal(
  canClienteSendAtendimento({ ...base, targetClienteId: OUTRA, membro: admin }),
  false
);
// Membro de outra loja na linha não serve.
assert.equal(
  canClienteSendAtendimento({ ...base, membro: { ...admin, cliente_id: OUTRA } }),
  false
);
// Papel não cliente não usa este caminho.
assert.equal(canClienteSendAtendimento({ ...base, role: 'colaborador', membro: admin }), false);
assert.equal(canClienteSendAtendimento({ ...base, role: 'superadmin', membro: admin }), false);
assert.equal(canClienteSendAtendimento({}), false);

assert.equal(
  canClienteSendAtendimento({
    role: 'cliente',
    profileClienteId: OUTRA,
    targetClienteId: OUTRA,
    membro: { nivel: 'admin', ativo: true, cliente_id: OUTRA },
    allowedPages: ['atendimento'],
  }),
  true
);
assert.equal(
  canClienteSendAtendimento({
    role: 'cliente',
    profileClienteId: OUTRA,
    targetClienteId: OUTRA,
    membro: null,
    allowedPages: ['atendimento'],
    implicitAdmin: true,
  }),
  true
);
assert.equal(
  canClienteSendAtendimento({
    role: 'cliente',
    profileClienteId: OUTRA,
    targetClienteId: OUTRA,
    membro: { nivel: 'admin', ativo: true, cliente_id: OUTRA },
  }),
  false
);

assert.equal(isAtendimentoInternalSenderRole('superadmin'), true);
assert.equal(isAtendimentoInternalSenderRole('admin'), true);
assert.equal(isAtendimentoInternalSenderRole('colaborador'), true);
assert.equal(isAtendimentoInternalSenderRole('cliente'), false);

// Espelho do servidor com a mesma loja e o mesmo recorte.
const shared = readFileSync(
  new URL('../supabase/functions/_shared/atendimentoLojaAcesso.ts', import.meta.url),
  'utf8'
);
assert.match(shared, /hasAtendimentoPagePermission/);
assert.match(shared, /ATENDIMENTO_PAGE_KEY/);
assert.match(shared, /implicitAdmin/);
assert.match(shared, /if \(args\.isAction\) return false;/);
const edge = readFileSync(
  new URL('../supabase/functions/uazapi-send-message/index.ts', import.meta.url),
  'utf8'
);
assert.match(edge, /canClienteSendAtendimento/);
assert.match(edge, /hasAtendimentoPagePermission/);
assert.match(edge, /allowed_pages/);
assert.match(edge, /fetchAtendimentoLojaHabilitada/);
assert.match(edge, /cliente_atend_pode_ver_contato_de/);
assert.doesNotMatch(edge, /canClienteSendAtendimentoText/);
const sql = readFileSync(
  new URL('../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url),
  'utf8'
);
assert.match(sql, /'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid/);
const sqlPagina = readFileSync(
  new URL('../supabase/migrations/20261006210000_atendimento_pagina_permitida.sql', import.meta.url),
  'utf8'
);
assert.match(sqlPagina, /allowed_pages/);
assert.match(sqlPagina, /atendimento/);
assert.match(sqlPagina, /'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'/);
assert.match(sqlPagina, /user_has_page_access/);

console.log('PASS atendimento preview send auth');
