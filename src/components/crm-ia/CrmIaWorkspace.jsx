import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, CalendarDays, Columns, Copy, MessagesSquare, Radio, Search, Settings, Sparkles, Users, Zap } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { buildClientRastreamentoUrl } from '@/lib/clientHubRoutes';
import { useAtlasEntryAccess } from '@/components/AtlasEntry';
import GestorIaSidebar from '@/components/gestor-ia/GestorIaSidebar';
import GestorIaClientAvatar from '@/components/gestor-ia/GestorIaClientAvatar';
import CrmIaContent from './CrmIaContent';
import { canUseCrmIa, crmIaRequest } from './crmIaApi';
import { CRM_IA_SECTIONS } from './crmIaPresentation';
import '@/components/gestor-ia/GestorIa.css';
import './CrmIa.css';

const TABS = [
  ['painel', 'Painel', BarChart3], ['funil', 'Funil', Columns], ['leads', 'Leads', Users],
  ['conversas', 'Conversas', MessagesSquare], ['agentes', 'Agentes IA', Sparkles], ['agenda', 'Agenda', CalendarDays],
  ['disparos', 'Disparos', Zap], ['rastreabilidade', 'Rastreabilidade', Radio], ['modelos', 'Modelos', Copy],
  ['configuracoes', 'Configurações', Settings],
];
const accountSearchText = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export default function CrmIaWorkspace() {
  const { user, profile, loading } = useAuth();
  const { moduleSettings, moduleAccess, loading: modulesLoading } = useModuleSettings();
  if (loading || modulesLoading) return <main className="p-6" role="status">Carregando acesso ao CRM IA…</main>;
  if (!canUseCrmIa(profile, moduleSettings)) return <main className="p-6"><h1>Acesso ao CRM IA indisponível</h1><Link to="/caixa">Voltar ao Planeje</Link></main>;
  return <CrmIaAuthorized key={JSON.stringify([user?.id, profile.id, profile.role, moduleSettings, moduleAccess])} profile={profile} user={user} modules={moduleSettings} />;
}

