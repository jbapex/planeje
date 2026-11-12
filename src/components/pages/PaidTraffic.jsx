import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HelpCircle, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CampaignOverview from '@/components/traffic/CampaignOverview';
import MetaInsights from '@/components/traffic/MetaInsights';
import GoogleAdsInsights from '@/components/traffic/GoogleAdsInsights';
import CampaignStatusSettings from '@/components/traffic/CampaignStatusSettings';
import { supabase } from '@/lib/customSupabaseClient';
import FloatingTrafficAssistant from '@/components/traffic/FloatingTrafficAssistant';
import TrafegoDashboard from '@/components/traffic/TrafegoDashboard';
import TrafegoCarteiraDashboard from '@/components/traffic/TrafegoCarteiraDashboard';
import CentralTrafegoHoje from '@/components/traffic/CentralTrafegoHoje';
import CentralTrafegoSituacao from '@/components/traffic/CentralTrafegoSituacao';
import TrafficWeeklyRoutine from '@/components/traffic/TrafficWeeklyRoutine';
import TrafficPerformanceReport from '@/components/traffic/TrafficPerformanceReport';
import { parsePaidTrafficRoute, paidTrafficPaths } from '@/lib/paidTrafficRoutes';
import { canSeeGoogleAdsTab, paidTrafficHomePath } from '@/lib/carteiraGestor';
import { useCentralTrafegoFlag } from '@/hooks/useCentralTrafegoFlag';
import WorkspaceHeaderTools from '@/components/layout/WorkspaceHeaderTools';
import '@/components/traffic/TrafegoHub.css';

function trafficHeroCopy(tab) {
  if (tab === 'rotina') return { kicker: 'Central de tráfego', title: 'Rotina semanal' };
  if (tab === 'relatorio') return { kicker: 'Central de tráfego', title: 'Relatório' };
  if (tab === 'dashboard') {
    return { kicker: 'Central de tráfego', title: 'Dashboard' };
  }
  if (tab === 'hoje') {
    return { kicker: 'Central de tráfego', title: 'Hoje' };
  }
  if (tab === 'situacao') {
    return { kicker: 'Central de tráfego', title: 'Situação da carteira' };
  }
  if (tab === 'fila') {
    return { kicker: 'Operação de tráfego', title: 'Painel' };
  }
  if (tab === 'meta-insights') {
    return { kicker: 'Mídia paga', title: 'Insights' };
  }
  if (tab === 'google-insights') {
    return { kicker: 'Mídia paga', title: 'Google Ads' };
  }
  return { kicker: 'Mídia paga', title: 'Solicitações' };
}

