import React, { useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { confirmCsTaskClient } from '@/lib/csIaTaskNavigation';
import { supabase } from '@/lib/customSupabaseClient';
import GestorIaGoals from '@/components/gestor-ia/GestorIaGoals';
import { useGestorIaMetrics } from '@/components/gestor-ia/GestorIaMetrics';
import { readClientGoalTargets } from '@/components/gestor-ia/gestorIaClientModel';
import { canUseGestorIa, GESTOR_PERMISSION_FIELDS, loadGestorGoalClient } from '@/components/gestor-ia/gestorIaData';
import { goalAccountId } from '@/components/gestor-ia/gestorIaMediaGoalData';
import { goalMonthPeriod } from '@/components/gestor-ia/gestorIaMediaGoalModel';
import { metricValue } from '@/components/gestor-ia/gestorIaMetricModel';
import { createGestorReads, useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { useGestorAtlasContext } from '@/components/gestor-ia/useGestorAtlas';
import { canManageCsIa, canUseCsIa } from './csIaData';

export default function CsIaGoals({ clientId, modules }) {
  const { profile, canViewField } = useAuth();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const allowed = canUseCsIa(profile, modules) && canUseGestorIa(profile, modules);
  const admin = canManageCsIa(profile, modules);
  const canReadMeta = allowed && admin && canViewField?.('meta_resumo') === true;
  const identity = JSON.stringify([clientId, profile?.id, profile?.role, allowed, modules.reports, modules.assistant,
    GESTOR_PERMISSION_FIELDS.map((field) => canViewField?.(field) === true)]);
  const readStore = useMemo(() => createGestorReads(identity), [identity]);
  const accessError = () => Object.assign(new Error('Cliente indisponível para consultar ou editar metas no CS.'), { accessDenied: true });
  const details = useGestorRead(readStore, 'cliente-metas', allowed, async () => {
    if (!await confirmCsTaskClient(supabase, clientId)) throw accessError();
    return loadGestorGoalClient(supabase, profile, modules, canViewField, clientId);
  });
  const client = !details.error && details.data;
  const accounts = client?.metaAccounts || [];
  const primary = client?.mediaGoals?.find((goal) => goal.is_primary);
  const primaryAccount = primary && accounts.find(({ meta_account_id }) => goalAccountId(meta_account_id) === primary.account_id);
  const requestedAccount = params.get('conta') || '';
  const accountFilter = accounts.find(({ meta_account_id }) => goalAccountId(meta_account_id) === goalAccountId(requestedAccount))?.meta_account_id || requestedAccount;
  const accountId = accountFilter || primaryAccount?.meta_account_id || accounts[0]?.meta_account_id || '';
  const period = goalMonthPeriod(params.get('mes_meta'));
  const query = { clientId, profile, modules, period };
  const { current: reading } = useGestorIaMetrics({ client, query, accountId, canReadMeta, validPeriod: true, readStore }, Boolean(client));
  const atlasScope = useGestorAtlasContext(client?.id, readStore);

  function filter(key, value) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { state });
  }

  async function beforeSave() {
    if (await confirmCsTaskClient(supabase, clientId)) return;
    const error = accessError();
    await details.reload(() => { throw error; });
    throw error;
  }

  if (!allowed) return <p className="gia-notice" role="alert">A configuração de metas está indisponível para esta sessão.</p>;
  if (details.error) return <div className="gia-notice"><p role="alert">Não foi possível consultar as metas deste cliente.</p>
    <button type="button" className="gia-action-link" onClick={() => details.reload()}>Tentar novamente</button></div>;
  if (!client) return <p className="gia-caption" role="status">Carregando metas…</p>;

  const snapshot = canViewField?.('meta_resumo') === true ? readClienteMetaResumo(client) : null;
  const savedSnapshot = snapshot && !snapshot.permError && !snapshot.rateLimited && metricValue(snapshot, 'spend') !== null ? snapshot : null;
  const gestorUrl = `/gestor-ia/clientes/${encodeURIComponent(clientId)}`;
  const gestorParams = new URLSearchParams({ tab: 'metas' });
  if (accountFilter) gestorParams.set('conta', accountFilter);
  if (params.get('mes_meta')) gestorParams.set('mes_meta', period.since.slice(0, 7));
  const accountSelect = <select aria-label="Filtrar metas por conta" value={accountFilter} onChange={(event) => filter('conta', event.target.value)}>
    <option value="">Todas as contas</option>
    {accounts.map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
    {accountFilter && !accounts.some(({ meta_account_id }) => meta_account_id === accountFilter) && <option value={accountFilter}>Conta indisponível</option>}
  </select>;

  return <section className="gia-stack" aria-labelledby="cs-goals-title">
    <div className="gia-section-heading"><h2 id="cs-goals-title">Metas do cliente</h2>
      <Link className="gia-action-link" to={`${gestorUrl}?${gestorParams}`}>Abrir metas no Gestor IA <ArrowUpRight aria-hidden="true" /></Link>
    </div>
    <GestorIaGoals key={identity} client={client} {...readClientGoalTargets(client, canViewField)} snapshot={savedSnapshot}
      canManageClients={admin} canEditMonthlyGoals={admin && modules.reports === true} query={query} readStore={readStore} reloadPortfolio={details.reload}
      canReadMeta={canReadMeta} period={period} reading={reading} accountId={accountId} accountFilter={accountFilter} accountSelect={accountSelect}
      selectMonth={(value) => filter('mes_meta', value)} accountsTo={`${gestorUrl}?tab=contas`} atlasScope={atlasScope} beforeSave={beforeSave} />
  </section>;
}