function CrmIaAuthorized({ profile, user, modules }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bootstrap, setBootstrap] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const selectedId = params.get('cliente') || '';
  const canAnalyze = useAtlasEntryAccess(modules?.assistant === true ? user?.id : null);
  const section = location.pathname.replace(/\/$/, '').split('/').at(-1);
  const activeTab = TABS.some(([id]) => id === section) ? section : 'painel';
  const client = bootstrap?.clients?.find(row => row.id === selectedId);
  const accountSearch = params.get('busca_contas') || '';
  const accountSearchInput = useRef(null);
  const accountRows = (bootstrap?.clients || []).filter(row => accountSearchText(row.empresa).includes(accountSearchText(accountSearch.trim())));
  const api = useCallback((action, payload) => crmIaRequest(supabase, action, selectedId, payload), [selectedId]);

  useEffect(() => {
    let active = true;
    setBootstrap(null); setError('');
    crmIaRequest(supabase, 'bootstrap', null).then(data => { if (active) setBootstrap(data); })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setWorkspace(null); setError('');
    if (client) api('workspace').then(data => { if (active) setWorkspace(data); })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [client, api, refresh]);

  function chooseClient(id) {
    setWorkspace(null);
    setParams(id ? { cliente: id } : {}, { replace: false });
  }
  function searchAccounts(value) {
    setParams(old => { const next = new URLSearchParams(old); if (value) next.set('busca_contas', value); else next.delete('busca_contas'); return next; }, { replace: true });
  }
  function analyze({ lead, question } = {}) {
    if (!canAnalyze || !client) return;
    const message = [
      'Consulte o especialista CRM IA.',
      `Analise o CRM IA desta conta no Planeje: ${client.empresa}.`,
      question || 'Confira o funil, os leads sem resposta, os próximos compromissos e a fila. Proponha o próximo passo com evidências.',
      lead?.id && `Oportunidade em foco: ${lead.id}.`,
      'Use os registros atuais autorizados do CRM IA. Separe fatos, hipóteses e dados indisponíveis. Prepare somente um rascunho para revisão.',
    ].filter(Boolean).join('\n');
    navigate('/assistant/atlas?view=conversation', { state: { crmIaDraft: { ownerId: user.id, clientId: client.id, message } } });
  }
  if (section === 'crm-ia') return <Navigate to={{ pathname: '/crm-ia/painel', search: location.search }} replace />;
  const accountPicker = <label className="crm-ia-account-picker">Conta<select value={client?.id || ''} onChange={event => chooseClient(event.target.value)} disabled={!bootstrap}>
    <option value="">Escolha a conta</option>{(bootstrap?.clients || []).map(row => <option key={row.id} value={row.id}>{row.empresa}</option>)}
  </select></label>;
  const [title, description] = CRM_IA_SECTIONS[activeTab];
  return <div className="gestor-ia crm-ia-workspace">
    <GestorIaSidebar tabs={TABS} activeTab={activeTab} search={selectedId ? `?cliente=${encodeURIComponent(selectedId)}` : ''} profileName={profile.full_name} workspace="crm-ia" />
    <main className={`gia-workspace crm-ia-main${!selectedId ? ' is-account-selection' : activeTab === 'conversas' ? ' is-conversations' : ''}`} id="crm-ia-main">
      <header className="crm-ia-page-header crm-ia-workspace-header"><div><h1>{selectedId ? title : 'CRM IA'}</h1><p>{selectedId ? description : 'Escolha uma conta para acompanhar leads, conversas e agenda.'}</p></div>{accountPicker}</header>
      {error ? <section className="crm-ia-state" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>Tentar novamente</button></section>
        : !bootstrap ? <p className="crm-ia-state" role="status">Carregando suas contas…</p>
          : selectedId && !client ? <p className="crm-ia-state" role="alert">Esta conta não está disponível para sua sessão. Selecione outra conta.</p>
            : !client ? <section className="crm-ia-content crm-ia-accounts" aria-label="Seleção de conta"><div className="crm-ia-accounts-panel">
              <div className="crm-ia-accounts-heading"><div><h2>Suas contas</h2><p aria-label="Resultado da busca de contas" role="status">{accountRows.length === bootstrap.clients.length ? `${accountRows.length} ${accountRows.length === 1 ? 'conta' : 'contas'}` : `${accountRows.length} de ${bootstrap.clients.length} contas`}</p></div>
                {bootstrap.clients.length > 0 && <label className="crm-ia-accounts-search"><Search size={16} aria-hidden="true" /><input ref={accountSearchInput} type="search" name="busca_contas" autoComplete="off" aria-label="Buscar contas" placeholder="Buscar uma conta…" value={accountSearch} onChange={event => searchAccounts(event.target.value)} /></label>}
              </div>
              <ul className="crm-ia-account-list" aria-label="Contas disponíveis">{accountRows.map(row => <li key={row.id}>
                <Link className="crm-ia-account-row" aria-label={`Abrir CRM de ${row.empresa || 'Conta sem nome'}`} to={{ pathname: location.pathname, search: new URLSearchParams({ cliente: row.id }).toString() }}>
                  <GestorIaClientAvatar client={row} /><span className="crm-ia-account-name"><strong>{row.empresa || 'Conta sem nome'}</strong></span><span className="crm-ia-account-open">Abrir CRM<ArrowUpRight size={16} aria-hidden="true" /></span>
                </Link>
              </li>)}</ul>
              {!bootstrap.clients.length ? <p className="crm-ia-accounts-empty">Nenhuma conta disponível para seu acesso.</p> : !accountRows.length && <div className="crm-ia-accounts-empty"><p>Nenhuma conta encontrada.</p><button type="button" onClick={() => { searchAccounts(''); accountSearchInput.current?.focus(); }}>Limpar busca</button></div>}
            </div></section>
              : !workspace || workspace.client?.id !== client.id ? <p className="crm-ia-state" role="status">Carregando o CRM desta conta…</p>
                : <CrmIaContent key={client.id} section={activeTab} client={client} workspace={workspace} api={api} profile={profile}
                  onAnalyze={canAnalyze ? analyze : undefined} trackingUrl={modules.rastreamento === true ? buildClientRastreamentoUrl(client.id) : null} showHeader={false} />}
    </main>
  </div>;
}
