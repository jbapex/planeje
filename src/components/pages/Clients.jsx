import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Plus, List, LayoutGrid, Filter, Users as UsersIcon } from 'lucide-react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import ClientForm from '@/components/forms/ClientForm';
    import ClientProgress from '@/components/clients/ClientProgress';
    import ClientesLista from '@/components/clients/ClientesLista';
    import ClientesCards from '@/components/clients/ClientesCards';
    import ClientDocumentEditor from '@/components/clients/ClientDocumentEditor';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
    import { useDataCache } from '@/hooks/useDataCache';

    const ETAPAS = [
      { value: 'prospect', label: 'Prospect', color: 'bg-gray-400' },
      { value: 'qualification', label: 'Qualificação', color: 'bg-blue-500' },
      { value: 'proposal', label: 'Proposta', color: 'bg-yellow-500' },
      { value: 'negotiation', label: 'Negociação', color: 'bg-orange-500' },
      { value: 'closed', label: 'Fechado', color: 'bg-green-500' },
      { value: 'lost', label: 'Perdido', color: 'bg-red-500' }
    ];

    const ETIQUETAS = [
      { value: 'vip', label: 'VIP', color: 'bg-purple-500' },
      { value: 'inativo', label: 'Inativo', color: 'bg-gray-600' },
      { value: 'novo', label: 'Novo', color: 'bg-cyan-500' },
    ];

    const Clients = () => {
      const [clients, setClients] = useState([]);
      const [users, setUsers] = useState([]);
      const [viewMode, setViewMode] = useState('list');
      const [editingClient, setEditingClient] = useState(null);
      const [showProgress, setShowProgress] = useState(false);
      const [selectedClientForProgress, setSelectedClientForProgress] = useState(null);
      const [showDocument, setShowDocument] = useState(false);
      const [selectedClientForDoc, setSelectedClientForDoc] = useState(null);
      const [loading, setLoading] = useState(true);
      const [etapaFilter, setEtapaFilter] = useState('all');
      const [etiquetaFilter, setEtiquetaFilter] = useState([]);
      const [selectedClients, setSelectedClients] = useState([]);
      const [isFirstMount, setIsFirstMount] = useState(true);

      const { toast } = useToast();
      const { user, profile, loading: authLoading } = useAuth();
      const { moduleAccess } = useModuleSettings();
      const { id: clientIdFromUrl } = useParams();
      const navigate = useNavigate();
      
      const userRole = profile?.role;
      const clientsAccessLevel = moduleAccess.clients || 'all';
      
      // Hook de cache com chave única por usuário e role
      const cacheKey = `clients_${user?.id}_${userRole}_${clientsAccessLevel}`;
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
      
      // Marca primeira montagem para evitar animações em remount
      useEffect(() => {
        if (isFirstMount) {
          const timer = setTimeout(() => setIsFirstMount(false), 100);
          return () => clearTimeout(timer);
        }
      }, [isFirstMount]);

      const fetchClients = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        
        let query = supabase.from('clientes').select('*').order('created_at', { ascending: false });

        if (userRole === 'colaborador' && clientsAccessLevel === 'responsible') {
          query = query.eq('responsavel', user.id);
        }
        
        const { data: clientsData, error: clientsError } = await query;
        const { data: usersData, error: usersError } = await supabase.from('profiles').select('id, full_name, avatar_url');

        if (clientsError || usersError) {
          toast({ title: "Erro ao buscar dados", description: clientsError?.message || usersError?.message, variant: "destructive" });
        } else {
          // Salva no cache
          const dataToCache = {
            clients: clientsData.map(c => ({...c, etiquetas: c.etiquetas || [] })),
            users: usersData || []
          };
          setCachedData(dataToCache);
          setClients(dataToCache.clients);
          setUsers(dataToCache.users);
        }
        setLoading(false);
      }, [toast, user, userRole, clientsAccessLevel, setCachedData]);

      useEffect(() => {
        if (authLoading || !user) return;
        
        // Se tem cache válido (últimos 30 segundos), usa ele
        if (!shouldFetch() && cachedData) {
          setClients(cachedData.clients);
          setUsers(cachedData.users);
          setLoading(false);
          return; // Não faz fetch!
        }

        // Se não tem cache ou está expirado, faz fetch
        fetchClients();
      }, [fetchClients, authLoading, user, shouldFetch, cachedData, setCachedData]);

      useEffect(() => {
        if (clientIdFromUrl) {
          if (clientIdFromUrl === 'new') {
            setEditingClient(null);
          } else if (clients.length > 0) {
            const client = clients.find(c => c.id === clientIdFromUrl);
            if (client) {
              setEditingClient(client);
            } else {
              toast({ title: "Cliente não encontrado", variant: "destructive" });
              navigate('/clients');
            }
          }
        } else {
          setEditingClient(null);
        }
      }, [clientIdFromUrl, clients, navigate, toast]);

      const handleSaveClient = async (clientData, isNew) => {
        const dataToSave = {
          ...clientData,
          owner_id: user.id,
          vencimento: clientData.vencimento || null,
          valor: clientData.valor || null,
        };
        
        if (isNew) {
          dataToSave.client_document = '<p>Este é o documento do seu novo cliente. Adicione aqui senhas, links importantes, e-mails e qualquer outra informação relevante.</p>';
        }

        if (isNew) {
          const { error } = await supabase.from('clientes').insert(dataToSave);
          if (error) toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
          else toast({ title: "Cliente criado com sucesso!" });
        } else {
          const { error } = await supabase.from('clientes').update(dataToSave).eq('id', editingClient.id);
          if (error) toast({ title: "Erro ao atualizar cliente", description: error.message, variant: "destructive" });
          else toast({ title: "Cliente atualizado com sucesso!" });
        }
        setCachedData(null); // Limpa cache para forçar refresh
        fetchClients();
        navigate('/clients');
      };

      const handleUpdateClientField = async (clientId, field, value) => {
        const { error } = await supabase.from('clientes').update({ [field]: value || null }).eq('id', clientId);
        if (error) {
          toast({ title: `Erro ao atualizar ${field}`, description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Cliente atualizado!" });
          setCachedData(null); // Limpa cache para forçar refresh
          fetchClients();
        }
      };

      const handleOpenForm = (client = null) => {
        if (client) {
          navigate(`/clients/${client.id}`);
        } else {
          navigate('/clients/new');
        }
      };
      
      const handleCloseForm = () => {
        navigate('/clients');
      };

      const handleOpenProgress = (client) => {
        setSelectedClientForProgress(client);
        setShowProgress(true);
      };
      
      const handleOpenDocument = (client) => {
        setSelectedClientForDoc(client);
        setShowDocument(true);
      };

      const filteredClients = useMemo(() => {
        return clients.filter(client => {
          const etapaMatch = etapaFilter === 'all' || client.etapa === etapaFilter;
          const etiquetaMatch = etiquetaFilter.length === 0 || etiquetaFilter.every(tag => client.etiquetas?.includes(tag));
          return etapaMatch && etiquetaMatch;
        });
      }, [clients, etapaFilter, etiquetaFilter]);

      const isFormOpen = !!clientIdFromUrl;

      return (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Gestão de Clientes</h1>
            <div className="flex items-center gap-2">
              {(userRole === 'superadmin' || userRole === 'admin') && (
                <Button onClick={() => handleOpenForm()} className="bg-gradient-to-r from-orange-500 to-purple-600 text-white">
                  <Plus size={16} className="mr-2" />Novo Cliente
                </Button>
              )}
              <div className="flex items-center rounded-md bg-gray-200 dark:bg-gray-700 p-1">
                <Button size="sm" variant={viewMode === 'list' ? 'primary' : 'ghost'} onClick={() => setViewMode('list')} className={`px-3 py-1 h-auto ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}>
                  <List size={16} />
                </Button>
                <Button size="sm" variant={viewMode === 'cards' ? 'primary' : 'ghost'} onClick={() => setViewMode('cards')} className={`px-3 py-1 h-auto ${viewMode === 'cards' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}>
                  <LayoutGrid size={16} />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Filter className="text-gray-500 dark:text-gray-400" />
            <Select value={etapaFilter} onValueChange={setEtapaFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por etapa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Etapas</SelectItem>
                {ETAPAS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start">
                  Etiquetas {etiquetaFilter.length > 0 && `(${etiquetaFilter.length})`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar etiquetas..." />
                  <CommandEmpty>Nenhuma etiqueta encontrada.</CommandEmpty>
                  <CommandGroup>
                    {ETIQUETAS.map(option => (
                      <CommandItem key={option.value} onSelect={() => {
                        setEtiquetaFilter(prev => prev.includes(option.value) ? prev.filter(v => v !== option.value) : [...prev, option.value]);
                      }}>
                        <div className={`mr-2 h-2 w-2 rounded-full ${option.color}`} />
                        <span>{option.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={viewMode} initial={isFirstMount ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {loading || authLoading ? <p className="text-center py-10 text-gray-700 dark:text-gray-300">Carregando clientes...</p> : 
               filteredClients.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <UsersIcon className="mx-auto text-gray-400 dark:text-gray-500 mb-4" size={48} />
                  <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">Nenhum cliente encontrado</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">{userRole === 'colaborador' ? 'Você ainda não é responsável por nenhum cliente.' : 'Tente ajustar os filtros ou adicione um novo cliente.'}</p>
                </div>
               ) :
               viewMode === 'list' ? (
                <ClientesLista 
                  clients={filteredClients}
                  users={users}
                  onEdit={handleOpenForm} 
                  onUpdateField={handleUpdateClientField}
                  onAddClient={() => handleOpenForm()}
                  onOpenDocument={handleOpenDocument}
                  selectedClients={selectedClients}
                  setSelectedClients={setSelectedClients}
                  fetchClients={fetchClients}
                  userRole={userRole}
                />
              ) : (
                <ClientesCards 
                  clients={filteredClients} 
                  onEdit={handleOpenForm} 
                  onProgress={handleOpenProgress}
                  onOpenDocument={handleOpenDocument}
                  fetchClients={fetchClients}
                  userRole={userRole}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {isFormOpen && <ClientForm client={editingClient} users={users} onSave={handleSaveClient} onClose={handleCloseForm} />}
          </AnimatePresence>
          <AnimatePresence>
            {showProgress && selectedClientForProgress && <ClientProgress client={selectedClientForProgress} onClose={() => { setShowProgress(false); setSelectedClientForProgress(null); }} />}
          </AnimatePresence>
           <AnimatePresence>
            {showDocument && selectedClientForDoc && <ClientDocumentEditor client={selectedClientForDoc} onSaveSuccess={fetchClients} onClose={() => { setShowDocument(false); setSelectedClientForDoc(null); }} />}
          </AnimatePresence>
        </div>
      );
    };

    export default Clients;