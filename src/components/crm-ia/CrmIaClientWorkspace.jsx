import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCrmIaClientAccess } from '@/hooks/useCrmIaClientAccess';
import { supabase } from '@/lib/customSupabaseClient';
import CrmIaAvatar from './CrmIaAvatar';
import CrmIaContent from './CrmIaContent';
import { crmIaRequest } from './crmIaApi';
import './CrmIa.css';

const TABS = [['painel', 'Painel'], ['funil', 'Funil'], ['leads', 'Leads'], ['conversas', 'Conversas'], ['agenda', 'Agenda']];
export default function CrmIaClientWorkspace() {
  const { profile } = useAuth();
  return <ClientCrm key={JSON.stringify([profile?.id, profile?.cliente_id, profile?.status, profile?.allowed_pages])} profile={profile} />;
}
function ClientCrm({ profile }) {
  const access = useCrmIaClientAccess();
  const location = useLocation();
  const [params] = useSearchParams();
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [revoked, setRevoked] = useState(false);
  const clientId = profile?.cliente_id;
  const wrongClient = Boolean(params.get('cliente') && params.get('cliente') !== clientId);
  const section = location.pathname.replace(/\/$/, '').split('/').at(-1);
  const validSection = TABS.some(([id]) => id === section);
  const api = useCallback(async (action, payload) => {
    try { return await crmIaRequest(supabase, action, clientId, payload); }
    catch (failure) { if (failure.code === '42501') setRevoked(true); throw failure; }
  }, [clientId]);
  useEffect(() => {
    let active = true;
    setWorkspace(null); setError('');
    if (!access.enabled || wrongClient || !validSection || revoked) return undefined;
    api('workspace').then(data => { if (active) { if (data?.client?.id === clientId && data.permissions?.customer === true) setWorkspace(data);
      else setError('Não foi possível confirmar o contexto desta conta. Atualize o acesso antes de continuar.'); } })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [clientId, api, access.enabled, access.revision, wrongClient, validSection, revoked, revision]);
  if (access.loading) return <p className="p-6" role="status">Conferindo acesso ao CRM IA…</p>;
  if (!access.enabled || revoked) return <section className="crm-ia-content crm-ia-state"><h1>CRM IA indisponível</h1><p role="alert">{access.error || 'Peça à agência a liberação do CRM IA para sua conta e seu login.'}</p><Link to="/cliente/support">Voltar ao portal</Link></section>;
  if (section === 'crm-ia') return <Navigate to={{ pathname: '/cliente/crm-ia/painel', search: location.search }} replace />;
  if (wrongClient || !validSection) return <section className="crm-ia-content crm-ia-state"><p role="alert">Esta página ou conta não está disponível para seu acesso.</p><Link to="/cliente/crm-ia/painel">Abrir meu CRM IA</Link></section>;
  return <section className="crm-ia-workspace crm-ia-client-workspace">
    <header className="crm-ia-client-header"><CrmIaAvatar /><div><h1>CRM IA</h1><span>{workspace?.client?.empresa || 'Sua operação comercial'}</span></div></header>
    <nav className="crm-ia-client-tabs" aria-label="Páginas do CRM IA">{TABS.map(([id, label]) => <Link key={id} aria-current={section === id ? 'page' : undefined} to={`/cliente/crm-ia/${id}`}>{label}</Link>)}</nav>
    <div className={`crm-ia-main${section === 'conversas' ? ' is-conversations' : ''}`}>
      {error ? <div className="crm-ia-state" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div>
        : !workspace ? <p className="crm-ia-state" role="status">Carregando seu CRM IA…</p>
          : <CrmIaContent section={section} client={workspace.client} workspace={workspace} api={api} profile={profile} showHeader={false} />}
    </div>
  </section>;
}
