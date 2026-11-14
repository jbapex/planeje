import React from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter,Routes,Route,Link,Navigate} from 'react-router-dom';
import MainLayoutCliente from '@/components/layout/MainLayoutCliente';
import CrmIaClientWorkspace from '@/components/crm-ia/CrmIaClientWorkspace';
import ClientUserManager from '@/components/admin/ClientUserManager';
import {PREVIEW_IDS,rejectPreviewNetwork} from '../preview/fixture';
import {events} from './session';
import '@/index.css';
window.fetch=rejectPreviewNetwork;
document.documentElement.classList.remove('dark');
function Preview(){return <><div role="note" style={{padding:8,background:'#fff4d9',fontSize:12}}>PRÉVIA ISOLADA · dados fictícios · rede externa bloqueada</div><Routes>
 <Route path="/demo-acesso" element={<><ClientUserManager clientId={PREVIEW_IDS.clientA} clientName="Empresa de demonstração" onClose={()=>{}}/><output aria-label="Recibo da prévia">{JSON.stringify(events)}</output></>}/>
 <Route path="/cliente" element={<MainLayoutCliente/>}><Route path="crm-ia/*" element={<CrmIaClientWorkspace/>}/><Route path="support" element={<p>Portal de demonstração · <Link to="/cliente/crm-ia/painel">CRM IA</Link></p>}/></Route>
 <Route path="*" element={<Navigate to="/cliente/crm-ia/painel" replace/>}/>
 </Routes></>;}
createRoot(document.getElementById('root')).render(<HashRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Preview/></HashRouter>);
