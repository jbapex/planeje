/** Conexão Meta manual do Rastreamento — mesmo ciclo do TRACK, sem OAuth. */

export const META_MANUAL_CONNECTION_STATUSES = ['not_connected', 'draft', 'active', 'error'];

export function emptyMetaConnection() {
  return {
    mode: 'manual',
    status: 'not_connected',
    credentialLabel: '',
    tokenLast4: '',
    validatedAt: null,
    testedAt: null,
    testMessage: '',
    userName: '',
    businessId: '',
    businessName: '',
    adAccountIds: [],
    adAccounts: [],
    pixelId: '',
    pixelName: '',
    pageId: '',
    pageName: '',
    ownerBusinessManagerId: '',
  };
}

function asText(value) {
  return String(value ?? '').trim();
}

export function tokenLast4(token) {
  const secret = asText(token);
  if (secret.length < 4) return '';
  return secret.slice(-4);
}

export function parseMetaAdAccountIds(value) {
  return [
    ...new Set(
      asText(value)
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (/^\d+$/.test(item) ? `act_${item}` : item))
        .map((item) => item.replace(/^act_/i, 'act_'))
        .filter((item) => /^act_\d+$/i.test(item)),
    ),
  ];
}

export function normalizeAssetId(value) {
  return asText(value).replace(/\s/g, '');
}

export function parseMetaConnection(raw) {
  const base = emptyMetaConnection();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const adAccountIds = Array.isArray(raw.adAccountIds)
    ? raw.adAccountIds.map(normalizeAssetId).filter(Boolean)
    : [];
  const adAccounts = Array.isArray(raw.adAccounts)
    ? raw.adAccounts
        .map((row) => ({
          id: normalizeAssetId(row?.id),
          name: asText(row?.name) || normalizeAssetId(row?.id),
        }))
        .filter((row) => row.id)
    : [];
  const status = META_MANUAL_CONNECTION_STATUSES.includes(raw.status) ? raw.status : base.status;
  return {
    ...base,
    status,
    credentialLabel: asText(raw.credentialLabel),
    tokenLast4: asText(raw.tokenLast4),
    validatedAt: raw.validatedAt || null,
    testedAt: raw.testedAt || null,
    testMessage: asText(raw.testMessage),
    userName: asText(raw.userName),
    businessId: normalizeAssetId(raw.businessId),
    businessName: asText(raw.businessName),
    adAccountIds,
    adAccounts,
    pixelId: normalizeAssetId(raw.pixelId),
    pixelName: asText(raw.pixelName),
    pageId: normalizeAssetId(raw.pageId),
    pageName: asText(raw.pageName),
    ownerBusinessManagerId: normalizeAssetId(raw.ownerBusinessManagerId),
  };
}

export function hydrateConnectionFromCliente({
  connection,
  businessId,
  hasToken,
  channels,
} = {}) {
  const parsed = parseMetaConnection(connection);
  if (!parsed.businessId && businessId) parsed.businessId = normalizeAssetId(businessId);
  const readyChannel = (channels || []).find(
    (channel) => channel?.meta_dataset_id && channel?.meta_page_id,
  );
  if (!parsed.pixelId && readyChannel?.meta_dataset_id) {
    parsed.pixelId = normalizeAssetId(readyChannel.meta_dataset_id);
  }
  if (!parsed.pageId && readyChannel?.meta_page_id) {
    parsed.pageId = normalizeAssetId(readyChannel.meta_page_id);
  }
  if (hasToken && parsed.status === 'not_connected') parsed.status = 'draft';
  return parsed;
}

export function resolveManualMetaDraft(draft = {}) {
  const businessId = normalizeAssetId(draft.businessLookupId || draft.businessId);
  const pixelId = normalizeAssetId(draft.directPixelId || draft.pixelId);
  const pageId = normalizeAssetId(draft.directPageId || draft.pageId);
  const selected = Array.isArray(draft.selectedAccountIds)
    ? draft.selectedAccountIds.map(normalizeAssetId)
    : [];
  const adAccountIds = [...new Set([...selected, ...parseMetaAdAccountIds(draft.directAccountIds)])];
  return {
    credentialLabel: asText(draft.credentialLabel) || 'Token BM do cliente',
    businessId,
    businessName: asText(draft.businessName),
    pixelId,
    pageId,
    ownerBusinessManagerId: normalizeAssetId(draft.ownerBusinessManagerId),
    adAccountIds,
  };
}

export function canActivateManualMeta({ hasToken, businessId, pixelId, pageId, adAccountIds } = {}) {
  return Boolean(
    hasToken &&
      normalizeAssetId(businessId) &&
      normalizeAssetId(pixelId) &&
      normalizeAssetId(pageId) &&
      Array.isArray(adAccountIds) &&
      adAccountIds.length > 0,
  );
}

/** Pixel/Página da conta marcada. Sem conta, a lista da BM inteira (Impacto etc.) não entra. */
export function assetsForSelectedAccounts(items = [], selectedAccountIds = []) {
  const selected = new Set(
    (Array.isArray(selectedAccountIds) ? selectedAccountIds : [])
      .map(normalizeAssetId)
      .filter(Boolean),
  );
  if (!selected.size) return [];
  return (items || []).filter((item) => selected.has(normalizeAssetId(item?.adAccountId)));
}

export function withSavedManualAsset(options = [], id, name) {
  const savedId = normalizeAssetId(id);
  if (!savedId) return options || [];
  if ((options || []).some((item) => item.id === savedId)) return options;
  return [{ id: savedId, name: asText(name) || savedId }, ...(options || [])];
}

