import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { useLocation, useNavigate } from 'react-router-dom';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Button } from '@/components/ui/button';
    import { Filter, Plus, RefreshCw, LayoutGrid, List } from 'lucide-react';
    import { cn } from '@/lib/utils';
    import PaidCampaignKanban from '@/components/traffic/PaidCampaignKanban';
    import PaidCampaignList from '@/components/traffic/PaidCampaignList';
    import PaidCampaignForm from '@/components/traffic/PaidCampaignForm';
    import { AnimatePresence } from 'framer-motion';
    import AdRequestForm from '@/components/traffic/AdRequestForm';
    import {
      getKanbanGateSourceStatusValue,
      kanbanMoveRequiresMetaLinkedAd,
      paidCampaignMainAdHasMetaLink,
    } from '@/lib/paidTrafficKanbanRules';
    import { parsePaidTrafficRoute, paidTrafficPaths } from '@/lib/paidTrafficRoutes';
    import { fetchPaidCampaignsWithLinks } from '@/lib/paidCampaignsFetch';

    /** Mesmo estilo das abas em Tarefas (Tasks.jsx) — barra pill + triggers arredondados. */
    const cohortTabBar = cn(
      'inline-flex h-auto w-full flex-shrink-0 flex-wrap items-center justify-center gap-1 rounded-full border border-gray-300/90 bg-gray-200/95 p-1 text-muted-foreground dark:border-gray-600 dark:bg-gray-900'
    );
    const cohortTabTrigger = cn(
      'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-white'
    );

    const CampaignOverview = () => {
      const navigate = useNavigate();
      const location = useLocation();
      const route = useMemo(() => parsePaidTrafficRoute(location.pathname), [location.pathname]);

      const [campaigns, setCampaigns] = useState([]);
      const [statuses, setStatuses] = useState([]);
      const [clients, setClients] = useState([]);
      const [users, setUsers] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [loading, setLoading] = useState(true);
      const [loadingTimeout, setLoadingTimeout] = useState(false);
      const { toast } = useToast();
      const { profile } = useAuth();
      const userRole = profile?.role;

      const [showForm, setShowForm] = useState(false);
      const [showRequestForm, setShowRequestForm] = useState(false);
      const [selectedCampaign, setSelectedCampaign] = useState(null);

      const [clientFilter, setClientFilter] = useState('all');
      const [assigneeFilter, setAssigneeFilter] = useState('all');

      useEffect(() => {
        const id = new URLSearchParams(location.search).get('client_id');
        if (id) setClientFilter(id);
      }, [location.search]);

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
            campaignsRes,
            { data: statusesData, error: statusesError },
            { data: clientsData, error: clientsError },
            { data: usersData, error: usersError },
            { data: tasksData, error: tasksError },
          ] = await Promise.all([
            fetchPaidCampaignsWithLinks({ order: true, limit: 500 }),
            supabase
              .from('paid_campaign_statuses')
              .select('*')
              .order('sort_order', { ascending: true }),
            supabase
              .from('clientes')
              .select('id, empresa')
              .eq('etapa', 'closed')
              .order('empresa', { ascending: true }),
            supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .neq('role', 'cliente')
              .order('full_name', { ascending: true }),
            supabase
              .from('tarefas')
              .select('id, title, description, type, client_id')
              .eq('type', 'paid_traffic'),
          ]);

          if (campaignsRes.error) throw campaignsRes.error;
          setCampaigns(campaignsRes.data || []);

          if(statusesError) throw statusesError;
          setStatuses(statusesData || []);

          if (clientsError) throw clientsError;
          setClients(clientsData || []);

          if (usersError) throw usersError;
          setUsers(usersData || []);

          if (!tasksError && tasksData) {
            setTasks(tasksData || []);
          } else if (tasksError) {
            console.warn('Erro ao carregar tarefas (paid_traffic):', tasksError);
            setTasks([]);
          }

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

      const navigateToCampaignBase = useCallback(() => {
        navigate(
          route.campaignView === 'list' ? paidTrafficPaths.campaignsList() : paidTrafficPaths.campaignsKanban()
        );
      }, [navigate, route.campaignView]);

      useEffect(() => {
        if (route.trafficTab !== 'campaigns') return;

        const openEdit = async (id) => {
          let c = campaigns.find((x) => x.id === id);
          if (!c) {
            const { data, error } = await fetchPaidCampaignsWithLinks({ eqId: id });
            if (!error && data) c = data;
          }
          if (c) {
            setSelectedCampaign(c);
            setShowForm(true);
          } else {
            toast({ title: 'Campanha não encontrada', variant: 'destructive' });
            navigateToCampaignBase();
          }
        };

        switch (route.overlay) {
          case 'form-new':
            setSelectedCampaign(null);
            setShowForm(true);
            setShowRequestForm(false);
            break;
          case 'form-edit':
            if (route.editCampaignId) {
              setShowRequestForm(false);
              openEdit(route.editCampaignId);
            }
            break;
          case 'request':
            setShowForm(false);
            setSelectedCampaign(null);
            setShowRequestForm(true);
            break;
          default:
            setShowForm(false);
            setShowRequestForm(false);
            setSelectedCampaign(null);
        }
      }, [route.trafficTab, route.overlay, route.editCampaignId, navigateToCampaignBase, toast]);

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
        const campaign = campaigns.find((c) => c.id === campaignId);
        if (!campaign) return false;

        if (
          kanbanMoveRequiresMetaLinkedAd(statuses, campaign.status, newStatus) &&
          !paidCampaignMainAdHasMetaLink(campaign)
        ) {
          const gateValue = getKanbanGateSourceStatusValue(statuses);
          const gateLabel = statuses.find((s) => s.value === gateValue)?.label || 'etapa inicial';
          toast({
            title: 'Vínculo Meta obrigatório',
            description: `Para sair de «${gateLabel}», abra os detalhes do anúncio e use «Vincular anúncio Meta Ads» (conta, campanha, conjunto e anúncio). Sem isso não é possível comprovar que o anúncio foi associado à conta.`,
            variant: 'destructive',
          });
          return false;
        }

        // ATUALIZAÇÃO OTIMISTA: atualiza o estado local imediatamente para feedback visual instantâneo
        const originalCampaigns = [...campaigns];

        setCampaigns((currentCampaigns) =>
          currentCampaigns.map((c) => (c.id === campaignId ? { ...c, status: newStatus } : c))
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
          return false;
        }
        // A subscription do Realtime vai atualizar automaticamente para todos os usuários
        setCampaigns((currentCampaigns) =>
          currentCampaigns.map((c) => (c.id === updatedCampaign.id ? { ...c, ...updatedCampaign } : c))
        );
        return true;
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

      const handleOpenForm = (campaign = null) => {
        const view = route.campaignView === 'list' ? 'list' : 'kanban';
        if (campaign?.id) {
          navigate(paidTrafficPaths.campaignEdit(campaign.id, view));
        } else {
          navigate(paidTrafficPaths.campaignNew(view));
        }
      };

      const handleCloseForm = () => {
        setShowForm(false);
        setSelectedCampaign(null);
        navigateToCampaignBase();
      };

      const handleSaveCampaign = async (formData) => {
        const { error } = await supabase.rpc('create_ad_from_structure', { form_data: formData });

        if (error) {
          toast({ title: `Erro ao salvar estrutura`, description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Estrutura da campanha salva com sucesso!` });
          navigateToCampaignBase();
          fetchData();
        }
      };

      const handleOpenRequestForm = () => {
        const view = route.campaignView === 'list' ? 'list' : 'kanban';
        navigate(paidTrafficPaths.request(view));
      };

      const handleCloseRequestForm = () => {
        setShowRequestForm(false);
        navigateToCampaignBase();
      };

      const trafficTasks = useMemo(() => {
          return tasks.filter(task => task.type === 'paid_traffic');
      }, [tasks]);

      const tasksById = useMemo(() => {
        return Object.fromEntries(trafficTasks.map((t) => [t.id, t]));
      }, [trafficTasks]);

      const commonProps = {
        campaigns: filteredCampaigns,
        statuses,
        onOpenDetails: handleOpenForm,
        onDelete: handleDelete,
        onUpdateStatus: handleUpdateStatus,
        userRole,
        tasksById,
        users,
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
          
            <Tabs
              value={route.campaignView}
              onValueChange={(v) =>
                navigate(v === 'list' ? paidTrafficPaths.campaignsList() : paidTrafficPaths.campaignsKanban())
              }
              className="w-full flex-grow flex flex-col overflow-hidden"
            >
                <TabsList className={cohortTabBar}>
                  <TabsTrigger value="kanban" className={cohortTabTrigger}>
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="list" className={cohortTabTrigger}>
                    <List className="h-4 w-4 shrink-0" />
                    Lista
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="kanban" className="mt-2 flex-grow overflow-y-auto">
                  <PaidCampaignKanban {...commonProps} />
                </TabsContent>
                <TabsContent value="list" className="mt-2 flex-grow overflow-y-auto">
                  <PaidCampaignList {...commonProps} />
                </TabsContent>
            </Tabs>
             <AnimatePresence>
                {showForm && (
                  <PaidCampaignForm
                    campaign={selectedCampaign}
                    clients={clients}
                    users={users}
                    tasks={trafficTasks}
                    tasksById={tasksById}
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