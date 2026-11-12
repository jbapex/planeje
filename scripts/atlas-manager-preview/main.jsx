import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import AtlasTeamAssistant from '@/components/atlas/AtlasTeamAssistant';
import AtlasManagerSettings from '@/components/atlas/AtlasManagerSettings';
import {role} from './auth.js';
import '@/components/atlas/AtlasEventPanel.css';
import './style.css';
createRoot(document.getElementById('root')).render(<MemoryRouter><main><small>DEMONSTRAÇÃO FICTÍCIA · sem envio à equipe</small><h1>Atlas organiza a execução</h1><p>Um pedido do cliente vira uma conversa com a conta, depois uma tarefa acompanhada pelo gerente.</p><div className="steps"><span>1 · Entender o pedido</span><span>2 · Alinhar com a conta</span><span>3 · Acompanhar a tarefa</span></div>{role==='owner'?<div className="atlas-events"><AtlasManagerSettings mode="assist"/></div>:<section><h2>Visão da equipe</h2><p>Abra o robô e responda ao pedido. Exemplo: “Samuel vai apurar os dados dos últimos sete dias e anexar o relatório. É apuração interna do atendimento.”</p></section>}<p>Na operação real, dúvidas sobre escopo e verba ficam com o dono. A rotina segue com a equipe.</p></main><AtlasTeamAssistant/></MemoryRouter>);
