import React, { useState, useEffect, useCallback } from 'react';
    import { Rocket, HelpCircle, FileBarChart, Settings } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useNavigate, Link } from 'react-router-dom';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import CampaignOverview from '@/components/traffic/CampaignOverview';
    import MetaInsights from '@/components/traffic/MetaInsights';
    import CampaignStatusSettings from '@/components/traffic/CampaignStatusSettings';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';

    const PaidTraffic = () => {
      const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
      const [isCheckingConnection, setIsCheckingConnection] = useState(true);
      const [showStatusSettings, setShowStatusSettings] = useState(false);
      const [refreshKey, setRefreshKey] = useState(0);

      const { profile } = useAuth();
      const navigate = useNavigate();
      const { toast } = useToast();

      const checkConnectionStatus = useCallback(async () => {
        setIsCheckingConnection(true);
        try {
          const { data, error } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'check-connection' },
          });
          
          // Verifica se a Edge Function não existe (404 ou função não encontrada)
          if (error && (error.message?.includes('not found') || error.message?.includes('404') || error.status === 404)) {
            setMetaConnectionStatus('disconnected');
            if (profile?.role === 'superadmin') {
                toast({
                    title: "Edge Function não encontrada",
                    description: "A Edge Function 'meta-ads-api' não está deployada. Veja COMO_DEPLOYAR_EDGE_FUNCTION.md para instruções.",
                    variant: "destructive",
                    duration: 10000,
                });
            }
            return;
          }
          
          if (error || data?.error || !data?.connected) {
            setMetaConnectionStatus('disconnected');
            if (profile?.role === 'superadmin') {
                const errorMessage = data?.error?.message || error?.message || 'Token não configurado ou inválido';
                toast({
                    title: "Conexão com Meta Ads inativa",
                    description: errorMessage.includes('TOKEN_NOT_FOUND') 
                      ? "Token não encontrado no Vault. Configure META_SYSTEM_USER_ACCESS_TOKEN no Supabase Vault."
                      : errorMessage.includes('Invalid token') || errorMessage.includes('invalid')
                      ? "Token inválido ou expirado. Gere um novo token no Meta Business Manager e atualize no Vault."
                      : errorMessage.includes('Permission') || errorMessage.includes('Access denied')
                      ? "System User não tem acesso à conta de anúncio. Atribua a conta no Meta Business Manager."
                      : `Erro: ${errorMessage}. Verifique o token no Vault.`,
                    variant: "destructive",
                    duration: 10000,
                });
            }
          } else {
            setMetaConnectionStatus('connected');
          }
        } catch (error) {
            console.error('Erro ao verificar conexão Meta Ads:', error);
            setMetaConnectionStatus('disconnected');
            if (profile?.role === 'superadmin' && error.message?.includes('not found')) {
                toast({
                    title: "Edge Function não encontrada",
                    description: "A Edge Function 'meta-ads-api' precisa ser deployada. Veja COMO_DEPLOYAR_EDGE_FUNCTION.md",
                    variant: "destructive",
                    duration: 10000,
                });
            }
        } finally {
            setIsCheckingConnection(false);
        }
      }, [profile?.role, toast]);

      useEffect(() => {
        checkConnectionStatus();
      }, [checkConnectionStatus]);
      
      const handleCloseStatusSettings = () => {
        setShowStatusSettings(false);
        setRefreshKey(prev => prev + 1);
      };

      return (
        <div className="space-y-6 h-full flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Rocket className="h-8 w-8 text-blue-500" />
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Gestão de Tráfego</h1>
            </div>
            <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link to="/meta-reporter">
                    <FileBarChart className="mr-2 h-4 w-4" />
                    Relatório Rápido
                  </Link>
                </Button>
                {(profile?.role === 'superadmin' || profile?.role === 'admin') && (
                  <>
                    <Button variant="outline" onClick={() => setShowStatusSettings(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Gerenciar Status
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate('/meta-integration-help')}>
                        <HelpCircle className="h-5 w-5 text-muted-foreground" />
                        <span className="sr-only">Ajuda com a integração do Meta</span>
                    </Button>
                  </>
                )}
            </div>
          </div>

           <Tabs defaultValue="campaigns" className="flex-grow flex flex-col">
            <TabsList className="dark:bg-gray-800">
              <TabsTrigger value="campaigns" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Campanhas Manuais</TabsTrigger>
              <TabsTrigger value="meta-insights" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white" disabled={isCheckingConnection || metaConnectionStatus !== 'connected'}>
                Meta Insights
              </TabsTrigger>
            </TabsList>
            <TabsContent value="campaigns" className="flex-grow mt-4">
              <CampaignOverview key={refreshKey} />
            </TabsContent>
            <TabsContent value="meta-insights" className="flex-grow mt-4">
               {isCheckingConnection ? (
                 <p className="text-center py-10 dark:text-gray-400">Verificando conexão com o Meta...</p>
               ) : metaConnectionStatus === 'connected' ? (
                 <MetaInsights />
               ) : (
                 <p className="text-center py-10 dark:text-gray-400">A conexão com o Meta Ads não está ativa. Por favor, peça a um Super Admin para configurar o token de acesso.</p>
               )}
            </TabsContent>
          </Tabs>
          {showStatusSettings && <CampaignStatusSettings onClose={handleCloseStatusSettings} />}
        </div>
      );
    };

    export default PaidTraffic;