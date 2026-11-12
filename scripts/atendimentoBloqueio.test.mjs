import assert from 'node:assert/strict';
import {
  AUDIENCE_FILTER_ALL,
  AUDIENCE_FILTER_BLOCKED,
  AUDIENCE_FILTER_GROUPS,
  countConversationsByAudience,
  emptyLabelForAudienceFilter,
  matchesAudienceFilter,
} from '../src/lib/atendimentoAudienceFilter.js';
const grupo = { id: '1', is_group: true, bloqueada: false, display_name: 'RIO' };
const bloqueado = { id: '2', is_group: true, bloqueada: true, display_name: 'Site' };
const contato = { id: '3', is_group: false, bloqueada: false };

assert.equal(matchesAudienceFilter(grupo, null, AUDIENCE_FILTER_ALL), true);
assert.equal(matchesAudienceFilter(grupo, null, AUDIENCE_FILTER_GROUPS), true);
assert.equal(matchesAudienceFilter(bloqueado, null, AUDIENCE_FILTER_ALL), false);
assert.equal(matchesAudienceFilter(bloqueado, null, AUDIENCE_FILTER_GROUPS), false);
assert.equal(matchesAudienceFilter(bloqueado, null, AUDIENCE_FILTER_BLOCKED), true);
assert.equal(matchesAudienceFilter(contato, null, AUDIENCE_FILTER_BLOCKED), false);

const counts = countConversationsByAudience([grupo, bloqueado, contato], {});
assert.equal(counts[AUDIENCE_FILTER_ALL], 2);
assert.equal(counts[AUDIENCE_FILTER_GROUPS], 1);
assert.equal(counts[AUDIENCE_FILTER_BLOCKED], 1);
assert.equal(emptyLabelForAudienceFilter(AUDIENCE_FILTER_BLOCKED), 'Nenhuma conversa bloqueada.');

console.log('atendimentoBloqueio: ok');
