import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import TrafegoOperacaoApp from '@/components/traffic/TrafegoOperacaoApp';
import { parsePaidTrafficRoute } from '@/lib/paidTrafficRoutes';
import '@/components/traffic/TrafegoOperacao.css';

export default function TrafegoPreviewPage() {
  const location = useLocation();
  const route = parsePaidTrafficRoute(location.pathname);
  const tab = route.trafficTab || 'visao';
  const previewLoader = useCallback(async () => {
    const mod = await import('@/dev/trafegoPreviewFixtures.js');
    const rows = mod.trafegoPreviewRawClients();
    return { rows, tasks: mod.trafegoPreviewTasks(rows) };
  }, []);

  return (
    <div className="trafego-preview-app">
      <header className="trafego-preview-topbar">
        <span aria-hidden />
        Planeje
      </header>
      <p className="trafego-op-banner">Preview local · fixtures isoladas · não entra no runtime de produção</p>
      <TrafegoOperacaoApp
        tab={tab}
        basePath="/paid-traffic/preview"
        preview
        previewLoader={previewLoader}
        clientId={route.clientId}
      />
    </div>
  );
}
