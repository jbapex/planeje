/** Conversas reais e qualificados no Relatórios: mesma regra da Visão geral (WhatsApp + anúncio + primeira mensagem). */

import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { campaignIdFromReportRow } from './crmRelatorioMetaSpend.js';

export function reportCampaignName(row) {
  const fromCol = row?.utm_campaign != null && String(row.utm_campaign).trim() !== '' ? String(row.utm_campaign).trim() : '';
  if (fromCol) return fromCol;
  const td = row?.tracking_data;
  if (td && typeof td === 'object') {
    const fromMeta = td.meta_ad_details?.ad?.campaign?.name;
    if (fromMeta) return fromMeta;
    if (td.utm_campaign != null && String(td.utm_campaign).trim() !== '') return String(td.utm_campaign).trim();
    if (td.campaign_name) return td.campaign_name;
  }
  return 'Sem campanha';
}

export function summarizeRelatorioTracking(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    realConversations: list.length,
    qualificados: list.filter((row) => row?.qualificado === true).length,
  };
}

export function selectRelatorioTrackingContacts(contacts, inRange) {
  return (contacts || []).filter((row) => isMetaAdsContactForStats(row) && inRange(row));
}

export function emptyRelatorioGroup(name, campaignId = null) {
  return {
    campaignName: name,
    campaignId: campaignId || null,
    leads: 0,
    vendas: 0,
    valorTotal: 0,
    spend: 0,
    realConversations: 0,
    qualificados: 0,
    naoResponde: 0,
    desqualificado: 0,
  };
}

export function addRelatorioTrackingToGroup(group, row) {
  const next = group || emptyRelatorioGroup(reportCampaignName(row), campaignIdFromReportRow(row) || null);
  if (!next.campaignId) {
    const id = campaignIdFromReportRow(row);
    if (id) next.campaignId = id;
  }
  next.realConversations += 1;
  if (row?.qualificado === true) next.qualificados += 1;
  return next;
}
