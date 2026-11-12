import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmIaLeads from './CrmIaLeads';
import CrmIaAgents from './CrmIaAgents';
import CrmIaConversations from './CrmIaConversations';
import CrmIaAgenda from './CrmIaAgenda';
import CrmIaSettings, { CrmIaTemplates } from './CrmIaSettings';
import CrmIaOverview from './CrmIaOverview';
import { CRM_IA_SECTIONS } from './crmIaPresentation';
import './CrmIa.css';

const METADATA_ACTIONS = new Set(['save_agent', 'publish_agent_draft', 'save_base', 'save_product', 'save_config', 'save_template', 'apply_template', 'save_pipeline', 'save_stage', 'reorder_stages', 'delete_pipeline', 'delete_stage', 'provision']);

export default function CrmIaContent({ section, client, workspace, api, profile, onAnalyze, trackingUrl, showHeader = true }) {
  const [fresh, setFresh] = useState(null);
  const [revision, setRevision] = useState(0);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState('');
  const identity = useRef(client?.id);
  const mounted = useRef(true);
  identity.current = client?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFresh(null); }, [workspace]);
  const current = fresh || workspace;
  const mutate = useCallback(async (action, payload = {}) => {
    const scope = identity.current;
    const saved = await api(action, payload);
    if (!mounted.current || identity.current !== scope) return saved;
    setRevision(value => value + 1);
    if (METADATA_ACTIONS.has(action)) {
      try { const next = await api('workspace'); if (mounted.current && identity.current === scope) { setFresh(next); setError(''); } }
      catch { if (mounted.current && identity.current === scope) setError('A gravação foi confirmada, mas os dados atuais não puderam ser recarregados. Atualize a conta antes de editar novamente.'); }
    }
    return saved;
  }, [api]);
  if (!current || !client) return <p role="status">Selecione uma conta autorizada para abrir o CRM IA.</p>;
  const [title, description] = CRM_IA_SECTIONS[section] || CRM_IA_SECTIONS.painel;
  const props = { api, mutate, workspace: current, client, profile, revision, canManage: current.permissions?.manage === true, onAnalyze, trackingUrl };
  const ready = current.provisioned !== false;
  async function provision() {
    if (provisioning) return;
    setProvisioning(true); setError('');
    try { await mutate('provision', { confirmed: true }); } catch (failure) { setError(failure.message); } finally { setProvisioning(false); }
  }
  return <div className="crm-ia-content">{showHeader && <header className="crm-ia-page-header"><div><h1>{title}</h1><p>{description}</p></div><span className="crm-ia-account-tag">{client.empresa}</span></header>}
    {error && <p className="crm-ia-error" role="alert">{error}</p>}
    {!ready ? <section className="crm-ia-card crm-ia-empty"><h2>Esta conta ainda não tem CRM preparado</h2><p>Prepare os registros comerciais para começar. A autonomia permanece desligada.</p>{current.permissions?.provision === true && <button className="crm-ia-primary" type="button" disabled={provisioning} onClick={provision}>{provisioning ? 'Preparando…' : 'Preparar CRM desta conta'}</button>}</section>
      : section === 'painel' ? <CrmIaOverview {...props} />
        : ['leads', 'funil'].includes(section) ? <CrmIaLeads key={section} {...props} kanban={section === 'funil'} />
          : section === 'conversas' ? <CrmIaConversations {...props} />
            : section === 'agentes' ? <CrmIaAgents {...props} />
              : section === 'agenda' ? <CrmIaAgenda {...props} />
                : section === 'modelos' ? <CrmIaTemplates {...props} />
                  : section === 'configuracoes' ? <CrmIaSettings {...props} />
                    : section === 'disparos' ? <section className="crm-ia-card crm-ia-empty"><span className="crm-ia-badge">Em breve</span><h2>Disparos pela API oficial</h2><p>O envio em massa e os modelos aprovados pela Meta ainda não estão disponíveis neste ambiente.</p><p>Mensagens individuais e agendadas ficam em Conversas.</p></section>
                      : <section className="crm-ia-card"><h2>Origem e conversões no Rastreamento</h2><p>Consulte links, histórico de atribuição e tentativas de conversão na operação oficial desta conta.</p>{current.permissions?.tracking && trackingUrl ? <Link className="crm-ia-link-button crm-ia-primary" to={trackingUrl}>Abrir Rastreamento desta conta</Link> : <p role="status">Rastreamento indisponível para esta sessão.</p>}<hr /><h2>Inspetor de Vendas</h2><p className="crm-ia-muted">Em breve. Nenhuma análise automática ou conversão foi enviada por esta tela.</p></section>}
  </div>;
}
