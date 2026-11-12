/** Ações de upload de cliques que o Planeje cria na conta Google Ads. */
export const PLANEJE_GOOGLE_CONVERSION_ACTIONS = [
  {
    key: 'lead',
    name: 'Planeje — Conversa',
    category: 'SUBMIT_LEAD_FORM',
    countingType: 'ONE_PER_CLICK',
  },
  {
    key: 'qualified',
    name: 'Planeje — Qualificado',
    category: 'QUALIFIED_LEAD',
    countingType: 'ONE_PER_CLICK',
  },
  {
    key: 'purchase',
    name: 'Planeje — Compra',
    category: 'PURCHASE',
    countingType: 'MANY_PER_CLICK',
  },
];

export function isUploadClicksAction(action) {
  const type = String(action?.type || '').toUpperCase();
  const status = String(action?.status || '').toUpperCase();
  return type === 'UPLOAD_CLICKS' && status !== 'REMOVED';
}

export function matchPlanejeConversionAction(action, spec) {
  const name = String(action?.name || '').trim().toLowerCase();
  return name === String(spec?.name || '').trim().toLowerCase();
}

export function specsMissingFromActions(existing, specs = PLANEJE_GOOGLE_CONVERSION_ACTIONS) {
  const list = Array.isArray(existing) ? existing : [];
  return specs.filter((spec) => !list.some((action) => matchPlanejeConversionAction(action, spec)));
}

export function mapPlanejeConversionActions(existing, specs = PLANEJE_GOOGLE_CONVERSION_ACTIONS) {
  const list = Array.isArray(existing) ? existing : [];
  const mapped = {};
  for (const spec of specs) {
    const found = list.find((action) => matchPlanejeConversionAction(action, spec));
    if (found?.resourceName) mapped[spec.key] = found.resourceName;
  }
  return mapped;
}
