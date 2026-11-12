import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, Columns, Copy, MessagesSquare, Radio, Settings, Sparkles, Users, Zap } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { buildClientRastreamentoUrl } from '@/lib/clientHubRoutes';
import { useAtlasEntryAccess } from '@/components/AtlasEntry';
import GestorIaSidebar from '@/components/gestor-ia/GestorIaSidebar';
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
    <main className={`gia-workspace crm-ia-main${activeTab === 'conversas' ? ' is-conversations' : ''}`} id="crm-ia-main">
      <header className="crm-ia-page-header crm-ia-workspace-header"><div><h1>{title}</h1><p>{description}</p></div>{accountPicker}</header>
      {error ? <section className="crm-ia-state" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>Tentar novamente</button></section>
        : !bootstrap ? <p className="crm-ia-state" role="status">Carregando suas contas…</p>
          : selectedId && !client ? <p className="crm-ia-state" role="alert">Esta conta não está disponível para sua sessão. Selecione outra conta.</p>
            : !client ? <section className="crm-ia-stack"><div className="crm-ia-card"><h2>Suas contas</h2><p>Abra o escritório ou cliente que deseja acompanhar.</p></div>
              <div className="crm-ia-template-grid">{bootstrap.clients.map(row => <article key={row.id} className="crm-ia-card"><h2>{row.empresa}</h2><button type="button" onClick={() => chooseClient(row.id)}>Abrir CRM</button></article>)}</div>
              {!bootstrap.clients.length && <p className="crm-ia-state">Nenhuma conta disponível para seu acesso.</p>}</section>
              : !workspace || workspace.client?.id !== client.id ? <p className="crm-ia-state" role="status">Carregando o CRM desta conta…</p>
                : <CrmIaContent key={client.id} section={activeTab} client={client} workspace={workspace} api={api} profile={profile}
                  onAnalyze={canAnalyze ? analyze : undefined} trackingUrl={modules.rastreamento === true ? buildClientRastreamentoUrl(client.id) : null} showHeader={false} />}
    </main>
  </div>;
}
