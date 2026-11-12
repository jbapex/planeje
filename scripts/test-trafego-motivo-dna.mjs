/**
 * Motivo / DNA — testes sem banco e sem alias @/.
 */
import { buildDnaAlerts } from '../src/lib/trafegoAlertasDna.js';
import { NEXT_ACTIONS } from '../src/lib/trafegoProximaAcao.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

assert(NEXT_ACTIONS.roas_irreal?.title === 'Conferir pixel', 'ação pixel');

const alerts = buildDnaAlerts(
  [
    {
      client: {
        id: 'lali',
        empresa: 'Lali',
        objetivo_meta: 'compras',
        roas_alvo: 3,
      },
      spend: 208,
      quality: { code: 'roas_irreal', roas: 56.8 },
      totals: { spend: 208, purchases: 136, purchaseValue: 11827 },
    },
    {
      client: {
        id: 'ana',
        empresa: 'Ana Júlia',
        objetivo_meta: 'mensagens',
        meta_custo_mensagem: 40,
      },
      spend: 40,
      quality: null,
      totals: { spend: 40, messages: 8, leads: 0 },
    },
    {
      client: {
        id: 'casa',
        empresa: 'Casa Geffer',
        objetivo_meta: 'mensagens',
        meta_custo_mensagem: 25,
      },
      spend: 200,
      quality: null,
      totals: { spend: 200, messages: 2, leads: 0 },
    },
  ],
  { dismissedIds: [] }
);

assert(alerts.some((a) => a.clientId === 'lali' && a.code === 'roas_irreal'), 'Lali no DNA');
assert(!alerts.some((a) => a.clientId === 'ana'), 'Ana saudável fora do DNA');
assert(
  alerts.some((a) => a.clientId === 'casa' && (a.code === 'cpl_alto' || /meta/i.test(a.alertTitle))),
  `Casa Geffer fora da meta da ficha: ${alerts.map((a) => a.code).join(',')}`
);

const dismissed = buildDnaAlerts(
  [
    {
      client: { id: 'lali', empresa: 'Lali' },
      quality: { code: 'roas_irreal', roas: 50 },
      totals: { spend: 100, purchases: 10, purchaseValue: 5000 },
    },
  ],
  { dismissedIds: ['dna:lali:roas_irreal'] }
);
assert(dismissed.length === 0, 'dispensar remove alerta do dia');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK DNA alertas');
