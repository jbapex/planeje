import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import CrmIaWorkspace from '@/components/crm-ia/CrmIaWorkspace';
import { fixture, previewState } from './session';
import { PREVIEW_IDS, rejectPreviewNetwork } from './fixture';
import '@/index.css';
import './preview.css';

window.fetch = rejectPreviewNetwork;
window.__crmIaPreview = fixture;
document.documentElement.classList.remove('dark');

function Destination() {
  const location = useLocation();
  const draft = location.state?.crmIaDraft;
  const clientId = draft?.clientId || new URLSearchParams(location.search).get('cliente_id') || PREVIEW_IDS.clientA;
  return <main className="crm-preview-destination"><h1>{draft ? 'Rascunho para o Atlas' : 'Destino da operação oficial'}</h1>
    {draft ? <><p>O CRM preparou o pedido abaixo. Esta prévia não consulta IA ou envia mensagens.</p><textarea aria-label="Rascunho Atlas" readOnly value={draft.message} /></> : <p>{location.pathname}{location.search}</p>}
    <Link to={`/crm-ia/painel?cliente=${encodeURIComponent(clientId)}`}>Voltar ao CRM IA</Link>
  </main>;
}

createRoot(document.getElementById('root')).render(<HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><div className="crm-preview-frame">
  <div className="crm-preview-banner" role="note">PRÉVIA ISOLADA · dados sintéticos · rede externa bloqueada · cenário {previewState}</div>
  <Routes><Route path="/" element={<Navigate replace to={`/crm-ia/painel?cliente=${PREVIEW_IDS.clientA}`} />} />
    <Route path="/crm-ia/*" element={<CrmIaWorkspace />} /><Route path="*" element={<Destination />} /></Routes>
</div></HashRouter>);
