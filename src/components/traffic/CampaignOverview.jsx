import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Button } from '@/components/ui/button';
    import { Filter, Plus, RefreshCw } from 'lucide-react';
    import PaidCampaignKanban from '@/components/traffic/PaidCampaignKanban';
    import PaidCampaignList from '@/components/traffic/PaidCampaignList';
    import ClientMetaList from '@/components/traffic/ClientMetaList';
    import PaidCampaignForm from '@/components/traffic/PaidCampaignForm';
    import { AnimatePresence } from 'framer-motion';
    import AdRequestForm from '@/components/traffic/AdRequestForm';

    const CampaignOverview = () => {
      const [campaigns, setCampaigns] = useState([]);
      const [statuses, setStatuses] = useState([]);
      const [clients, setClients] = useState([]);
      const [users, setUsers] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [loading, setLoading] = useState(true);
      const [loadingTimeout, setLoadingTimeout] = useState(false);
      const [activeTab, setActiveTab] = useState("kanban");
      const { toast } = useToast();
      const { profile } = useAuth();
      const userRole = profile?.role;

      const [showForm, setShowForm] = useState(false);
      const [showRequestForm, setShowRequestForm] = useState(false);
      const [selectedCampaign, setSelectedCampaign] = useState(null);

      const [clientFilter, setClientFilter] = useState('all');
      const [assigneeFilter, setAssigneeFilter] = useState('all');

      const fetchData = useCallback(async () => {
        setLoading(true);
        setLoadingTimeout(false);
        
        // Timeout de segurança: força o loading como false após 15 segundos
        const timeoutId = setTimeout(() => {
          console.warn('Timeout no carregamento de campanhas - forçando loading como false');
          setLoadingTimeout(true);
          setLoading(false);
        }, 15000);
        
        try {
          // Executa todas as queries em PARALELO para melhor performance
          const [
            { data: campaignsData, error: campaignsError },
            { data: statusesData, error: statusesError },
            { data: clientsData, error: clientsError },
            { data: usersData, error: usersError }
          ] = await Promise.all([
            supabase
              .from('paid_campaigns')
              .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
              .order('created_at', { ascending: false })
              .limit(500), // Limite para evitar carregar milhares de campanhas
            supabase
              .from('paid_campaign_statuses')
              .select('*')
              .order('sort_order', { ascending: true }),
            supabase
              .from('clientes')
              .select('id, empresa')
              .order('empresa', { ascending: true }),
            supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .neq('role', 'cliente')
              .order('full_name', { ascending: true })
          ]);

          if(campaignsError) throw campaignsError;
          setCampaigns(campaignsData || []);

          if(statusesError) throw statusesError;
          setStatuses(statusesData || []);

          if (clientsError) throw clientsError;
          setClients(clientsData || []);

          if (usersError) throw usersError;
          setUsers(usersData || []);

          // Tarefas são carregadas apenas quando necessário (lazy loading)
          // Isso melhora significativamente o tempo de carregamento inicial
          setTasks([]);

          clearTimeout(timeoutId);
        } catch (error) {
          console.error('Erro ao buscar dados de campanhas:', error);
          clearTimeout(timeoutId);
          toast({ title: 'Erro ao buscar dados de campanhas', description: error.message, variant: 'destructive' });
        } finally {
          setLoading(false);
          setLoadingTimeout(false);
        }
      }, [toast]);
      
      useEffect(() => {
        fetchData();
      }, [fetchData]);

      // Subscription para atualizações em tempo real - ATUALIZA TODOS OS USUÁRIOS SIMULTANEAMENTE
      useEffect(() => {
        const channelName = `paid-campaigns-changes`;
        const campaignsChannel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*', // Escuta INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'paid_campaigns'
            },
            async (payload) => {
              console.log('🔴 Mudança detectada na tabela paid_campaigns:', payload.eventType, payload.new || payload.old);
              
              if (payload.eventType === 'INSERT') {
                // Nova campanha criada - busca dados relacionados
                const newCampaign = payload.new;
                const { data, error } = await supabase
                  .from('paid_campaigns')
                  .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
                  .eq('id', newCampaign.id)
                  .single();
                
                if (!error && data) {
                  setCampaigns(prev => {
                    // Verifica se a campanha já existe (evita duplicatas)
                    if (prev.find(c => c.id === data.id)) {
                      return prev;
                    }
                    return [data, ...prev];
                  });
                }
              } else if (payload.eventType === 'UPDATE') {
                // Campanha atualizada - ATUALIZAÇÃO IMEDIATA usando payload + busca relacionamentos se necessário
                const updatedCampaign = payload.new;
                
                // Atualiza imediatamente o estado local com os dados do payload
                setCampaigns(prev => {
                  const existingCampaign = prev.find(c => c.id === updatedCampaign.id);
                  if (existingCampaign) {
                    // Mescla os dados atualizados mantendo relacionamentos existentes
                    return prev.map(c => 
                      c.id === updatedCampaign.id 
                        ? { ...c, ...updatedCampaign, clientes: c.clientes, profiles: c.profiles }
                        : c
                    );
                  }
                  // Se não existe, mantém como está (será atualizado pela busca em background)
                  return prev;
                });
                
                // Busca dados relacionados em background para garantir que estão atualizados
                supabase
                  .from('paid_campaigns')
                  .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
                  .eq('id', updatedCampaign.id)
                  .single()
                  .then(({ data, error }) => {
                    if (!error && data) {
                      // Atualiza com dados completos quando disponíveis
                      setCampaigns(prev => prev.map(c => c.id === data.id ? data : c));
                    }
                  });
              } else if (payload.eventType === 'DELETE') {
                // Campanha deletada
                const deletedCampaign = payload.old;
                setCampaigns(prev => prev.filter(c => c.id !== deletedCampaign.id));
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Inscrito nas mudanças em tempo real da tabela paid_campaigns - atualizações serão refletidas para todos os usuários');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Erro ao se inscrever nas mudanças em tempo real de paid_campaigns');
            }
          });

        // Cleanup: remove a subscription quando o componente desmonta
        return () => {
          console.log('🔌 Removendo subscription de paid_campaigns');
          supabase.removeChannel(campaignsChannel);
        };
      }, []);

      const filteredCampaigns = useMemo(() => {
        return campaigns.filter(campaign => {
          const clientMatch = clientFilter === 'all' || campaign.client_id === clientFilter;
          const assigneeMatch = assigneeFilter === 'all' || campaign.assignee_id === assigneeFilter;
          return clientMatch && assigneeMatch;
        });
      }, [campaigns, clientFilter, assigneeFilter]);


      const handleUpdateStatus = async (campaignId, newStatus) => {
        // ATUALIZAÇÃO OTIMISTA: atualiza o estado local imediatamente para feedback visual instantâneo
        const originalCampaigns = [...campaigns];
        
        setCampaigns(currentCampaigns => 
            currentCampaigns.map(c => 
                c.id === campaignId ? { ...c, status: newStatus } : c
            )
        );

        const { data: updatedCampaign, error } = await supabase
            .from('paid_campaigns')
            .update({ status: newStatus })
            .eq('id', campaignId)
            .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
            .single();
        
        if (error) {
            toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
            setCampaigns(originalCampaigns);
        } else {
            // A subscription do Realtime vai atualizar automaticamente para todos os usuários
            // Mas garantimos que o estado local está correto
            setCampaigns(currentCampaigns => 
                currentCampaigns.map(c => 
                    c.id === updatedCampaign.id ? { ...c, ...updatedCampaign } : c
                )
            );
        }
      };

      const handleDelete = async (campaignId) => {
        const { error } = await supabase.from('paid_campaigns').delete().eq('id', campaignId);
        if (error) {
            toast({ title: 'Erro ao excluir campanha', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Campanha excluída com sucesso!' });
            setCampaigns(prev => prev.filter(c => c.id !== campaignId));
        }
      };

      // Carrega tarefas apenas quando o formulário é aberto (lazy loading)
      const loadTasksIfNeeded = useCallback(async () => {
        if (tasks.length === 0) {
          try {
            const { data: tasksData, error: tasksError } = await supabase
              .from('tarefas')
              .select('id, title, description, type, client_id')
              .eq('type', 'paid_traffic'); // Apenas tarefas de tráfego pago
            
            if (!tasksError && tasksData) {
              setTasks(tasksData || []);
            }
          } catch (error) {
            console.error('Erro ao carregar tarefas:', error);
          }
        }
      }, [tasks.length]);

      const handleOpenForm = async (campaign = null) => {
        setSelectedCampaign(campaign);
        // Carrega tarefas apenas quando necessário
        await loadTasksIfNeeded();
        setShowForm(true);
      };

      const handleCloseForm = () => {
        setShowForm(false);
        setSelectedCampaign(null);
      };

      const handleSaveCampaign = async (formData) => {
        const { error } = await supabase.rpc('create_ad_from_structure', { form_data: formData });

        if (error) {
          toast({ title: `Erro ao salvar estrutura`, description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Estrutura da campanha salva com sucesso!` });
          handleCloseForm();
          fetchData();
        }
      };

      const handleOpenRequestForm = () => {
        setShowRequestForm(true);
      };

      const handleCloseRequestForm = () => {
        setShowRequestForm(false);
      };

      const trafficTasks = useMemo(() => {
          return tasks.filter(task => task.type === 'paid_traffic');
      }, [tasks]);

      const commonProps = {
        campaigns: filteredCampaigns,
        statuses,
        onOpenDetails: handleOpenForm,
        onDelete: handleDelete,
        onUpdateStatus: handleUpdateStatus,
        userRole,
      };

      if(loading) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-center py-10 dark:text-gray-400">Carregando campanhas...</p>
            {loadingTimeout && (
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  O carregamento está demorando mais que o esperado.
                </p>
                <Button 
                  onClick={() => {
                    setLoading(false);
                    setLoadingTimeout(false);
                    fetchData();
                  }}
                  variant="outline"
                  className="mt-2"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recarregar
                </Button>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <Filter className="text-gray-500 dark:text-gray-400" size={20} />
                     <Select value={clientFilter} onValueChange={setClientFilter}>
                        <SelectTrigger className="w-[180px] bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"><SelectValue placeholder="Filtrar por cliente" /></SelectTrigger>
                        <SelectContent className="dark:bg-gray-700">
                            <SelectItem value="all">Todos os Clientes</SelectItem>
                            {clients.map(c => <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">{c.empresa}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                        <SelectTrigger className="w-[180px] bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"><SelectValue placeholder="Filtrar por gestor" /></SelectTrigger>
                        <SelectContent className="dark:bg-gray-700">
                            <SelectItem value="all">Todos os Gestores</SelectItem>
                            {users.map(u => <SelectItem key={u.id} value={u.id} className="dark:text-white dark:hover:bg-gray-600">{u.full_name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <Button onClick={handleOpenRequestForm}>
                    <Plus className="mr-2 h-4 w-4" /> Novo Anúncio
                </Button>
            </div>
          
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col">
                <TabsList className="dark:bg-gray-800">
                  <TabsTrigger value="kanban" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Kanban</TabsTrigger>
                  <TabsTrigger value="list" className="dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Lista</TabsTrigger>
                </TabsList>
                <TabsContent value="kanban" className="flex-grow mt-4">
                  <PaidCampaignKanban {...commonProps} />
                </TabsContent>
                <TabsContent value="list" className="flex-grow mt-4">
                  <ClientMetaList />
                </TabsContent>
            </Tabs>
             <AnimatePresence>
                {showForm && (
                  <PaidCampaignForm
                    campaign={selectedCampaign}
                    clients={clients}
                    users={users}
                    tasks={trafficTasks}
                    onSave={handleSaveCampaign}
                    onClose={handleCloseForm}
                    campaigns={campaigns}
                    onDataChange={fetchData}
                  />
                )}
            </AnimatePresence>
             <AnimatePresence>
                {showRequestForm && (
                  <AdRequestForm
                    clients={clients}
                    users={users}
                    onClose={handleCloseRequestForm}
                    onSuccess={() => {
                      fetchData();
                      handleCloseRequestForm();
                    }}
                  />
                )}
            </AnimatePresence>
        </div>
      );
    };

    export default CampaignOverview;