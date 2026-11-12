import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import { hasMetaLink } from '@/lib/funilMetaLink';
import { hasGoogleLink } from '@/lib/funilGoogleLink';
import {
  getFunilNodeRole,
  getParentNode,
  resolveEffectiveLink,
  getInheritedMetaAccount,
  getUpstreamPixelMeta,
} from '@/lib/funilNodeGraph';
import { isAudiencePickerNode } from '@/lib/funilAudienceMeta';
import { isMetaAdsetNode } from '@/lib/funilMetaAdset';

/**
 * Checklist de validação do diagrama publicado.
 * @returns {{ level: 'error'|'warn', message: string, nodeId?: string }[]}
 */
export function validateFunilDiagram(nodes, edges = []) {
  const issues = [];
  if (!Array.isArray(nodes)) return issues;

  for (const node of nodes) {
    const type = node.data?.type;
    const cfg = NODE_CONFIG[type];
    if (!cfg) continue;
    const label = node.data?.label || cfg.label || type;
    const role = getFunilNodeRole(type);
    const effective = resolveEffectiveLink(node, nodes, edges);
    const parent = getParentNode(node.id, nodes, edges);

    if (type === 'meta' || type === 'google') {
      if (!hasMetaLink(node.data?.metaLink) && !hasGoogleLink(node.data?.googleLink)) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": configure conta e campanha neste nó (fonte da operação).`,
        });
      }
    }

    if (role === 'channel') {
      if (!parent) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": conecte à campanha Meta/Google acima (arraste uma aresta do pai).`,
        });
      } else if (!effective.metaLink?.campaignId && !effective.googleLink?.campaignId) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `"${label}": nó pai sem campanha configurada.`,
        });
      }
    }

    if (isMetaAdsetNode(node)) {
      const parent = getParentNode(node.id, nodes, edges);
      const inherited = resolveEffectiveLink(node, nodes, edges);
      const adSetId = node.data?.linkOverride?.adSetId || inherited?.metaLink?.adSetId;

      if (!parent) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": conecte abaixo da campanha Meta.`,
        });
      } else if (!inherited?.metaLink?.campaignId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": campanha Meta não configurada no nó pai.`,
        });
      } else if (!adSetId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": selecione o conjunto de anúncios (ad set).`,
        });
      }
    }

    if (role === 'creative') {
      if (!parent) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `"${label}": conecte o criativo à campanha ou canal acima.`,
        });
      } else if (effective.metaLink?.campaignId && !effective.metaLink?.adSetId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": selecione o conjunto no nó Conjunto Meta acima (ou no painel herdado).`,
        });
      } else if (effective.metaLink?.campaignId && !effective.metaLink?.adId) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `"${label}": selecione o anúncio específico no painel.`,
        });
      } else if (!effective.metaLink?.campaignId && !effective.googleLink?.campaignId) {
        issues.push({
          level: 'error',
          nodeId: node.id,
          message: `"${label}": herança inválida — pai sem vínculo Meta/Google.`,
        });
      }
    }

    if (cfg.category === 'Páginas' && !node.data?.url) {
      issues.push({
        level: 'warn',
        nodeId: node.id,
        message: `"${label}": informe a URL da landing page.`,
      });
    }

    if (type === 'pixel-meta') {
      const parent = getParentNode(node.id, nodes, edges);
      const account = getInheritedMetaAccount(node, nodes, edges);
      const pm = node.data?.pixelMeta;

      if (!parent) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": conecte à mídia Meta (campanha ou canal) acima do pixel.`,
        });
      } else if (!account?.accountId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": nó pai sem conta Meta — configure a campanha fonte.`,
        });
      }

      if (!pm?.pixelId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": selecione o pixel da conta e clique em Atualizar pixel.`,
        });
      } else {
        const lead = (pm.events || []).find((e) => e.key === 'Lead');
        const leadOk = lead && (lead.status === 'active' || lead.lastFiredAt);
        if (!leadOk) {
          issues.push({
            level: 'warn',
            nodeId: node.id,
            message: `"${label}": evento Lead não confirmado — valide no site/GTM ou CAPI WhatsApp.`,
          });
        }
      }
    }

    if (isAudiencePickerNode(node)) {
      const upstream = getUpstreamPixelMeta(node, nodes, edges);
      const am = node.data?.audienceMeta;

      if (!upstream) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": conecte abaixo de um Pixel Meta na cadeia (Pixel → ${cfg.label}).`,
        });
      } else if (!upstream.pixelMeta?.pixelId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": atualize o pixel no nó "${upstream.pixelLabel}" antes de escolher o público.`,
        });
      } else if (!am?.customAudienceId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": selecione qual público personalizado Meta vamos usar.`,
        });
      }
    }

    if (type === 'whatsapp') {
      if (!data.whatsappChannel?.configId) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": selecione o canal WhatsApp do cliente no painel do nó (CRM → Canais).`,
        });
      } else if (data.whatsappChannel.instanceStatus && data.whatsappChannel.instanceStatus !== 'connected') {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": canal "${data.whatsappChannel.channelName || 'WhatsApp'}" não está conectado na uazapi.`,
        });
      } else if (!data.whatsappChannel.phone && !data.url) {
        issues.push({
          level: 'warn',
          nodeId: node.id,
          message: `"${label}": busque o número do canal ou informe o link wa.me.`,
        });
      }
    }
  }

  return issues;
}

export function countValidationIssues(issues) {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
  };
}
