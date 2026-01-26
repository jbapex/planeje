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
    import PaidCampaignForm from '@/components/traffic/PaidCampaignForm';
    import FloatingTrafficAssistant from '@/components/traffic/FloatingTrafficAssistant';
    import { AnimatePresence } from 'framer-motion';

    const PaidTraffic = ({ isCreating = false }) => {
      const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
      const [isCheckingConnection, setIsCheckingConnection] = useState(true);
      const [showStatusSettings, setShowStatusSettings] = useState(false);
      const [showForm, setShowForm] = useState(isCreating);
      const [refreshKey, setRefreshKey] = useState(0);

      const [clients, setClients] = useState([]);
      const [users, setUsers] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [campaigns, setCampaigns] = useState([]);

      const { profile } = useAuth();
      const navigate = useNavigate();
      const { toast } = useToast();

      const fetchDataForForm = useCallback(async () => {
         // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
         // Então removemos perfis de cliente de todas as listas de "usuários".
         const { data: usersData, error: usersError } = await supabase
           .from('profiles')
           .select('id, full_name, avatar_url')
           .neq('role', 'cliente');
          if (usersError) throw usersError;
          setUsers(usersData || []);

          const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
          if (clientsError) throw clientsError;
          setClients(clientsData || []);
          
          const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('id, title, description');
          if (tasksError) throw tasksError;
          setTasks(tasksData || []);
          
           const { data: campaignsData, error: campaignsError } = await supabase.from('paid_campaigns').select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)').order('created_at', { ascending: false });
           if(campaignsError) throw campaignsError;
           setCampaigns(campaignsData || []);

      }, []);

      useEffect(() => {
          if (showForm) {
              fetchDataForForm();
          }
      }, [showForm, fetchDataForForm]);

      // Buscar campanhas para o chat
      const fetchCampaigns = useCallback(async () => {
        try {
          const { data: campaignsData, error: campaignsError } = await supabase
            .from('paid_campaigns')
            .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
            .order('created_at', { ascending: false })
            .limit(100);
          
          if (campaignsError) throw campaignsError;
          setCampaigns(campaignsData || []);
        } catch (error) {
          console.error('Erro ao buscar campanhas:', error);
        }
      }, []);

      useEffect(() => {
        fetchCampaigns();
      }, [fetchCampaigns]);


      const checkConnectionStatus = useCallback(async () => {
        setIsCheckingConnection(true);
        try {
          const { data, error } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'check-connection' },
          });
          if (error || data.error || !data.connected) {
            setMetaConnectionStatus('disconnected');
            if (profile?.role === 'superadmin') {
                toast({
                    title: "Conexão com Meta Ads inativa",
                    description: "O token de acesso do System User não foi configurado ou é inválido. Configure-o no Vault.",
                    variant: "destructive",
                });
            }
          } else {
            setMetaConnectionStatus('connected');
          }
        } catch (error) {
            setMetaConnectionStatus('disconnected');
        } finally {
            setIsCheckingConnection(false);
        }
      }, [profile?.role, toast]);

      useEffect(() => {
        checkConnectionStatus();
      }, [checkConnectionStatus]);
      
      useEffect(() => {
        setShowForm(isCreating);
      }, [isCreating]);

      const handleCloseStatusSettings = () => {
        setShowStatusSettings(false);
        setRefreshKey(prev => prev + 1);
      };

      const handleCloseForm = () => {
        setShowForm(false);
        if(isCreating) {
            navigate('/paid-traffic');
        }
      };

      const handleSaveCampaign = async (formData) => {
        const { error } = await supabase.rpc('create_ad_from_structure', { form_data: formData });

        if (error) {
          toast({ title: `Erro ao salvar estrutura`, description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Estrutura da campanha salva com sucesso!` });
          handleCloseForm();
          setRefreshKey(prev => prev + 1);
        }
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
          <AnimatePresence>
            {showForm && (
              <PaidCampaignForm
                clients={clients}
                users={users}
                tasks={tasks}
                onSave={handleSaveCampaign}
                onClose={handleCloseForm}
                campaigns={campaigns}
                onDataChange={fetchDataForForm}
              />
            )}
          </AnimatePresence>
          <FloatingTrafficAssistant />
        </div>
      );
    };

    export default PaidTraffic;