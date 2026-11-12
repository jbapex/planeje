import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import { hasMetaLink } from '@/lib/funilMetaLink';
import { hasGoogleLink } from '@/lib/funilGoogleLink';

/** @typedef {'campaign'|'channel'|'adset'|'creative'|'tracking'|'downstream'|'other'} FunilNodeRole */

const CAMPAIGN_TYPES = new Set(['meta', 'google']);
const ADSET_TYPES = new Set(['meta-adset']);
const CHANNEL_TYPES = new Set(['facebook', 'instagram', 'youtube', 'tiktok']);
const CREATIVE_TYPES = new Set(['video-ad', 'image-ad', 'story-ad', 'copy-text']);
const TRACKING_TYPES = new Set([
  'pixel-meta',
  'gtm',
  'ga4',
  'evento',
  'audiencia',
  'lookalike',
]);
const DOWNSTREAM_TYPES = new Set([
  'landing-page',
  'checkout',
  'upsell',
  'thank-you-page',
  'webinar',
  'whatsapp',
  'email',
  'sms',
  'crm',
  'redirect',
  'purchase',
  'boleto',
  'decision',
  'ia-bot',
  'sdr',
  'vendedor',
  'phone',
  'jornada-a',
  'jornada-b',
  'jornada-c',
  'jornada-express',
  'gatilho',
  'wait',
  'tag-seg',
]);

const PLACEMENT_BY_TYPE = {
  facebook: 'facebook',
  instagram: 'instagram',
  youtube: 'youtube',
  tiktok: 'tiktok',
};

export function getFunilNodeRole(type) {
  if (!type) return 'other';
  if (CAMPAIGN_TYPES.has(type)) return 'campaign';
  if (ADSET_TYPES.has(type)) return 'adset';
  if (CHANNEL_TYPES.has(type)) return 'channel';
  if (CREATIVE_TYPES.has(type)) return 'creative';
  if (TRACKING_TYPES.has(type)) return 'tracking';
  if (DOWNSTREAM_TYPES.has(type)) return 'downstream';
  if (NODE_CONFIG[type]?.category === 'Tráfego') return 'channel';
  if (NODE_CONFIG[type]?.category === 'Criativos') return 'creative';
  if (NODE_CONFIG[type]?.category === 'Páginas' || NODE_CONFIG[type]?.category === 'Ações') {
    return 'downstream';
  }
  return 'other';
}

export function getParentNode(nodeId, nodes, edges) {
  if (!nodeId || !edges?.length) return null;
  const incoming = edges.filter((e) => e.target === nodeId);
  if (incoming.length === 0) return null;
  const parentId = incoming[0].source;
  return (nodes || []).find((n) => n.id === parentId) || null;
}

export function getParentEdge(nodeId, edges) {
  if (!nodeId) return null;
  return edges?.find((e) => e.target === nodeId) || null;
}

function mergeMetaLink(parentLink, nodeData) {
  if (!parentLink) return nodeData?.metaLink || null;
  const override = nodeData?.linkOverride || {};
  const local = nodeData?.metaLink || {};
  return {
    ...parentLink,
    ...local,
    adId: override.adId ?? local.adId ?? parentLink.adId ?? null,
    adName: override.adName ?? local.adName ?? parentLink.adName ?? null,
    adSetId: override.adSetId ?? local.adSetId ?? parentLink.adSetId ?? null,
    adSetName: override.adSetName ?? local.adSetName ?? parentLink.adSetName ?? null,
    adSetStatus: override.adSetStatus ?? local.adSetStatus ?? parentLink.adSetStatus ?? null,
    campaignStatus: local.campaignStatus ?? parentLink.campaignStatus ?? null,
    adStatus: override.adStatus ?? local.adStatus ?? parentLink.adStatus ?? null,
    placement: override.placement ?? local.placement ?? parentLink.placement ?? null,
  };
}

function mergeGoogleLink(parentLink, nodeData) {
  if (!parentLink) return nodeData?.googleLink || null;
  const override = nodeData?.linkOverride || {};
  const local = nodeData?.googleLink || {};
  return {
    ...parentLink,
    ...local,
    adGroupId: override.adGroupId ?? local.adGroupId ?? parentLink.adGroupId ?? null,
    adGroupName: override.adGroupName ?? local.adGroupName ?? parentLink.adGroupName ?? null,
    keywordPreview: override.keywordPreview ?? local.keywordPreview ?? parentLink.keywordPreview ?? null,
  };
}

const MAX_INHERIT_DEPTH = 25;

export function getInheritedMetaLink(node, nodes, edges, depth = 0) {
  if (!node || depth > MAX_INHERIT_DEPTH) return null;
  if (hasMetaLink(node.data?.metaLink) && !node.data?.linkSource?.parentNodeId) {
    return node.data.metaLink;
  }
  const parent = getParentNode(node.id, nodes, edges);
  if (!parent) return node.data?.metaLink || null;
  // Criativo/pixel só têm linkSource — conta/campanha vêm do avô (Meta/canal)
  const parentInherited = getInheritedMetaLink(parent, nodes, edges, depth + 1);
  if (!parentInherited) return node.data?.metaLink || null;
  return mergeMetaLink(parentInherited, node.data);
}

