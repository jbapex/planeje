/**
 * Fase 2: teto ≠ resultado e campos de insight da Meta.
 * Não conecta no banco.
 */
import { clientHealth } from '../src/lib/trafegoFila.js';
import { adsInsightFields, adsInsightFieldsParam, actionMetric } from '../src/lib/metaInsightFields.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const jr = clientHealth(
  { limite_meta: 1500, objetivo_meta: 'engajamento' },
  { spend: 1843, messages: 0, purchases: 0, purchaseValue: 0 }
);
assert(jr.overTeto === true, 'JR CAR acima do teto');
assert(jr.resultStatus !== 'critico', 'estouro de teto não é fora da meta');
assert(jr.label === 'Acima do teto', `JR CAR rótulo honesto, veio ${jr.label}`);

const lovato = clientHealth(
  { limite_meta: 1000, objetivo_meta: 'engajamento' },
  { spend: 746, messages: 0, purchases: 0, purchaseValue: 0 }
);
assert(lovato.overTeto === false, 'Lovato dentro do teto');
assert(lovato.resultStatus === 'sem_meta', 'Lovato sem meta de resultado');
assert(lovato.label !== 'Fora da meta', 'Lovato não é fora da meta');

const cara = clientHealth(
  { limite_meta: 2000, objetivo_meta: 'leads', meta_custo_mensagem: 20 },
  { spend: 800, messages: 10, purchases: 0, purchaseValue: 0 }
);
assert(cara.resultStatus === 'critico', 'CPL 80 > 24 é fora da meta');
assert(cara.overTeto === false, 'CPL ruim pode estar dentro do teto');
assert(cara.label === 'Fora da meta', 'rótulo de resultado');

assert(
  adsInsightFieldsParam(['spend', 'actions:omni_purchase', 'action_values:omni_purchase']) ===
    'spend,actions,action_values',
  'omni_purchase vira actions/action_values'
);
assert(adsInsightFields(['cost_per_action_type:omni_purchase']).includes('cost_per_action_type'), 'CPA vira cost_per_action_type');
assert(actionMetric([{ action_type: 'purchase', value: '3' }], ['omni_purchase', 'purchase']) === 3, 'lê purchase');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK: fase 2 teto / resultado / insights');
