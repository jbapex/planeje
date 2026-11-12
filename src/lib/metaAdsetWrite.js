/** Rascunho e validação da escrita na Meta (campanha, conjunto, anúncio). Sem chamada de rede. */

const LEVEL_NOUN = {
  campaign: 'campanha',
  adset: 'conjunto',
  ad: 'anúncio',
};

const LEVEL_ART = {
  campaign: 'A',
  adset: 'O',
  ad: 'O',
};

export function readAdsetBudget(adset) {
  const daily = Number(adset?.daily_budget);
  const life = Number(adset?.lifetime_budget);
  if (Number.isFinite(daily) && daily > 0) {
    return { kind: 'daily', cents: daily, reais: daily / 100 };
  }
  if (Number.isFinite(life) && life > 0) {
    return { kind: 'lifetime', cents: life, reais: life / 100 };
  }
  return { kind: 'daily', cents: 0, reais: null };
}

export function parseBudgetReais(input) {
  const n = Number(String(input ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 1) return null;
  const cents = Math.round(n * 100);
  if (cents < 100 || cents > 100000000) return null;
  return cents;
}

export function entityIsOn(item) {
  const status = String(item?.configured_status || item?.status || '').toUpperCase();
  return status === 'ACTIVE';
}

export const adsetIsOn = entityIsOn;

export function listAds(adset) {
  const raw = adset?.ads;
  const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return list.filter((ad) => {
    const s = String(ad?.effective_status || ad?.status || '').toUpperCase();
    return s !== 'DELETED' && s !== 'ARCHIVED';
  });
}

export function adsLook(ads) {
  const list = ads || [];
  const on = list.filter(entityIsOn);
  return { total: list.length, on: on.length, off: list.filter((ad) => !entityIsOn(ad)) };
}

export function deliveryBlockers({ campaign, adset, siblingAdsets, turningOn, level = 'adset' } = {}) {
  if (!turningOn) return [];
  const blockers = [];
  if (level === 'adset') {
    if (campaign && !entityIsOn(campaign)) {
      blockers.push({
        code: 'campaign_off',
        label: 'A campanha está desligada. O conjunto não veicula sozinho.',
      });
    }
    if (adset && adset.ads != null) {
      const look = adsLook(listAds(adset));
      if (look.total === 0) {
        blockers.push({
          code: 'no_ads',
          label: 'Este conjunto não tem anúncio. Ligar o conjunto não veicula nada.',
        });
      } else if (look.on === 0) {
        blockers.push({
          code: 'ads_off',
          label: `Nenhum anúncio ligado neste conjunto (${look.total} desligado${look.total === 1 ? '' : 's'}).`,
        });
      }
    }
  }
  if (level === 'ad') {
    if (campaign && !entityIsOn(campaign)) {
      blockers.push({
        code: 'campaign_off',
        label: 'A campanha está desligada. O anúncio não veicula sozinho.',
      });
    }
    if (adset && !entityIsOn(adset)) {
      blockers.push({
        code: 'adset_off',
        label: 'O conjunto está desligado. O anúncio não veicula sozinho.',
      });
    }
  }
  if (level === 'campaign' && Array.isArray(siblingAdsets) && siblingAdsets.length) {
    const on = siblingAdsets.filter(entityIsOn);
    if (on.length === 0) {
      blockers.push({
        code: 'adsets_off',
        label: `Nenhum conjunto ligado nesta campanha (${siblingAdsets.length} desligado${siblingAdsets.length === 1 ? '' : 's'}).`,
      });
    }
  }
  return blockers;
}

export function buildStatusDraft({ clientName, adset, entity, level = 'adset', campaign, siblingAdsets } = {}) {
  const item = entity || adset;
  const on = entityIsOn(item);
  const turningOn = !on;
  const noun = LEVEL_NOUN[level] || 'conjunto';
  const parentAdset = level === 'ad' ? adset : item;
  const blockers = deliveryBlockers({ campaign, adset: parentAdset, siblingAdsets, turningOn, level });
  const alsoAds = level === 'adset' && turningOn && item?.ads != null ? adsLook(listAds(item)).off : [];
  const alsoAdsets =
    level === 'campaign' && turningOn && blockers.some((item) => item.code === 'adsets_off')
      ? (siblingAdsets || []).filter((row) => !entityIsOn(row))
      : [];
  return {
    mode: 'status',
    level,
    clientName: clientName || '',
    objectId: String(item?.id || ''),
    adsetId: String(item?.id || ''),
    name: item?.name || noun,
    adsetName: item?.name || noun,
    fromStatus: on ? 'ACTIVE' : 'PAUSED',
    toStatus: on ? 'PAUSED' : 'ACTIVE',
    blockers,
    alsoCampaign:
      (level === 'adset' || level === 'ad') && campaign && !entityIsOn(campaign)
        ? { id: campaign.id, name: campaign.name }
        : null,
    alsoAdset: level === 'ad' && parentAdset && !entityIsOn(parentAdset) ? { id: parentAdset.id, name: parentAdset.name } : null,
    parentAdset: level === 'ad' && parentAdset?.id ? { id: parentAdset.id, name: parentAdset.name } : null,
    alsoAds,
    alsoAdsets,
  };
}

export function buildBudgetDraft({ clientName, adset } = {}) {
  const budget = readAdsetBudget(adset);
  return {
    mode: 'budget',
    level: 'adset',
    clientName: clientName || '',
    objectId: String(adset?.id || ''),
    adsetId: String(adset?.id || ''),
    adsetName: adset?.name || 'Conjunto',
    budgetKind: budget.kind,
    fromBudgetReais: budget.reais,
  };
}

export function confirmAdsetWrite(draft, budgetInput, also = {}) {
  if (!draft?.objectId && !draft?.adsetId) {
    return { valid: false, title: 'Alterar na Meta', summary: '', detail: 'Conjunto inválido.' };
  }
  const objectId = String(draft.objectId || draft.adsetId);
  const level = draft.level || 'adset';
  const noun = LEVEL_NOUN[level] || 'conjunto';

  if (draft.mode === 'status') {
    const pause = draft.toStatus === 'PAUSED';
    const writes = [{ objectId, level, status: draft.toStatus }];
    if (!pause && also.campaign && draft.alsoCampaign?.id) {
      writes.push({ objectId: String(draft.alsoCampaign.id), level: 'campaign', status: 'ACTIVE' });
    }
    if (!pause && also.adset && draft.alsoAdset?.id) {
      writes.push({ objectId: String(draft.alsoAdset.id), level: 'adset', status: 'ACTIVE' });
    }
    if (!pause && also.adsets && draft.alsoAdsets?.length) {
      for (const row of draft.alsoAdsets) {
        if (row?.id) writes.push({ objectId: String(row.id), level: 'adset', status: 'ACTIVE' });
      }
    }
    if (!pause && also.ads && draft.alsoAds?.length) {
      for (const ad of draft.alsoAds) {
        if (ad?.id) writes.push({ objectId: String(ad.id), level: 'ad', status: 'ACTIVE' });
      }
    }
    const blockers = draft.blockers || [];
    const alsoPicked = Boolean(also.campaign || also.adset || also.adsets || also.ads);
    let detail = pause
      ? level === 'campaign'
        ? 'A campanha para de veicular agora. Os conjuntos e anúncios continuam como estão, mas não saem no ar.'
        : level === 'ad'
          ? 'O anúncio para. A campanha e o conjunto continuam como estão.'
          : 'O conjunto para. A campanha e os anúncios continuam como estão.'
      : `${LEVEL_ART[level] || 'O'} ${noun} volta a veicular se a campanha, o conjunto e os anúncios estiverem ligados.`;
    if (!pause && blockers.length && !alsoPicked) {
      detail = 'Só este interruptor muda. O que estiver desligado acima ou abaixo continua barrando a veiculação.';
    }
    return {
      valid: Boolean(objectId),
      title: pause ? `Pausar ${noun} na Meta` : `Ligar ${noun} na Meta`,
      summary: `${draft.clientName} · ${draft.adsetName || draft.name}`,
      detail,
      blockers,
      alsoCampaign: draft.alsoCampaign,
      alsoAdset: draft.alsoAdset,
      parentAdset: draft.parentAdset,
      alsoAdsetsCount: draft.alsoAdsets?.length || 0,
      alsoAdsCount: draft.alsoAds?.length || 0,
      payload: {
        adsetId: objectId,
        status: draft.toStatus,
        writes,
      },
    };
  }

  const cents = parseBudgetReais(budgetInput);
  if (cents == null) {
    return {
      valid: false,
      title: 'Mudar verba na Meta',
      summary: `${draft.clientName} · ${draft.adsetName}`,
      detail: 'Informe um valor em reais, mínimo R$ 1.',
    };
  }
  const kindLabel = draft.budgetKind === 'lifetime' ? 'verba total' : 'verba diária';
  const reais = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const budgetWrite =
    draft.budgetKind === 'lifetime'
      ? { objectId, level: 'adset', lifetime_budget: cents }
      : { objectId, level: 'adset', daily_budget: cents };
  return {
    valid: true,
    title: 'Mudar verba na Meta',
    summary: `${draft.clientName} · ${draft.adsetName}`,
    detail: `Nova ${kindLabel}: ${reais}. A alteração vale na hora.`,
    payload: {
      adsetId: objectId,
      ...(draft.budgetKind === 'lifetime' ? { lifetime_budget: cents } : { daily_budget: cents }),
      writes: [budgetWrite],
    },
  };
}

/** Traduz recusa da Graph em texto do gestor. Sem chamada de rede. */
export function explainMetaWriteError(err) {
  const raw = [err?.error_user_title, err?.error_user_msg, err?.message, err?.error_user_msg]
    .filter(Boolean)
    .join(' ');
  const text = String(raw || err || '');
  if (/não discrimina|non-discriminat|special.?ad.?categor|usuários do sistema|system users/i.test(text)) {
    return {
      code: 'tos',
      title: 'A Meta bloqueou a alteração',
      detail:
        'A Meta trava alteração de anúncio (o criativo) até um admin do Business aceitar os termos de não discriminação. Pausar campanha ou conjunto em geral passa — só corta a entrega, não mexe no anúncio.',
    };
  }
  if (/(#10)|(#200)|permission|permiss[aã]o|não (tem|há) permiss/i.test(text)) {
    return {
      code: 'perm',
      title: 'Sem permissão nesta conta',
      detail: 'O System User não pode alterar este objeto. Confira o acesso da JB Apex no Business Manager.',
    };
  }
  return {
    code: 'other',
    title: 'A Meta recusou a alteração',
    detail: err?.error_user_msg || err?.message || String(err || 'Tente de novo em instantes.'),
  };
}
