import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import AtlasPage from '@/components/pages/AtlasPage';
import '@/index.css';
import './api.js';

if (!window.location.hash) window.history.replaceState(null, '', '#/assistant/atlas?view=conversation');
function NativeDestination() {
  return <div className="planeje-page-padding"><h1>CRM IA · destino sintético</h1><p>Este link valida somente a navegação. Nenhum serviço nativo foi consultado.</p><Link to={window.__atlasExecutorPreview.conversationUrl()}>Voltar à conversa sintética</Link></div>;
}
createRoot(document.getElementById('root')).render(<HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  <div className="executor-preview-banner"><span><strong>Demonstração sintética.</strong> Dados locais; sem banco, IA ou envios reais.</span><button type="button" onClick={() => window.__atlasExecutorPreview.reset()}>Reiniciar fixture</button></div>
  <div className="executor-preview-shell planeje-app">
    <Sidebar />
    <div className="planeje-main-column flex-1 min-h-0 min-w-0 overflow-hidden"><div className="planeje-content-shell flex flex-1 min-h-0 min-w-0 flex-row overflow-hidden"><div className="planeje-workspace flex-1 min-h-0 min-w-0"><main className="planeje-workspace-main planeje-workspace-main--scroll !p-0">
      <Routes><Route path="/assistant/atlas" element={<AtlasPage />} /><Route path="*" element={<NativeDestination />} /></Routes>
    </main></div></div></div>
    <BottomNav />
  </div>
</HashRouter>);
