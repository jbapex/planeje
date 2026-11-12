/**
 * Hierarquia campanha → conjunto → anúncio na escrita da Meta.
 * Sem rede.
 */
import {
  buildStatusDraft,
  confirmAdsetWrite,
  deliveryBlockers,
  entityIsOn,
  explainMetaWriteError,
} from '../src/lib/metaAdsetWrite.js';
import { adsetMatchesAction } from '../src/lib/trafegoProximaAcao.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const campaignOn = { id: '1', name: 'Campanha A', status: 'ACTIVE', configured_status: 'ACTIVE' };
const campaignOff = { id: '1', name: 'Campanha A', status: 'PAUSED', configured_status: 'PAUSED' };
const adsOff = [
  { id: 'a1', name: 'Criativo 1', status: 'PAUSED', configured_status: 'PAUSED' },
  { id: 'a2', name: 'Criativo 2', status: 'PAUSED', configured_status: 'PAUSED' },
];
const adsetOff = {
  id: '10',
  name: 'Conjunto X',
  status: 'PAUSED',
  configured_status: 'PAUSED',
  ads: adsOff,
};
const adsetOffNoAdsField = { id: '11', name: 'Conjunto Y', status: 'PAUSED', configured_status: 'PAUSED' };
const adsetEmptyAds = { id: '12', name: 'Conjunto Z', status: 'PAUSED', configured_status: 'PAUSED', ads: [] };

assert(entityIsOn(campaignOn), 'campanha ACTIVE está ligada');
assert(!entityIsOn(campaignOff), 'campanha PAUSED está desligada');

const blockCamp = deliveryBlockers({ campaign: campaignOff, adset: adsetOff, turningOn: true, level: 'adset' });
assert(blockCamp.some((b) => b.code === 'campaign_off'), 'ligar conjunto com campanha off avisa');
assert(blockCamp.some((b) => b.code === 'ads_off'), 'ligar conjunto com anúncios off avisa');

const blockEmpty = deliveryBlockers({ campaign: campaignOn, adset: adsetEmptyAds, turningOn: true, level: 'adset' });
assert(blockEmpty.some((b) => b.code === 'no_ads'), 'conjunto sem anúncio avisa');

const blockUnknown = deliveryBlockers({
  campaign: campaignOn,
  adset: adsetOffNoAdsField,
  turningOn: true,
  level: 'adset',
});
assert(!blockUnknown.some((b) => b.code === 'ads_off' || b.code === 'no_ads'), 'sem campo ads não inventa aviso');

const blockAdsets = deliveryBlockers({
  siblingAdsets: [adsetOff, adsetEmptyAds],
  turningOn: true,
  level: 'campaign',
});
assert(blockAdsets.some((b) => b.code === 'adsets_off'), 'ligar campanha sem conjunto no ar avisa');

const draftAdset = buildStatusDraft({
  clientName: 'JR CAR',
  entity: adsetOff,
  level: 'adset',
  campaign: campaignOff,
});
assert(draftAdset.alsoCampaign?.id === '1', 'oferece ligar a campanha');
assert(draftAdset.alsoAds.length === 2, 'oferece ligar os 2 anúncios');

const onlyAdset = confirmAdsetWrite(draftAdset, null, { campaign: false, ads: false });
assert(onlyAdset.payload.writes.length === 1, 'sem checkbox só muda o conjunto');
assert(/barrando/.test(onlyAdset.detail), 'avisa que o resto continua barrando');

const withStack = confirmAdsetWrite(draftAdset, null, { campaign: true, ads: true });
assert(withStack.payload.writes.length === 4, 'conjunto + campanha + 2 anúncios');
assert(withStack.payload.writes.some((w) => w.level === 'campaign'), 'inclui campanha');
assert(withStack.payload.writes.filter((w) => w.level === 'ad').length === 2, 'inclui os 2 anúncios');

