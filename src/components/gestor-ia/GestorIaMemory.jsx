import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { canUseGestorReportArchive } from '@/lib/gestorIaReportArchive';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { supabase } from '@/lib/customSupabaseClient';
import { storeRastreamentoClienteId } from '@/lib/rastreamentoHub';
import { dateRange } from '@/lib/trafficPerformanceReport';
import { writeRastreamentoPeriod } from '@/lib/rastreamentoPeriod';
import GestorIaContext, { date, number, periodLabel, readingTime } from './GestorIaContext';
import { formatMetric, metricValue } from './gestorIaMetricModel';
import { countGestorCrmMetaContacts, loadTrackedCrmOutcome, trackedCrmScope } from './gestorIaMemoryData';
import { readDecisionMemoryDraft } from './gestorIaDecisionLog';
import { goalAccountId } from './gestorIaMediaGoalData';
import { GESTOR_RASTREAMENTO_PATH } from './gestorIaClientModel';
import GestorIaPortalPerformance from './GestorIaPortalPerformance';
import GestorIaPortalNotices from './GestorIaPortalNotices';
import AtlasNotes from './GestorIaAtlasNotes';

function TrackedComparison({ outcome, scope }) {
  const { total, matched, partial } = outcome;
  const { messages, spend, currency, period } = scope;
  const money = (value) => formatMetric(value, { unit: 'money' }, currency);
  const unitCost = (result) => spend > 0 && result > 0 ? money(spend / result) : '—';
  return <section className="gia-crm-result" aria-label="Comparação entre Meta e Rastreamento">
    <header><h3>Meta × Rastreamento</h3><p className="gia-caption">{periodLabel(period)} · Dias fechados no fuso da conta</p></header>
    <dl className="gia-crm-metrics">
      <div><dt>Conversas atribuídas na Meta</dt><dd>{number(messages)}</dd></div>
      <div><dt>Novos contatos de WhatsApp rastreados</dt><dd>{number(matched)}</dd></div>
      <div><dt>Custo por conversa na Meta</dt><dd>{unitCost(messages)}</dd></div>
      <div><dt>Custo por contato rastreado</dt><dd>{unitCost(matched)}</dd></div>
    </dl>
    <p className="gia-caption">{`${number(matched)} de ${number(total)} contatos de WhatsApp com origem Meta Ads foram ligados a anúncios desta conta.`}</p>
    <p className="gia-caption">{spend === null ? 'Investimento sem cobertura completa neste recorte.' : `Investimento da conta no período ${money(spend)}.`}
      {partial && ' A leitura de anúncios está parcial.'}</p>
  </section>;
}

function CrmResult({ clientId, since, until, accountReading, scope }) {
  const [reading, setReading] = useState(null);
  const { accountId, historyAt, period: scopedPeriod } = scope || {};
  const scopedSince = scopedPeriod?.since, scopedUntil = scopedPeriod?.until;
  useEffect(() => {
    let active = true;
    const read = async () => {
      const outcome = historyAt && await loadTrackedCrmOutcome(supabase, { clientId, accountId, historyAt, since: scopedSince, until: scopedUntil });
      return outcome ? { outcome } : { count: await countGestorCrmMetaContacts(supabase, { clientId, period: { since, until } }) };
    };
    read().then((result) => {
      if (active) setReading(result);
    }).catch(() => {
      if (active) setReading({ error: true });
    });
    return () => { active = false; };
  }, [clientId, since, until, accountId, historyAt, scopedSince, scopedUntil]);

  if (!reading) return <p className="gia-caption" role="status">Consultando o Rastreamento…</p>;
  if (reading.error) return <p className="gia-caption" role="alert">Somente dados da Meta. O Rastreamento está indisponível.</p>;
  if (reading.outcome) return <TrackedComparison outcome={reading.outcome} scope={scope} />;
  if (reading.count === null) return <p className="gia-caption">Somente dados da Meta.</p>;
  return <div className="space-y-1">
    <h3>Rastreamento</h3>
    <dl className="gia-context-grid">
      <div><dt>Contatos de WhatsApp com origem Meta Ads registrada</dt><dd>{number(reading.count)}</dd></div>
    </dl>
    <p className="gia-caption">Primeira entrada no período para todo o cliente, no horário de Brasília. {accountReading ? 'A leitura da Meta cobre a conta selecionada.' : 'A Meta informa resultados atribuídos na plataforma.'}</p>
  </div>;
}