const PaidTraffic = ({ isCreating = false }) => {
  const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
  const [googleConnectionStatus, setGoogleConnectionStatus] = useState('disconnected');
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasGoogleAccounts, setHasGoogleAccounts] = useState(null);

  const { profile } = useAuth();
  const { showCentral, loaded: flagLoaded } = useCentralTrafegoFlag();
  const navigate = useNavigate();
  const location = useLocation();

  const route = useMemo(() => parsePaidTrafficRoute(location.pathname), [location.pathname]);

  useEffect(() => {
    if (route.redirectTo) {
      navigate(route.redirectTo, { replace: true });
    }
  }, [route.redirectTo, navigate]);

  useEffect(() => {
    if (!flagLoaded) return;
    if (!showCentral && (route.trafficTab === 'hoje' || route.trafficTab === 'situacao')) {
      navigate(paidTrafficPaths.dashboard(), { replace: true });
      return;
    }
    const path = (location.pathname || '').replace(/\/+$/, '') || '/paid-traffic';
    if (path === '/paid-traffic') {
      navigate(paidTrafficHomePath({ showCentral, profile }), { replace: true });
    }
  }, [flagLoaded, showCentral, route.trafficTab, navigate, location.pathname, profile]);

  useEffect(() => {
    if (isCreating) {
      navigate(paidTrafficPaths.campaignNew(), { replace: true });
    }
  }, [isCreating, navigate]);

  const checkConnectionStatus = useCallback(async () => {
    setIsCheckingConnection(true);
    try {
      const [metaRes, googleRes] = await Promise.all([
        supabase.functions.invoke('meta-ads-api', { body: { action: 'check-connection' } }),
        supabase.functions.invoke('google-ads-api', { body: { action: 'check-connection' } }),
      ]);
      const metaData = metaRes.data;
      const googleData = googleRes.data;

      if (metaRes.error || metaData?.error || !metaData?.connected) {
        setMetaConnectionStatus('disconnected');
      } else {
        setMetaConnectionStatus('connected');
      }

      if (googleRes.error || googleData?.error || !googleData?.connected) {
        setGoogleConnectionStatus('disconnected');
      } else {
        setGoogleConnectionStatus('connected');
      }
    } catch {
      setMetaConnectionStatus('disconnected');
      setGoogleConnectionStatus('disconnected');
    } finally {
      setIsCheckingConnection(false);
    }
  }, []);

  useEffect(() => {
    if (route.trafficTab !== 'rotina') checkConnectionStatus();
  }, [checkConnectionStatus, route.trafficTab]);

  useEffect(() => {
    supabase
      .from('cliente_google_ads_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .then(({ count, error }) => {
        if (error) {
          setHasGoogleAccounts(false);
          return;
        }
        setHasGoogleAccounts(Number(count) > 0);
      });
  }, []);

  useEffect(() => {
    if (flagLoaded && route.trafficTab === 'google-insights' && hasGoogleAccounts === false) {
      navigate(paidTrafficPaths.dashboard(), { replace: true });
    }
  }, [flagLoaded, route.trafficTab, hasGoogleAccounts, navigate]);

  const handleCloseStatusSettings = () => {
    navigate(paidTrafficPaths.campaignsKanban());
    setRefreshKey((prev) => prev + 1);
  };

  const trafficTab = route.trafficTab;
  const [hojeAlive, setHojeAlive] = useState(trafficTab === 'hoje');
  useEffect(() => {
    if (showCentral && trafficTab === 'hoje') setHojeAlive(true);
  }, [showCentral, trafficTab]);
  const hero = trafficHeroCopy(trafficTab);
  const navItem = 'planeje-trafego-nav-item';
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
  const showGoogleTab =
    canSeeGoogleAdsTab(profile) &&
    hasGoogleAccounts !== false &&
    (isCheckingConnection || googleConnectionStatus === 'connected');
  const showInsightsTab = isAdmin;

  useEffect(() => {
    if (!flagLoaded || isAdmin) return;
    if (
      trafficTab === 'campaigns' ||
      trafficTab === 'meta-insights' ||
      trafficTab === 'status-settings'
    ) {
      navigate(paidTrafficHomePath({ showCentral, profile }), { replace: true });
    }
  }, [flagLoaded, isAdmin, trafficTab, navigate, showCentral, profile]);

  useEffect(() => {
    if (!flagLoaded || !canSeeGoogleAdsTab(profile) || trafficTab !== 'google-insights') return;
    if (isCheckingConnection || hasGoogleAccounts === null) return;
    if (hasGoogleAccounts === false || googleConnectionStatus !== 'connected') {
      navigate(paidTrafficPaths.dashboard(), { replace: true });
    }
  }, [flagLoaded, trafficTab, profile, navigate, isCheckingConnection, hasGoogleAccounts, googleConnectionStatus]);

  const onTrafficTabChange = (value) => {
    if (value === 'dashboard') {
      navigate(paidTrafficPaths.dashboard());
    } else if (value === 'hoje') {
      navigate(paidTrafficPaths.hoje());
    } else if (value === 'situacao') {
      navigate(paidTrafficPaths.situacao());
    } else if (value === 'rotina') {
      navigate(paidTrafficPaths.rotina());
    } else if (value === 'relatorio') {
      navigate(paidTrafficPaths.relatorio());
    } else if (value === 'fila') {
      const qs = new URLSearchParams(location.search);
      const next = new URLSearchParams();
      for (const key of ['client_id', 'periodo', 'from', 'to', 'acao']) {
        const v = qs.get(key);
        if (v) next.set(key, v);
      }
      const s = next.toString();
      navigate(s ? `${paidTrafficPaths.fila()}?${s}` : paidTrafficPaths.fila());
    } else if (value === 'meta-insights') {
      navigate(paidTrafficPaths.metaInsights());
    } else if (value === 'google-insights') {
      navigate(paidTrafficPaths.googleInsights());
    } else {
      navigate(paidTrafficPaths.campaignsKanban());
    }
  };

  return (
    <Tabs value={trafficTab} onValueChange={onTrafficTabChange} className="planeje-trafego">
      <section className="planeje-trafego-hero">
        <div className="planeje-trafego-hero-decor" aria-hidden>
          <svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
            <path d="M-40 80 Q 200 200 420 100 T 860 60" />
            <path d="M-60 260 Q 180 340 400 240 T 880 200" opacity="0.7" />
          </svg>
        </div>
        <div className="planeje-trafego-hero-bar">
          <div className="planeje-trafego-hero-brand">
            <p className="planeje-trafego-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              {hero.kicker}
            </p>
            <h1 className="planeje-trafego-title">{hero.title}</h1>
          </div>
          <div className="planeje-trafego-hero-right">
            <WorkspaceHeaderTools tone="hero" />
            {trafficTab === 'campaigns' && (profile?.role === 'superadmin' || profile?.role === 'admin') ? (
              <button type="button" className="planeje-trafego-btn-ghost" onClick={() => navigate(paidTrafficPaths.statusSettings())}>
                <Settings className="h-4 w-4" />
                Status
              </button>
            ) : null}
            {(profile?.role === 'superadmin' || profile?.role === 'admin') && (
              <button
                type="button"
                className="planeje-trafego-btn-ghost"
                onClick={() => navigate(profile?.role === 'superadmin' ? '/settings/meta' : '/meta-integration-help')}
                aria-label="Configurar integração do Meta"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <TabsList className="planeje-trafego-nav !bg-white/10 !text-white !h-auto !justify-start">
          {showCentral ? <TabsTrigger value="hoje" className={navItem}>Hoje</TabsTrigger> : null}
          <TabsTrigger value="rotina" className={navItem}>Rotina semanal</TabsTrigger>
          <TabsTrigger value="relatorio" className={navItem}>Relatório</TabsTrigger>
          <TabsTrigger value="dashboard" className={navItem}>Dashboard</TabsTrigger>
          {showCentral ? <TabsTrigger value="situacao" className={navItem}>Situação</TabsTrigger> : null}
          <TabsTrigger value="fila" className={navItem}>Painel</TabsTrigger>
          {isAdmin ? <TabsTrigger value="campaigns" className={navItem}>Solicitações</TabsTrigger> : null}
          {showInsightsTab ? (
            <TabsTrigger
              value="meta-insights"
              className={navItem}
              disabled={isCheckingConnection || metaConnectionStatus !== 'connected'}
            >
              Insights
            </TabsTrigger>
          ) : null}
          {showGoogleTab ? (
            <TabsTrigger value="google-insights" className={navItem}>
              Google Ads
            </TabsTrigger>
          ) : null}
        </TabsList>
      </section>

      <div className="planeje-trafego-workbench">
        <div className="planeje-trafego-body">
          {trafficTab === 'rotina' ? (
            <TabsContent value="rotina"><TrafficWeeklyRoutine /></TabsContent>
          ) : null}
          {trafficTab === 'relatorio' ? (
            <TabsContent value="relatorio"><TrafficPerformanceReport /></TabsContent>
          ) : null}
          {trafficTab === 'dashboard' ? (
            <TabsContent value="dashboard">
              <TrafegoCarteiraDashboard />
            </TabsContent>
          ) : null}
          {showCentral && hojeAlive ? (
            <TabsContent value="hoje" forceMount className="hoje-keep-alive">
              <CentralTrafegoHoje />
            </TabsContent>
          ) : null}
          {showCentral && trafficTab === 'situacao' ? (
            <TabsContent value="situacao">
              <CentralTrafegoSituacao />
            </TabsContent>
          ) : null}
          {trafficTab === 'fila' ? (
            <TabsContent value="fila">
              <TrafegoDashboard />
            </TabsContent>
          ) : null}
          <TabsContent value="campaigns">
            <CampaignOverview key={refreshKey} />
          </TabsContent>
          <TabsContent value="meta-insights">
            {isCheckingConnection ? (
              <p className="text-center py-10 text-muted-foreground">Verificando conexão com o Meta…</p>
            ) : metaConnectionStatus === 'connected' ? (
              trafficTab === 'meta-insights' ? <MetaInsights /> : null
            ) : (
              <p className="text-center py-10 text-muted-foreground">
                A conexão com o Meta Ads não está ativa.
              </p>
            )}
          </TabsContent>
          <TabsContent value="google-insights">
            {isCheckingConnection ? (
              <p className="text-center py-10 text-muted-foreground">Verificando conexão com o Google Ads…</p>
            ) : googleConnectionStatus === 'connected' ? (
              trafficTab === 'google-insights' ? <GoogleAdsInsights /> : null
            ) : (
              <p className="text-center py-10 text-muted-foreground">
                Google Ads ainda não está configurado nesta operação.
              </p>
            )}
          </TabsContent>
        </div>
        <FloatingTrafficAssistant />
      </div>
      {route.overlay === 'status' && <CampaignStatusSettings onClose={handleCloseStatusSettings} />}
    </Tabs>
  );
};

export default PaidTraffic;
