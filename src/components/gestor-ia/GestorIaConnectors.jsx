import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Database, MessageCircle, Megaphone } from 'lucide-react';

function linkStatus(clients, field, busy, error) {
  if (busy) return 'Consultando vínculos…';
  if (error || clients.some((client) => client[field] === null)) return 'Consulta indisponível';
  const count = clients.reduce((sum, client) => sum + (client[field]?.length || 0), 0);
  return count ? `${count} ${count === 1 ? 'vínculo' : 'vínculos'}` : 'Sem vínculos';
}

export default function GestorIaConnectors({ clients, busy, error, modules, role, manageAccounts }) {
  const cards = [
    { name: 'Meta Ads', icon: BarChart3, description: 'Métricas, campanhas e entregas do Gestor.', status: linkStatus(clients, 'metaAccounts', busy, error),
      accountAction: ['contas-meta', 'Gerenciar vínculos Meta'], credentials: role === 'superadmin' && ['/settings/meta', 'Credenciais Meta'] },
    { name: 'Google Ads', icon: Megaphone, description: 'Contas vinculadas e relatório de Google Ads.', status: linkStatus(clients, 'googleAccounts', busy, error),
      accountAction: ['contas-google', 'Gerenciar vínculos Google'], credentials: role === 'superadmin' && ['/settings/google-ads', 'Credenciais Google Ads'] },
    { name: 'Mini CRM', icon: Database, description: 'Leads, agendamentos e vendas da operação.', status: modules?.mini_crm ? 'Módulo disponível' : 'Acesso pelo módulo',
      credentials: modules?.mini_crm === true && ['/mini-crm', 'Abrir Mini CRM'] },
    { name: 'WhatsApp', icon: MessageCircle, description: 'Canais e conversas da operação.', status: modules?.atendimento ? 'Módulo disponível' : 'Acesso pelo módulo',
      credentials: modules?.atendimento === true && ['/conversas/canais', 'Gerenciar canais'] },
  ];

  return <section aria-label="Conectores do Planeje" className="gia-stack">
    <div className="gia-connector-heading"><h2>Integrações do Planeje</h2><p className="gia-caption">Vínculos por cliente e acesso à configuração de cada serviço.</p></div>
    <div className="gia-connector-grid">
      {cards.map(({ name, icon: Icon, description, status, accountAction, credentials }) => <article key={name} className="gia-panel gia-connector-card">
        <header><span className="gia-connector-icon"><Icon aria-hidden="true" /></span><div><h3>{name}</h3><span className="gia-caption">{status}</span></div></header>
        <p>{description}</p>
        <footer>
          {accountAction && manageAccounts && <button type="button" className="gia-action-link" onClick={() => manageAccounts(accountAction[0])}>{accountAction[1]}</button>}
          {credentials && <Link className="gia-action-link" to={credentials[0]}>{credentials[1]}<ArrowUpRight aria-hidden="true" /></Link>}
        </footer>
      </article>)}
    </div>
  </section>;
}