export default function GestorIaMemory({ client, period, reviews, canManageClients, canReadMeta, metrics, accountId, filters, atlasDraft }) {
  const { profile, canViewField } = useAuth();
  const { moduleSettings } = useModuleSettings();
  const canManagePortal = canUseGestorReportArchive(profile, moduleSettings, canViewField);
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!location.state?.gestorDecisionMemory) return;
    const state = { ...location.state };
    delete state.gestorDecisionMemory;
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state });
  }, [location, navigate]);
  const decisionDraft = canViewField?.('meta_resumo') === true && canViewField?.('valor') === true
    ? readDecisionMemoryDraft(location.state, client.id, profile?.id) : null;
  const metaAllowed = !metrics?.accessDenied && canViewField?.('meta_resumo') === true;
  const accountPeriod = metaAllowed && canReadMeta && metrics?.account ? dateRange(metrics.period?.since, metrics.period?.until) : null;
  const waitingForAccount = canReadMeta && metrics?.loading && !accountPeriod;
  const legacy = metaAllowed && !waitingForAccount && !accountPeriod ? readClienteMetaResumo(client) : null;
  const legacyPeriod = legacy && !legacy.permError && !legacy.rateLimited && !legacy.errorMessage && metricValue(legacy, 'spend') !== null
    ? dateRange(legacy.period?.since, legacy.period?.until) : null;
  const snapshot = accountPeriod ? metrics.account : legacy;
  const sourcePeriod = accountPeriod || legacyPeriod;
  const metaVisible = canReadMeta && sourcePeriod;
  const currency = /^[A-Z]{3}$/.test(snapshot?.currency || '') ? snapshot.currency : '';
  const canSeeSpend = Boolean(currency) && canViewField?.('valor') === true;
  const syncTime = readingTime(accountPeriod ? metrics.fetchedAt : legacy?.syncedAt);
  const validPeriod = dateRange(period?.since, period?.until);
  const tracked = accountPeriod && accountId && canViewField?.('valor') === true && moduleSettings?.rastreamento === true
    ? trackedCrmScope(goalAccountId(accountId), metrics, validPeriod) : null;
  const latestReview = validPeriod && !reviews?.loading && !reviews?.error ? reviews?.reviews?.at(-1) : null;
  const reportsParams = new URLSearchParams(params);
  reportsParams.set('tab', 'relatorios');
  const metricsParams = new URLSearchParams(params);
  metricsParams.delete('tab');
  const integrationParams = writeRastreamentoPeriod(new URLSearchParams({ aba: 'integracoes' }), sourcePeriod || validPeriod || undefined);

  return <div className="gia-stack">
    <section className="gia-panel" aria-label="Memória do cliente">
      <div className="gia-section-heading"><div><h2>Memória do cliente</h2><p className="gia-caption">Orientações e aprendizados do Atlas para este cliente.</p></div></div>
      {profile?.status === 'active' && moduleSettings?.assistant === true
        ? <AtlasNotes key={`${profile.id}:${profile.role}:${client.id}`} ownerId={profile.id} client={client} accountId={accountId}
          canReadDecisions={moduleSettings?.paid_traffic !== false && canViewField?.('meta_resumo') === true && canViewField?.('valor') === true}
          canChooseAccount={canReadMeta} atlasDraft={atlasDraft} initialDraft={decisionDraft} />
        : <p className="gia-caption">Anotações disponíveis pelo módulo Assistente.</p>}
      <details className="mt-4 border-t border-[var(--gia-line)] pt-3">
        <summary className="cursor-pointer">Contexto cadastral</summary>
        <div className="mt-3"><GestorIaContext client={client} embedded /></div>
      </details>
    </section>
    <section className="gia-panel" aria-label="Janela do cliente">
      <div className="gia-section-heading"><div><h2>Janela do cliente</h2><p className="gia-caption">Cada login do portal vê as páginas autorizadas no Planeje.</p></div>
        <div className="gia-header-actions">
          {canManagePortal && <Link className="gia-action-link" to={{ search: reportsParams.toString() }}>Gerenciar PDFs</Link>}
          {canManagePortal && <GestorIaPortalNotices key={`${profile.id}:${client.id}`} client={client} />}
          {canManageClients && profile?.role === 'superadmin' && <Link className="gia-action-link" to="/super-admin/client-users">Gerenciar permissões do portal</Link>}
        </div>
      </div>
      <p>Os PDFs e avisos publicados aparecem no Dashboard para os logins autorizados. As anotações desta ficha são internas.</p>
      {canManagePortal && <GestorIaPortalPerformance key={`${profile.id}:${client.id}`} client={client} />}
    </section>
    <section className="gia-panel" aria-label="Resultado real">
      <div className="gia-section-heading"><div><h2>Resultado real</h2><p className="gia-caption">Resultados por fonte e período.</p></div>
        <Link className="gia-action-link" to={{ search: metricsParams.toString() }}>Ver métricas</Link>
      </div>
      <div className="space-y-4">
        {filters}
        {metaVisible ? <div className="space-y-1">
          <h3>Meta Ads · {accountPeriod ? 'Leitura salva da conta' : 'Resumo salvo do cliente'}</h3>
          <p className="gia-caption">{periodLabel(sourcePeriod)}{syncTime && ` · Atualizado em ${syncTime}`}</p>
          {accountPeriod && metrics.derived && <p className="gia-caption">Totais calculados com a série diária salva.</p>}
          {accountPeriod && metrics.exact === false && <p className="gia-caption">A leitura disponível cobre as datas acima. O período selecionado aguarda atualização.</p>}
          <dl className="gia-context-grid">
            <div><dt>Conversas na Meta</dt><dd>{number(snapshot.messages)}</dd></div>
            <div><dt>Leads na Meta</dt><dd>{number(snapshot.leads)}</dd></div>
            <div><dt>Compras na Meta</dt><dd>{number(snapshot.purchases)}</dd></div>
            {canSeeSpend && <div><dt>Investimento na Meta</dt><dd>{formatMetric(metricValue(snapshot, 'spend'), { unit: 'money' }, currency)}</dd></div>}
          </dl>
        </div> : metrics?.accessDenied ? <p className="gia-caption" role="alert">Acesso à leitura da Meta restrito.</p>
          : waitingForAccount ? <p className="gia-caption" role="status">Consultando a leitura salva da conta…</p>
            : <p className="gia-caption">{legacyPeriod ? `Resumo salvo do cliente · ${periodLabel(legacyPeriod)}` : 'Resumo da Meta indisponível.'}</p>}
        {metaVisible && (moduleSettings?.rastreamento === true
          ? <CrmResult key={JSON.stringify([profile?.id, profile?.role, client.id, sourcePeriod.since, sourcePeriod.until, tracked?.accountId, tracked?.historyAt,
            tracked?.period.since, tracked?.period.until])} clientId={client.id} since={sourcePeriod.since} until={sourcePeriod.until}
            accountReading={Boolean(accountPeriod)} scope={tracked} />
          : <p className="gia-caption">Somente dados da Meta.</p>)}
        <div className="flex flex-wrap gap-2">
          {moduleSettings?.mini_crm === true && <Link className="gia-action-link" to={`/mini-crm?${new URLSearchParams({ cliente: client.id })}`}>Abrir Mini CRM</Link>}
          {moduleSettings?.rastreamento === true && <Link className="gia-action-link" to={{ pathname: GESTOR_RASTREAMENTO_PATH, search: integrationParams.toString() }} onClick={() => storeRastreamentoClienteId(client.id)}>Abrir integrações do CRM</Link>}
        </div>
        <div className="border-t border-[var(--gia-line)] pt-3">
          <div className="gia-section-heading"><h3>Rotina de tráfego</h3><Link className="gia-action-link" to={{ search: reportsParams.toString() }}>Ver relatório</Link></div>
          {validPeriod && reviews?.loading ? <p className="gia-caption" role="status">Consultando resultado registrado…</p>
            : reviews?.error ? <p className="gia-caption" role="alert">{reviews.error}</p>
              : latestReview ? <p>{number(latestReview.results)} {latestReview.result_label || 'resultados'} · Semana de {date(latestReview.week_start)} · {latestReview.finalized_at ? 'Finalizada' : 'Rascunho'}</p>
                : <p className="gia-caption">Nenhum resultado registrado neste período.</p>}
        </div>
      </div>
    </section>
  </div>;
}
