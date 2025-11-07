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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
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
  </>
);