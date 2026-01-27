import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '@/App';
import '@/index.css';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { ModuleSettingsProvider } from '@/contexts/ModuleSettingsContext';
import '@/lib/customSupabaseClient';
import { SWRConfig } from 'swr';
import { MotionConfig } from 'framer-motion';
import ErrorBoundary from '@/components/ErrorBoundary';

// Tratamento global de erros não capturados
window.addEventListener('error', (event) => {
  console.error('Erro global capturado:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rejeitada não tratada:', event.reason);
});

// Registrar service worker (opcional)
// Observação:
// - O service worker pode manter versões antigas do bundle em cache
//   e causar erros intermitentes após login (como na página Cadastro Diário),
//   especialmente em navegadores no Windows que são mais agressivos com cache.
// - Por isso, deixamos o registro DESATIVADO por padrão e controlado por
//   variável de ambiente. Para reativar, defina VITE_ENABLE_SW=true.
const enableServiceWorker = import.meta.env.VITE_ENABLE_SW === 'true';

if (enableServiceWorker && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        // Não é crítico se o service worker falhar
        console.log('SW registration failed (não crítico): ', registrationError);
      });
  });
}

// Verificar se o elemento root existe
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Elemento #root não encontrado no DOM!');
  document.body.innerHTML = '<div style="padding: 20px; font-family: sans-serif;"><h1>Erro Crítico</h1><p>Elemento #root não encontrado. Verifique se o HTML está correto.</p></div>';
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <ErrorBoundary>
        <HashRouter>
          <MotionConfig reducedMotion="always">
            <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: false, revalidateOnMount: false }}>
              <AuthProvider>
                <ModuleSettingsProvider>
                  <App />
                </ModuleSettingsProvider>
              </AuthProvider>
            </SWRConfig>
          </MotionConfig>
        </HashRouter>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('Erro ao renderizar aplicação:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h1 style="color: red;">Erro ao Carregar Aplicação</h1>
        <p>Erro: ${error.message}</p>
        <p>Verifique o console do navegador (F12) para mais detalhes.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Recarregar Página
        </button>
      </div>
    `;
  }
}