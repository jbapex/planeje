import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GestorIaWorkspace from '@/components/gestor-ia/GestorIaWorkspace';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';

const attribution = ['4395', '4396'].includes(location.port);
createRoot(document.getElementById('root')).render(<BrowserRouter>
  <div style={{ padding: '7px 14px', background: '#fff3cb', color: '#66501f', fontSize: 11 }}>{attribution
    ? 'REPRODUÇÃO SINTÉTICA DOS AGREGADOS MEDIDOS EM 12/11 · nenhum dado real carregado · 78 entradas · 22 agendados: 15 novos / 7 antigos · somente quatro agendados atribuídos'
    : 'PRÉVIA NEURO ISOLADA · dados sintéticos · PostgreSQL descartável · data do ensaio: 16/11/2026'}</div>
  <Routes><Route path="/gestor-ia/*" element={<GestorIaWorkspace />} /><Route path="*" element={<Navigate to="/gestor-ia/rotina?semana=2026-11-09" replace />} /></Routes>
  <Toaster />
</BrowserRouter>);
