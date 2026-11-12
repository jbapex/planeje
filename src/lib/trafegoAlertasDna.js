/** Alertas DNA da ficha — determinísticos, sem gravar demanda sozinha. */

import { NEXT_ACTIONS } from './trafegoProximaAcao.js';
import { clientHealth, formatMoney } from './trafegoFila.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function packAlert({ client, code, title, detail, tone, demandType, demandTitle, actionCode }) {
  if (!client?.id) return null;
  return {
    id: `dna:${client.id}:${code}`,
    kind: 'dna',
    clientId: client.id,
    title: client.empresa || 'Cliente',
    code,
    alertTitle: title,
    reason: detail,
    tone: tone || 'warn',
    action: {
      code: actionCode || code,
      title,
      detail,
      demandType: demandType || NEXT_ACTIONS[actionCode || code]?.demandType || 'analise',
      demandTitle:
        demandTitle ||
        NEXT_ACTIONS[actionCode || code]?.demandTitle ||
        title,
    },
  };
}

/**
 * Emite alertas a partir do brief (7d/dia) + DNA da ficha do cliente.
 */
export function buildDnaAlerts(briefs = [], { dismissedIds = [] } = {}) {
  const dismissed = new Set(dismissedIds || []);
  const alerts = [];

  for (const brief of briefs || []) {
    const client = brief?.client;
    if (!client?.id) continue;

    const totals = brief.totals || {};
    const spend = num(totals.spend ?? brief.spend);
    const messages = num(totals.messages);
    const leads = num(totals.leads);
    const purchases = num(totals.purchases);
    const purchaseValue = num(totals.purchaseValue);

    const metrics = {
      spend,
      messages,
      leads,
      purchases,
      purchaseValue,
    };
    const health = clientHealth(client, metrics);

    if (health.overTeto) {
      const alert = packAlert({
        client,
        code: 'acima_teto',
        title: 'Acima do teto',
        detail: `${formatMoney(spend)} / ${formatMoney(client.limite_meta)} no recorte`,
        tone: 'issue',
        demandType: 'orcamento',
        demandTitle: 'Revisar teto de verba',
        actionCode: 'limite',
      });
      if (alert && !dismissed.has(alert.id)) alerts.push(alert);
    }

    const quality = brief.quality;
    if (quality?.code && NEXT_ACTIONS[quality.code]) {
      const spec = NEXT_ACTIONS[quality.code];
      const doNext = spec.gestorDo || spec.action;
      let detail = doNext;
      if (quality.code === 'roas_irreal') {
        detail = `ROAS ${Number(quality.roas || 0).toFixed(1)}x. ${doNext}`;
      }
      const alert = packAlert({
        client,
        code: quality.code,
        title: spec.title,
        detail,
        tone: spec.tone,
        demandType: spec.demandType,
        demandTitle: spec.demandTitle,
        actionCode: quality.code,
      });
      if (alert && !dismissed.has(alert.id)) alerts.push(alert);
      continue;
    }

    if (health.resultStatus === 'critico') {
      const objetivo = String(client.objetivo_meta || '').toLowerCase();
      const isBuy = /compra|roas|venda|e-commerce/.test(objetivo);
      const code = isBuy ? 'roas_baixo' : 'cpl_alto';
      const alert = packAlert({
        client,
        code,
        title: 'Fora da meta da ficha',
        detail: health.resultLabel || health.label,
        tone: 'warn',
        demandType: 'analise',
        demandTitle: isBuy ? 'Revisar ROAS vs meta' : 'Revisar CPL vs meta',
        actionCode: isBuy ? 'zero_vendas' : 'zero_msgs',
      });
      if (alert && !dismissed.has(alert.id)) alerts.push(alert);
    }
  }

  return alerts;
}

export function dismissKeyForToday(ymd) {
  return `planeje-dna-dismissed:${ymd || new Date().toISOString().slice(0, 10)}`;
}

export function readDismissedAlerts(ymd) {
  try {
    const raw = sessionStorage.getItem(dismissKeyForToday(ymd));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeDismissedAlerts(ymd, ids) {
  try {
    sessionStorage.setItem(dismissKeyForToday(ymd), JSON.stringify(ids || []));
  } catch {
    /* ignore */
  }
}