export function getInheritedGoogleLink(node, nodes, edges, depth = 0) {
  if (!node || depth > MAX_INHERIT_DEPTH) return null;
  if (hasGoogleLink(node.data?.googleLink) && !node.data?.linkSource?.parentNodeId) {
    return node.data.googleLink;
  }
  const parent = getParentNode(node.id, nodes, edges);
  if (!parent) return node.data?.googleLink || null;
  const parentInherited = getInheritedGoogleLink(parent, nodes, edges, depth + 1);
  if (!parentInherited) return node.data?.googleLink || null;
  return mergeGoogleLink(parentInherited, node.data);
}

export function resolveEffectiveLink(node, nodes, edges) {
  const role = getFunilNodeRole(node?.data?.type);
  const metaLink = getInheritedMetaLink(node, nodes, edges);
  const googleLink = getInheritedGoogleLink(node, nodes, edges);
  const parent = getParentNode(node?.id, nodes, edges);
  return {
    role,
    metaLink: metaLink && hasMetaLink(metaLink) ? metaLink : null,
    googleLink: googleLink && hasGoogleLink(googleLink) ? googleLink : null,
    parentNodeId: node?.data?.linkSource?.parentNodeId || parent?.id || null,
    parentLabel: parent?.data?.label || null,
    inherits: !!node?.data?.linkSource?.parentNodeId || !!parent,
  };
}

export function canConnect(sourceNode, targetNode) {
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: 'Nós inválidos.' };
  }
  if (sourceNode.id === targetNode.id) {
    return { ok: false, reason: 'Não é possível conectar um nó a si mesmo.' };
  }

  const sourceRole = getFunilNodeRole(sourceNode.data?.type);
  const targetRole = getFunilNodeRole(targetNode.data?.type);
  const sourceType = sourceNode.data?.type;
  const targetType = targetNode.data?.type;

  if (targetRole === 'campaign') {
    return { ok: false, reason: 'Campanhas não recebem conexão de entrada — conecte da campanha para os filhos.' };
  }

  if (sourceRole === 'downstream' && targetRole !== 'downstream') {
    const parent = sourceNode;
    const pMeta = parent.data?.metaLink;
    const pGoogle = parent.data?.googleLink;
    if (!pMeta && !pGoogle) {
      return {
        ok: false,
        reason: 'O nó de origem precisa ter Meta ou Google configurado (ou ser filho de campanha).',
      };
    }
  }

  if (sourceRole === 'campaign' || sourceRole === 'channel' || sourceRole === 'creative' || sourceRole === 'adset') {
    if (
      targetRole === 'channel' ||
      targetRole === 'adset' ||
      targetRole === 'creative' ||
      targetRole === 'tracking' ||
      targetRole === 'downstream'
    ) {
      if (sourceType === 'google' && (targetType === 'facebook' || targetType === 'instagram')) {
        return { ok: false, reason: 'Facebook/Instagram herdam de campanhas Meta, não Google.' };
      }
      if (sourceType === 'meta' && targetType === 'google') {
        return { ok: false, reason: 'Google Ads não herda de campanha Meta.' };
      }
      if (
        (sourceType === 'meta' || sourceType === 'facebook' || sourceType === 'instagram') &&
        targetType === 'google'
      ) {
        return { ok: false, reason: 'Conecte Google Ads apenas a filhos Google ou páginas.' };
      }
      if (sourceRole === 'creative' && targetRole === 'adset') {
        return {
          ok: false,
          reason: 'Conjunto Meta fica entre a campanha e o criativo, não depois do criativo.',
        };
      }
      return { ok: true };
    }
  }

  if (sourceRole === 'adset') {
    if (
      targetRole === 'creative' ||
      targetRole === 'tracking' ||
      targetRole === 'downstream' ||
      targetRole === 'channel'
    ) {
      return { ok: true };
    }
  }

  if (sourceRole === 'tracking') {
    if (targetRole === 'downstream' || targetRole === 'tracking') {
      return { ok: true };
    }
  }

  if (sourceRole === 'downstream' && targetRole === 'downstream') {
    return { ok: true };
  }

  if (sourceRole === 'other' || targetRole === 'other') {
    return { ok: true };
  }

  const sourceLabel = sourceNode.data?.label || sourceType || 'origem';
  const targetLabel = targetNode.data?.label || targetType || 'destino';

  if (sourceRole === 'downstream' && targetRole === 'tracking') {
    return {
      ok: false,
      reason: `Inverta a conexão: de "${sourceLabel}" para "${targetLabel}" não. Conecte Pixel/Audiência → página/WhatsApp.`,
    };
  }
  if (sourceRole === 'tracking' && targetRole === 'channel') {
    return {
      ok: false,
      reason: 'Audiência/Pixel não conectam em canais — use campanha/canal → pixel → audiência.',
    };
  }

  return {
    ok: false,
    reason:
      'Fluxo sugerido: Meta → Conjunto Meta → Criativo → Pixel → Audiência → site/WhatsApp.',
  };
}

