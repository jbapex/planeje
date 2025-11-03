import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Plus, Filter, Edit, Trash2, ListChecks, MessageSquare as MessageSquareIcon, Bot } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
    import { Badge } from "@/components/ui/badge";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import RequestForm from '@/components/forms/RequestForm';
    import ConvertToTaskDialog from '@/components/requests/ConvertToTaskDialog';
    import { useDataCache } from '@/hooks/useDataCache';

    const STATUS_STYLES = {
      aberta: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700',
      analise: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-700',
      execucao: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-700',
      concluida: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-700',
      rejeitada: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700',
    };

    const PRIORITY_STYLES = {
      alta: 'text-red-600 dark:text-red-400',
      media: 'text-yellow-600 dark:text-yellow-400',
      baixa: 'text-green-600 dark:text-green-400',
    };

    const Requests = () => {
      const [requests, setRequests] = useState([]);
      const [clients, setClients] = useState([]);
      const [projects, setProjects] = useState([]);
      const [clientFilter, setClientFilter] = useState('all');
      const [priorityFilter, setPriorityFilter] = useState('all');
      const [showForm, setShowForm] = useState(false);
      const [editingRequest, setEditingRequest] = useState(null);
      const [convertingRequest, setConvertingRequest] = useState(null);
      const [loading, setLoading] = useState(true);
      const [isFirstMount, setIsFirstMount] = useState(true);
      const { toast } = useToast();
      const { user, profile } = useAuth();
      const userRole = profile?.role;
      
      // Hook de cache
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache('requests');
      
      // Marca primeira montagem para evitar animações em remount
      useEffect(() => {
        if (isFirstMount) {
          const timer = setTimeout(() => setIsFirstMount(false), 100);
          return () => clearTimeout(timer);
        }
      }, [isFirstMount]);

      const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: reqData, error: reqError } = await supabase.from('solicitacoes').select('*, clientes ( empresa )').order('created_at', { ascending: false });
        const { data: cliData, error: cliError } = await supabase.from('clientes').select('id, empresa');
        const { data: projData, error: projError } = await supabase.from('projetos').select('id, name, client_id');

        if (reqError || cliError || projError) {
          toast({ title: "Erro ao buscar dados", description: reqError?.message || cliError?.message || projError?.message, variant: "destructive" });
        } else {
          // Salva no cache
          const dataToCache = {
            requests: reqData || [],
            clients: cliData || [],
            projects: projData || []
          };
          setCachedData(dataToCache);
          setRequests(dataToCache.requests);
          setClients(dataToCache.clients);
          setProjects(dataToCache.projects);
        }
        setLoading(false);
      }, [toast, setCachedData]);

      useEffect(() => {
        // Se tem cache válido (últimos 30 segundos), usa ele
        if (!shouldFetch() && cachedData) {
          setRequests(cachedData.requests);
          setClients(cachedData.clients);
          setProjects(cachedData.projects);
          setLoading(false);
          
          // Ainda configura realtime para atualizações
          const channel = supabase.channel('realtime-solicitacoes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, (payload) => {
              setCachedData(null); // Limpa cache para forçar refresh
              fetchData();
            })
            .subscribe();

          return () => {
            supabase.removeChannel(channel);
          };
        }

        // Se não tem cache ou está expirado, faz fetch
        fetchData();
        
        const channel = supabase.channel('realtime-solicitacoes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, (payload) => {
            setCachedData(null); // Limpa cache para forçar refresh
            fetchData();
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }, [fetchData, shouldFetch, cachedData, setCachedData]);

      const filteredRequests = useMemo(() => {
        return requests.filter(r => {
          const clientMatch = clientFilter === 'all' || r.client_id === clientFilter;
          const priorityMatch = priorityFilter === 'all' || r.priority === priorityFilter;
          return clientMatch && priorityMatch;
        });
      }, [requests, clientFilter, priorityFilter]);

      const handleSaveRequest = async (requestData, isNew) => {
        const dataToSave = {
          ...requestData,
          owner_id: user.id,
          data_recebida: requestData.data_recebida || null,
          prazo: requestData.prazo || null,
        };
        
        if (isNew) {
          const { error } = await supabase.from('solicitacoes').insert(dataToSave);
          if (error) toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
          else toast({ title: "Solicitação registrada!" });
        } else {
          const { error } = await supabase.from('solicitacoes').update(dataToSave).eq('id', editingRequest.id);
          if (error) toast({ title: "Erro ao atualizar solicitação", description: error.message, variant: "destructive" });
          else toast({ title: "Solicitação atualizada!" });
        }
        
        setShowForm(false);
        setEditingRequest(null);
      };

      const handleDeleteRequest = async (requestId) => {
        const { error } = await supabase.from('solicitacoes').delete().eq('id', requestId);
        if (error) toast({ title: "Erro ao remover solicitação", description: error.message, variant: "destructive" });
        else {
          toast({ title: "Solicitação removida" });
        }
      };

      const handleOpenForm = (request = null) => {
        setEditingRequest(request);
        setShowForm(true);
      };

      const handleConvertToTask = async (taskData) => {
        const { error: taskError } = await supabase.from('tarefas').insert(taskData);
        if (taskError) {
          toast({ title: "Erro ao criar tarefa", description: taskError.message, variant: "destructive" });
          return;
        }

        const { error: requestError } = await supabase.from('solicitacoes').update({ status: 'execucao' }).eq('id', convertingRequest.id);
        if (requestError) {
          toast({ title: "Erro ao atualizar status da solicitação", description: requestError.message, variant: "destructive" });
        } else {
          toast({ title: "Tarefa criada e solicitação atualizada!" });
        }
        
        setConvertingRequest(null);
      };

      return (
        <motion.div initial={isFirstMount ? { opacity: 0, scale: 0.98 } : false} animate={{ opacity: 1, scale: 1 }} className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Registro de Solicitações</h1>
            {(userRole === 'superadmin' || userRole === 'admin') && (
                <Button onClick={() => handleOpenForm()} disabled={clients.length === 0} className="bg-gradient-to-r from-orange-500 to-purple-600 text-white">
                    <Plus size={16} className="mr-2" />Registrar Solicitação
                </Button>
            )}
          </div>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Filter className="text-gray-500 dark:text-gray-400" />
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filtrar por cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Clientes</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filtrar por prioridade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Prioridades</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          {loading ? <p className="text-center py-10 dark:text-gray-300">Carregando solicitações...</p> :
           filteredRequests.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <MessageSquareIcon className="mx-auto text-gray-400 dark:text-gray-500 mb-4" size={48} />
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">Nenhuma solicitação encontrada</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Tente ajustar os filtros ou registre uma nova solicitação.</p>
            </div>
           ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filteredRequests.map((req) => (
                  <motion.div key={req.id} initial={isFirstMount ? { opacity: 0, scale: 0.9 } : false} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="dark:bg-gray-800 dark:border-gray-700 flex flex-col h-full">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="dark:text-white">{req.title}</CardTitle>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{req.clientes?.empresa || 'Cliente não encontrado'}</p>
                          </div>
                          {(userRole === 'superadmin' || userRole === 'admin') && (
                            <div className="flex gap-1 flex-shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => handleOpenForm(req)}><Edit className="h-4 w-4" /></Button>
                                <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-600 dark:text-red-400 dark:hover:bg-gray-700"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                    <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Esta ação não pode ser desfeita. Isso excluirá permanentemente a solicitação "{req.title}".</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteRequest(req.id)} className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                                </AlertDialog>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-grow">
                        <div className="flex justify-between items-center">
                            <Badge variant="outline" className={STATUS_STYLES[req.status] || 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}>{req.status}</Badge>
                            {req.origem === 'ApexIA' && <Badge variant="secondary" className="gap-1"><Bot size={14}/> ApexIA</Badge>}
                        </div>
                        <div className="text-sm dark:text-gray-300"><span className="font-medium">Prioridade: </span><span className={PRIORITY_STYLES[req.priority] || ''}>{req.priority}</span></div>
                        <div className="text-sm dark:text-gray-300"><span className="font-medium">Prazo: </span>{req.prazo ? new Date(req.prazo).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</div>
                        {req.description && <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">{req.description}</p>}
                      </CardContent>
                      {(userRole === 'superadmin' || userRole === 'admin') && (
                        <CardFooter>
                            <Button variant="outline" className="w-full dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600" disabled={req.status === 'concluida' || req.status === 'execucao'} onClick={() => setConvertingRequest(req)}>
                            <ListChecks className="mr-2 h-4 w-4" />Criar Tarefa
                            </Button>
                        </CardFooter>
                      )}
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          <AnimatePresence>
            {showForm && (userRole === 'superadmin' || userRole === 'admin') && <RequestForm request={editingRequest} clients={clients} onSave={handleSaveRequest} onClose={() => { setShowForm(false); setEditingRequest(null); }} />}
            {convertingRequest && (userRole === 'superadmin' || userRole === 'admin') && <ConvertToTaskDialog request={convertingRequest} projects={projects.filter(p => p.client_id === convertingRequest.client_id)} onSave={handleConvertToTask} onClose={() => setConvertingRequest(null)} />}
          </AnimatePresence>
        </motion.div>
      );
    };

    export default Requests;