export function pixelSelectPlaceholder(accountCount) {
  return Number(accountCount) > 0 ? 'Escolher Pixel/Dataset da conta' : 'Marque a conta de anúncio';
}

export function pageSelectPlaceholder(accountCount) {
  return Number(accountCount) > 0 ? 'Escolher Página da conta' : 'Marque a conta de anúncio';
}

export function metaManualSetupSteps({ hasToken, businessId, accountCount, destinationReady } = {}) {
  const tokenDone = Boolean(hasToken);
  const bmDone = Boolean(normalizeAssetId(businessId));
  const accountsDone = Number(accountCount) > 0;
  const destDone = Boolean(destinationReady);
  return [
    { id: 'token', label: 'Token', done: tokenDone, active: !tokenDone },
    { id: 'bm', label: 'BM', done: bmDone, active: tokenDone && !bmDone },
    { id: 'contas', label: 'Contas', done: accountsDone, active: bmDone && !accountsDone },
    { id: 'destino', label: 'Destino', done: destDone, active: accountsDone && !destDone },
    {
      id: 'revisao',
      label: 'Revisão',
      done: false,
      active: tokenDone && bmDone && accountsDone && destDone,
    },
  ];
}

export function metaManualStatusLabel(status) {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'draft':
      return 'Token salvo — falta ativar';
    case 'error':
      return 'Falha na validação';
    default:
      return 'Não conectada';
  }
}

export function metaTokenSourcesFromClientes(rows = [], exceptClienteId = '') {
  const except = asText(exceptClienteId);
  return (rows || [])
    .map((row) => {
      const connection = parseMetaConnection(row?.meta_rastreamento || row?.connection);
      return {
        cliente_id: asText(row?.cliente_id || row?.clienteId || row?.id),
        cliente_nome: asText(row?.cliente_nome || row?.clienteNome || row?.nome || row?.empresa),
        credential_label: asText(row?.credential_label || row?.credentialLabel || connection.credentialLabel),
        token_last4: asText(row?.token_last4 || row?.tokenLast4 || connection.tokenLast4),
        business_id: asText(
          row?.business_id || row?.businessId || row?.meta_ctwa_business_id || connection.businessId,
        ),
        business_name: asText(row?.business_name || row?.businessName || connection.businessName),
        status: asText(row?.status || connection.status),
        token_updated_at: row?.token_updated_at || row?.tokenUpdatedAt || row?.meta_ctwa_token_updated_at || null,
      };
    })
    .filter((row) => row.cliente_id && row.cliente_id !== except && row.token_last4);
}

export function groupMetaTokenSources(rows = []) {
  const groups = new Map();
  for (const row of metaTokenSourcesFromClientes(rows)) {
    const key = `${row.token_last4}|${row.business_id}`;
    const client = {
      id: row.cliente_id,
      nome: row.cliente_nome || 'Cliente',
      updatedAt: row.token_updated_at,
    };
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        sourceClienteId: client.id,
        credentialLabel: row.credential_label || 'Token BM do cliente',
        tokenLast4: row.token_last4,
        businessId: row.business_id,
        businessName: row.business_name,
        status: row.status,
        clientes: [client],
        tokenUpdatedAt: client.updatedAt,
      });
      continue;
    }
    if (!existing.clientes.some((item) => item.id === client.id)) {
      existing.clientes.push(client);
    }
    if (client.updatedAt && (!existing.tokenUpdatedAt || String(client.updatedAt) > String(existing.tokenUpdatedAt))) {
      existing.sourceClienteId = client.id;
      existing.tokenUpdatedAt = client.updatedAt;
      if (row.credential_label) existing.credentialLabel = row.credential_label;
      if (row.business_name) existing.businessName = row.business_name;
    }
  }
  return [...groups.values()].sort((a, b) =>
    String(b.tokenUpdatedAt || '').localeCompare(String(a.tokenUpdatedAt || '')),
  );
}

export function formatMetaTokenSourceLabel(group) {
  if (!group) return '';
  const names = (group.clientes || []).map((item) => item.nome).filter(Boolean);
  const first = names[0] || 'conta conectada';
  const extra = names.length > 1 ? ` e mais ${names.length - 1}` : '';
  const bm = group.businessName || group.businessId;
  const parts = [group.credentialLabel || 'Token da BM'];
  if (bm) parts.push(bm);
  if (group.tokenLast4) parts.push(`final ${group.tokenLast4}`);
  parts.push(`(${first}${extra})`);
  return parts.join(' · ');
}

/** Copia só credencial + BM. Contas, Pixel e Página ficam do cliente de destino. */
export function reuseMetaCredentialPatch(sourceConnection = {}, destConnection = {}) {
  const source = parseMetaConnection(sourceConnection);
  const dest = parseMetaConnection(destConnection);
  return {
    status: 'draft',
    credentialLabel: source.credentialLabel || dest.credentialLabel || 'Token BM da agência',
    tokenLast4: source.tokenLast4,
    userName: source.userName,
    businessId: dest.businessId || source.businessId,
    businessName: dest.businessName || source.businessName,
    adAccountIds: dest.adAccountIds,
    adAccounts: dest.adAccounts,
    pixelId: dest.pixelId,
    pixelName: dest.pixelName,
    pageId: dest.pageId,
    pageName: dest.pageName,
    ownerBusinessManagerId: dest.ownerBusinessManagerId,
    testMessage: '',
  };
}