export function applyLinkInheritanceOnConnect(sourceNode, targetNode, nodes = [], edges = []) {
  const targetRole = getFunilNodeRole(targetNode.data?.type);
  const sourceMeta = getInheritedMetaLink(sourceNode, nodes, edges) || sourceNode.data?.metaLink;
  const sourceGoogle =
    getInheritedGoogleLink(sourceNode, nodes, edges) || sourceNode.data?.googleLink;

  const nextData = { ...targetNode.data };
  nextData.linkSource = {
    parentNodeId: sourceNode.id,
    inheritedAt: new Date().toISOString(),
  };

  const targetType = targetNode.data?.type;
  const placement = PLACEMENT_BY_TYPE[targetType];

  if (sourceMeta && (targetRole === 'channel' || targetRole === 'adset' || targetRole === 'creative' || targetRole === 'tracking' || targetRole === 'downstream')) {
    nextData.linkOverride = {
      ...(nextData.linkOverride || {}),
      ...(placement ? { placement } : {}),
    };
    if (targetRole === 'channel' && placement) {
      nextData.metaLink = {
        ...(sourceMeta || {}),
        placement,
      };
    }
    if (targetRole === 'adset' || targetRole === 'tracking') {
      // Conjunto / Pixel: linkSource; conjunto e criativo usam linkOverride no painel
    } else if (targetRole === 'downstream') {
      nextData.metaLink = {
        utmSource: sourceMeta.utmSource,
        utmMedium: sourceMeta.utmMedium,
        utmCampaign: sourceMeta.utmCampaign,
      };
    }
  }

  if (sourceGoogle && (targetRole === 'channel' || targetRole === 'creative' || targetRole === 'tracking' || targetRole === 'downstream')) {
    if (targetRole === 'downstream') {
      nextData.googleLink = {
        utmSource: sourceGoogle.utmSource,
        utmMedium: sourceGoogle.utmMedium,
        utmCampaign: sourceGoogle.utmCampaign,
      };
    }
  }

  return nextData;
}

export function clearLinkInheritance(nodeData) {
  if (!nodeData) return nodeData;
  const next = { ...nodeData };
  delete next.linkSource;
  delete next.linkOverride;
  if (next.metaLink && getFunilNodeRole(next.type) !== 'campaign') {
    delete next.metaLink;
  }
  if (next.googleLink && getFunilNodeRole(next.type) !== 'campaign') {
    delete next.googleLink;
  }
  delete next.creativeThumbnailUrl;
  delete next.creativeThumbnailUrlAdId;
  delete next.pixelMeta;
  delete next.audienceMeta;
  return next;
}

/** Conta Meta herdada da cadeia de pais (para pixel / tracking). */
export function getInheritedMetaAccount(node, nodes, edges) {
  const inherited = getInheritedMetaLink(node, nodes, edges);
  if (!inherited?.accountId) return null;
  return {
    accountId: inherited.accountId,
    accountName: inherited.accountName || '',
    campaignId: inherited.campaignId || null,
    campaignName: inherited.campaignName || null,
  };
}

export function isPixelMetaNode(node) {
  return node?.data?.type === 'pixel-meta';
}

/** Pixel Meta ancestral com públicos já sincronizados (cadeia de pais). */
export function getUpstreamPixelMeta(node, nodes, edges) {
  if (!node?.id) return null;
  let current = node;
  let depth = 0;
  while (current && depth <= MAX_INHERIT_DEPTH) {
    const parent = getParentNode(current.id, nodes, edges);
    if (!parent) return null;
    if (parent.data?.type === 'pixel-meta') {
      return {
        pixelNode: parent,
        pixelMeta: parent.data?.pixelMeta || null,
        pixelLabel: parent.data?.label || 'Pixel Meta',
      };
    }
    current = parent;
    depth += 1;
  }
  return null;
}

/** Preenche linkSource em nós que já têm aresta pai com campanha (migração ao carregar). */
export function migrateDiagramLinkSources(nodes, edges) {
  if (!nodes?.length || !edges?.length) return nodes;
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const parent = getParentNode(node.id, nodes, edges);
    if (!parent) return node;
    const role = getFunilNodeRole(node.data?.type);
    if (role === 'campaign') return node;
    if (node.data?.linkSource?.parentNodeId === parent.id) return node;

    const parentHasMeta = hasMetaLink(parent.data?.metaLink);
    const parentHasGoogle = hasGoogleLink(parent.data?.googleLink);
    if (!parentHasMeta && !parentHasGoogle) {
      const parentRole = getFunilNodeRole(parent.data?.type);
      if (parentRole !== 'channel' && parentRole !== 'creative') return node;
    }

    changed = true;
    const patched = applyLinkInheritanceOnConnect(parent, node, nodes, edges);
    return { ...node, data: patched };
  });
  return changed ? nextNodes : nodes;
}

export function getInheritedParentLabel(node, nodes, edges) {
  const parent = getParentNode(node?.id, nodes, edges);
  return parent?.data?.label || null;
}