const draftCamp = buildStatusDraft({
  clientName: 'JR CAR',
  entity: campaignOff,
  level: 'campaign',
  siblingAdsets: [adsetOff],
});
assert(draftCamp.alsoAdsets.length === 1, 'oferece ligar o conjunto da campanha');
const campOnly = confirmAdsetWrite(draftCamp, null, { adsets: false });
assert(campOnly.payload.writes.length === 1 && campOnly.payload.writes[0].level === 'campaign', 'só a campanha');
const campPlus = confirmAdsetWrite(draftCamp, null, { adsets: true });
assert(campPlus.payload.writes.some((w) => w.level === 'adset'), 'campanha + conjunto');

const pauseCamp = confirmAdsetWrite(
  buildStatusDraft({ clientName: 'JR CAR', entity: campaignOn, level: 'campaign', siblingAdsets: [adsetOff] }),
  null,
  {}
);
assert(/conjuntos e anúncios continuam/.test(pauseCamp.detail), 'pausar campanha explica a hierarquia');
const turnOnCopy = confirmAdsetWrite(draftAdset, null, { campaign: true, ads: true });
assert(/^O conjunto volta/.test(turnOnCopy.detail), 'artigo masculino no conjunto');

const adOff = { id: 'a9', name: 'Criativo 9', status: 'PAUSED', configured_status: 'PAUSED' };
const draftAd = buildStatusDraft({
  clientName: 'JR CAR',
  entity: adOff,
  adset: adsetOff,
  level: 'ad',
  campaign: campaignOff,
});
assert(draftAd.blockers.some((b) => b.code === 'adset_off'), 'ligar anúncio com conjunto off avisa');
assert(draftAd.blockers.some((b) => b.code === 'campaign_off'), 'ligar anúncio com campanha off avisa');
assert(draftAd.alsoAdset?.id === '10', 'oferece ligar o conjunto do anúncio');
const adStack = confirmAdsetWrite(draftAd, null, { campaign: true, adset: true });
assert(adStack.payload.writes.some((w) => w.level === 'ad'), 'inclui o anúncio');
assert(adStack.payload.writes.some((w) => w.level === 'adset'), 'inclui o conjunto');
assert(adStack.payload.writes.some((w) => w.level === 'campaign'), 'inclui a campanha');

assert(adsetMatchesAction('zero_leads', { spend: 120, leads: 0 }), 'gasto sem lead marca o conjunto');
assert(!adsetMatchesAction('zero_leads', { spend: 10, leads: 0 }), 'gasto baixo não marca');
assert(adsetMatchesAction('roas_irreal', { spend: 100, purchases: 2, purchaseValue: 3000 }), 'ROAS irreal marca');
assert(
  adsetMatchesAction('engajamento_sem_resultado', { spend: 90, leads: 0, messages: 0, purchases: 0 }, 'engajamento'),
  'engajamento sem conversão marca'
);

const tos = explainMetaWriteError({
  error_user_msg:
    'Para continuar veiculando anúncios, um administrador da empresa precisa analisar e aceitar nossos termos de não discriminação. Acesse Usuários do sistema.',
});
assert(tos.code === 'tos', 'termos da Meta viram recusa clara');
assert(/conjunto/.test(tos.detail), 'explica que conjunto costuma passar');
assert(!/facebook\.com/.test(tos.detail), 'não despeja URL da Meta');

const adOnParentOn = buildStatusDraft({
  clientName: '3 Irmãos',
  entity: { id: 'a3', name: 'Cesta', status: 'ACTIVE', configured_status: 'ACTIVE' },
  adset: { id: '20', name: 'CJ01', status: 'ACTIVE', configured_status: 'ACTIVE' },
  level: 'ad',
  campaign: campaignOn,
});
assert(adOnParentOn.parentAdset?.id === '20', 'guarda o conjunto para pausar se o anúncio bloquear');

if (failed) {
  console.error(`${failed} falha(s)`);
  process.exit(1);
}
console.log('ok hierarquia campanha / conjunto / anúncio');
