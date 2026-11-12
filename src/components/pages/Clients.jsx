import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { Helmet } from 'react-helmet';
    import { AnimatePresence, motion } from 'framer-motion';
import { Plus, List, Kanban, Users as UsersIcon, X, Search, Download, ArrowUpDown, RotateCcw, PieChart, Check } from 'lucide-react';
    import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import ClientForm from '@/components/forms/ClientForm';
    import ClientProgress from '@/components/clients/ClientProgress';
    import ClientesLista from '@/components/clients/ClientesLista';
    import ClientesKanban from '@/components/clients/ClientesKanban';
    import ClientesVisaoGeral from '@/components/clients/ClientesVisaoGeral';
    import ProjectDocuments from '@/components/projects/ProjectDocuments';
import ClientUserManager from '@/components/admin/ClientUserManager';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
    import { useDataCache } from '@/hooks/useDataCache';
    import { useAgencyPulse } from '@/hooks/useAgencyPulse';
    import {
      clientMatchesCarteiraFocus,
      computeCarteiraKpis,
      formatCompactMoney,
    } from '@/lib/carteiraClientes';
    import { saveClienteForm, saveClienteToast } from '@/lib/clienteSave';
import { fetchEtiquetaRows, mergeEtiquetaCatalog, saveEtiqueta } from '@/lib/clienteEtiquetas';
import { EtiquetaCreateRow, EtiquetaDot } from '@/components/clients/ClienteEtiquetas';
import '@/components/clients/Clients.css';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';

    const ETAPAS = [
      { value: 'prospect', label: 'Prospect', color: 'bg-gray-400' },
      { value: 'qualification', label: 'Qualificação', color: 'bg-blue-500' },
      { value: 'proposal', label: 'Proposta', color: 'bg-yellow-500' },
      { value: 'negotiation', label: 'Negociação', color: 'bg-orange-500' },
      { value: 'closed', label: 'Fechado', color: 'bg-green-500' },
      { value: 'lost', label: 'Perdido', color: 'bg-red-500' }
    ];

    function matchesClientSearch(client, term) {
      if (!term) return true;
      const query = term.toLowerCase();
      const haystack = [
        client.empresa,
        client.nome_contato,
        client.email,
        client.cidade,
        client.estado,
        client.cnpj_cpf,
      ].join(' ').toLowerCase();
      if (haystack.includes(query)) return true;
      const queryDigits = term.replace(/\D/g, '');
      const docDigits = String(client.cnpj_cpf || '').replace(/\D/g, '');
      return queryDigits.length >= 3 && docDigits.includes(queryDigits);
    }

    const Clients = () => {
      const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('planeje_clients_view') || 'overview';
        return saved === 'cards' ? 'kanban' : saved;
      });
      const [sortBy, setSortBy] = useState('empresa');
      const [editingClient, setEditingClient] = useState(null);
      const [showProgress, setShowProgress] = useState(false);
      const [selectedClientForProgress, setSelectedClientForProgress] = useState(null);
      const [showDocument, setShowDocument] = useState(false);
      const [selectedClientForDoc, setSelectedClientForDoc] = useState(null);
      const [showUserManager, setShowUserManager] = useState(false);
      const [selectedClientForUser, setSelectedClientForUser] = useState(null);
      const [etapaFilter, setEtapaFilter] = useState('all');
      const [etiquetaFilter, setEtiquetaFilter] = useState([]);
      const [etiquetaRows, setEtiquetaRows] = useState([]);
      const [selectedClients, setSelectedClients] = useState([]);
      const [searchTerm, setSearchTerm] = useState('');
      const [carteiraFocus, setCarteiraFocus] = useState('all');
      const { toast } = useToast();
      const { user, profile, loading: authLoading, canViewField } = useAuth();
      const { moduleAccess, moduleSettings } = useModuleSettings();
      const navigate = useNavigate();
      const location = useLocation();
      const [searchParams, setSearchParams] = useSearchParams();
      const clientIdFromUrl = searchParams.get('editar');
      const isNewForm = location.pathname === '/clients/new';
      const isEditForm = !isNewForm && Boolean(clientIdFromUrl);
      
      const userRole = profile?.role;
      const clientsAccessLevel = moduleAccess.clients || 'all';
      const canManageClients = userRole === 'superadmin' || userRole === 'admin';
      const csPortfolioSearch = location.state?.csPortfolioSearch;
      const fromCsPortfolio = isNewForm && canManageClients && profile?.status === 'active' && moduleSettings?.atendimento === true &&
        typeof csPortfolioSearch === 'string';
      const pendingCsCreate = useRef(false);
      const csDraftId = useRef(null);
      const pulse = useAgencyPulse();
      const atRiskIds = useMemo(
        () => new Set((pulse.summary.atRisk || []).map((a) => a.id)),
        [pulse.summary.atRisk]
      );
      const pulseById = useMemo(() => {
        const map = new Map();
        (pulse.accounts || []).forEach((account) => map.set(account.id, account));
        return map;
      }, [pulse.accounts]);

      const toggleCarteiraFocus = (focus) => {
        setCarteiraFocus((prev) => {
          if (prev === focus) {
            setEtapaFilter('all');
            return 'all';
          }
          if (focus === 'ativos') setEtapaFilter('closed');
          else if (focus === 'perdidos') setEtapaFilter('lost');
          else setEtapaFilter('all');
          return focus;
        });
        if (viewMode === 'overview') setViewModePersist('list');
      };

      const setViewModePersist = (mode) => {
        setViewMode(mode);
        localStorage.setItem('planeje_clients_view', mode);
      };
      
      // Hook de cache com chave única por usuário e role
      const cacheKey = `clients_${user?.id}_${userRole}_${clientsAccessLevel}`;
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
      
      // Ref para controlar se já fez o fetch inicial
      const hasFetchedRef = useRef(false);
      
      // Verifica se tem cache válido (calculado uma vez)
      const hasValidCache = useMemo(() => {
        return cachedData && !shouldFetch();
      }, [cachedData, shouldFetch]);
      
      // Inicializa estados - verifica cache imediatamente para evitar "Carregando"
      const [clients, setClients] = useState(() => hasValidCache ? (cachedData?.clients || []) : []);
      const [users, setUsers] = useState(() => hasValidCache ? (cachedData?.users || []) : []);
      const [loading, setLoading] = useState(() => !hasValidCache);
      const etiquetaCatalog = useMemo(() => mergeEtiquetaCatalog(etiquetaRows, clients), [etiquetaRows, clients]);
      
      const fetchClients = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        
        let query = supabase.from('clientes').select('*').order('created_at', { ascending: false });

        if (userRole === 'colaborador' && clientsAccessLevel === 'responsible') {
          query = query.eq('responsavel', user.id);
        }
        
        const { data: clientsData, error: clientsError } = await query;
        // Importante: clientes (role='cliente') não podem aparecer como responsáveis.
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');

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

      const loadEtiquetas = useCallback(async () => {
        const { rows, error } = await fetchEtiquetaRows(supabase);
        if (!error) setEtiquetaRows(rows);
      }, []);

      const createEtiqueta = useCallback(async (nome) => {
        const result = await saveEtiqueta(supabase, nome, etiquetaCatalog, user?.id);
        if (!result.ok) {
          toast({ title: 'Não foi possível criar a etiqueta', description: result.error, variant: 'destructive' });
          return null;
        }
        if (!result.existing) {
          setEtiquetaRows((prev) => [...prev, { chave: result.etiqueta.chave, nome: result.etiqueta.nome }]);
          toast({ title: 'Etiqueta criada', description: result.etiqueta.nome });
        }
        return result.etiqueta;
      }, [etiquetaCatalog, toast, user?.id]);

      useEffect(() => {
        if (user) loadEtiquetas();
      }, [user, loadEtiquetas]);

      useEffect(() => {
        if (authLoading || !user) return;
        
        // Se já fez fetch inicial, não faz nada (evita recarregamento ao voltar para aba)
        if (hasFetchedRef.current) {
          // Apenas sincroniza com cache se necessário, sem fazer fetch
          if (hasValidCache && cachedData) {
            setClients(cachedData.clients || []);
            setUsers(cachedData.users || []);
            setLoading(false);
          }
          return;
        }
        
        // Se tem cache válido, usa ele e marca como fetched
        if (hasValidCache && cachedData) {
          setClients(cachedData.clients || []);
          setUsers(cachedData.users || []);
          setLoading(false);
          hasFetchedRef.current = true;
          return;
        }

        // Se não tem cache ou está expirado, faz fetch apenas uma vez
        if (!hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchClients();
        }
      }, [authLoading, user]); // Apenas authLoading e user - evita re-execução

      useEffect(() => {
        if (isNewForm) {
          setEditingClient(null);
          return;
        }
        if (isEditForm) {
          if (clients.length > 0) {
            const client = clients.find(c => c.id === clientIdFromUrl);
            if (client) {
              setEditingClient(client);
            } else {
              toast({ title: "Cliente não encontrado", variant: "destructive" });
              closeEditParam();
            }
          }
          return;
        }
        setEditingClient(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [isNewForm, isEditForm, clientIdFromUrl, clients, toast]);

      function closeEditParam() {
        const params = new URLSearchParams(searchParams);
        params.delete('editar');
        setSearchParams(params, { replace: true });
      }

      const handleSaveClient = async (clientData, isNew) => {
        if (pendingCsCreate.current) return;
        pendingCsCreate.current = fromCsPortfolio && isNew;
        if (pendingCsCreate.current && !csDraftId.current) csDraftId.current = crypto.randomUUID();
        let result;
        try {
          result = await saveClienteForm({ clientData, isNew, editingClient, userId: user.id,
            csDraftId: pendingCsCreate.current ? csDraftId.current : undefined });
        } finally {
          pendingCsCreate.current = false;
        }
        toast(result.replayed ? { title: 'Cadastro confirmado', description: 'A ficha mostra os dados gravados na primeira tentativa.' }
          : saveClienteToast({ isNew, ...result }));
        if (result.error) return;
        setCachedData(null);
        fetchClients();
        if (fromCsPortfolio && isNew && result.savedId && (result.savedStage ?? clientData.etapa) === 'closed') {
          navigate(`/cs-ia/clientes/${encodeURIComponent(result.savedId)}`, { replace: true, state: { csPortfolioSearch } });
        } else if (isNew) navigate(result.savedId ? `/clients/${result.savedId}` : '/clients');
        else closeEditParam();
      };

      const handleUpdateClientField = async (clientId, field, value) => {
        const stored = field === 'etiquetas' ? (Array.isArray(value) ? value : []) : (value || null);
        const { error } = await supabase.from('clientes').update({ [field]: stored }).eq('id', clientId);
        if (error) {
          toast({ title: `Erro ao atualizar ${field}`, description: error.message, variant: "destructive" });
          return;
        }
        if (field === 'etiquetas') {
          const patch = (list) => (list || []).map((client) => (client.id === clientId ? { ...client, etiquetas: stored } : client));
          setClients(patch);
          setCachedData((prev) => (prev ? { ...prev, clients: patch(prev.clients) } : prev));
          return;
        }
        toast({ title: "Cliente atualizado!" });
        setCachedData(null);
        fetchClients();
      };

      const handleOpenForm = (client = null) => {
        if (client) {
          const params = new URLSearchParams(searchParams);
          params.set('editar', client.id);
          setSearchParams(params);
        } else {
          navigate('/clients/new');
        }
      };

      const handleOpenHub = (client) => {
        if (client?.id) navigate(`/clients/${client.id}`);
      };
      
      const handleCloseForm = () => {
        if (pendingCsCreate.current) return;
        if (fromCsPortfolio) navigate({ pathname: '/cs-ia/carteira', search: csPortfolioSearch }, { replace: true });
        else if (isNewForm) navigate('/clients');
        else closeEditParam();
      };

      const handleOpenProgress = (client) => {
        setSelectedClientForProgress(client);
        setShowProgress(true);
      };
      
      const handleOpenDocument = (client) => {
        setSelectedClientForDoc(client);
        setShowDocument(true);
      };

      const handleOpenUserManager = (client) => {
        setSelectedClientForUser(client);
        setShowUserManager(true);
      };

      const filteredClients = useMemo(() => {
        return clients.filter(client => {
          const etapaMatch = etapaFilter === 'all' || client.etapa === etapaFilter;
          const etiquetaMatch = etiquetaFilter.length === 0 || etiquetaFilter.every(tag => client.etiquetas?.includes(tag));
          
          const searchMatch = matchesClientSearch(client, searchTerm);

          const carteiraMatch = clientMatchesCarteiraFocus(client, carteiraFocus, { atRiskIds });
          
          return etapaMatch && etiquetaMatch && searchMatch && carteiraMatch;
        });
      }, [clients, etapaFilter, etiquetaFilter, searchTerm, carteiraFocus, atRiskIds]);

      const clientsForPipelineCounts = useMemo(() => {
        return clients.filter((client) => {
          const etiquetaMatch =
            etiquetaFilter.length === 0 ||
            etiquetaFilter.every((tag) => client.etiquetas?.includes(tag));
          const searchMatch = matchesClientSearch(client, searchTerm);
          return etiquetaMatch && searchMatch;
        });
      }, [clients, etiquetaFilter, searchTerm]);

      const pipelineCounts = useMemo(() => {
        const counts = { all: clientsForPipelineCounts.length };
        ETAPAS.forEach((e) => {
          counts[e.value] = clientsForPipelineCounts.filter((c) => c.etapa === e.value).length;
        });
        return counts;
      }, [clientsForPipelineCounts]);

      const sortedFilteredClients = useMemo(() => {
        const list = [...filteredClients];
        list.sort((a, b) => {
          if (carteiraFocus === 'risco') {
            const sa = pulseById.get(a.id)?.score ?? 101;
            const sb = pulseById.get(b.id)?.score ?? 101;
            if (sa !== sb) return sa - sb;
          }
          if (sortBy === 'valor') {
            return (parseFloat(b.valor) || 0) - (parseFloat(a.valor) || 0);
          }
          if (sortBy === 'vencimento') {
            if (!a.vencimento) return 1;
            if (!b.vencimento) return -1;
            return new Date(a.vencimento) - new Date(b.vencimento);
          }
          if (sortBy === 'created_at') {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          return (a.empresa || '').localeCompare(b.empresa || '', 'pt-BR');
        });
        return list;
      }, [filteredClients, sortBy, carteiraFocus, pulseById]);

      const clientsForKanban = useMemo(() => {
        return clients.filter((client) => {
          const etiquetaMatch =
            etiquetaFilter.length === 0 ||
            etiquetaFilter.every((tag) => client.etiquetas?.includes(tag));
          const searchMatch = matchesClientSearch(client, searchTerm);
          const carteiraMatch = clientMatchesCarteiraFocus(client, carteiraFocus, { atRiskIds });
          return etiquetaMatch && searchMatch && carteiraMatch;
        });
      }, [clients, etiquetaFilter, searchTerm, carteiraFocus, atRiskIds]);

      const hasActiveFilters =
        etapaFilter !== 'all' || etiquetaFilter.length > 0 || searchTerm.trim() !== '' || carteiraFocus !== 'all';

      const clearFilters = () => {
        setEtapaFilter('all');
        setEtiquetaFilter([]);
        setSearchTerm('');
        setCarteiraFocus('all');
      };

      const escapeCsv = (value) => {
        if (value === null || value === undefined) return '';
        const text = String(value);
        if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const formatDate = (dateValue) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('pt-BR');
      };

      const exportClientsToCsv = () => {
        if (!filteredClients.length) {
          toast({
            title: "Nada para exportar",
            description: "Não há clientes nos filtros atuais.",
            variant: "destructive",
          });
          return;
        }

        const headers = [
          'ID',
          'Empresa',
          'Contato',
          'Email',
          'Telefone',
          'CNPJ/CPF',
          'Cidade',
          'Estado',
          'Etapa',
          'Etiquetas',
          'Valor',
          'Vencimento',
          'Responsavel',
          'Data de cadastro',
        ];

        const userNameById = new Map(users.map((u) => [u.id, u.full_name || '']));
        const rows = filteredClients.map((client) => [
          client.id,
          client.empresa,
          client.nome_contato,
          client.email,
          client.telefone,
          client.cnpj_cpf,
          client.cidade,
          client.estado,
          client.etapa,
          Array.isArray(client.etiquetas) ? client.etiquetas.join(' | ') : '',
          client.valor,
          formatDate(client.vencimento),
          userNameById.get(client.responsavel) || client.responsavel || '',
          formatDate(client.created_at),
        ]);

        const csvRows = [
          headers.map(escapeCsv).join(','),
          ...rows.map((row) => row.map(escapeCsv).join(',')),
        ];
        const csvContent = '\uFEFF' + csvRows.join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateSuffix = new Date().toISOString().slice(0, 10);
        a.download = `clientes_${dateSuffix}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast({
          title: "Exportação concluída",
          description: `${rows.length} cliente(s) exportado(s) para CSV.`,
        });
      };

      const carteira = useMemo(
        () => computeCarteiraKpis(clients, { atRiskIds }),
        [clients, atRiskIds]
      );

      const isFormOpen = isNewForm || isEditForm;

      return (
        <div className="planeje-clients">
          <Helmet>
            <title>Clientes — Planeje</title>
          </Helmet>

          <WorkspacePageHeader
            title={viewMode === 'overview' ? 'Visão geral da carteira' : 'Gestão de clientes'}
            label="Clientes"
            help={viewMode === 'overview'
              ? 'Acompanhe contratos ativos, receita, risco, vencimentos, entrada e perda de clientes. Use os modos ao lado para abrir a operação em lista ou Kanban.'
              : `${filteredClients.length} ${filteredClients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}. Use a busca, os filtros e os modos de visualização para organizar a carteira.`}
            actions={<>
              <div className="flex h-9 items-center rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]" role="group" aria-label="Modo de visualização dos clientes">
                {[
                  ['overview', PieChart, 'Visão geral'],
                  ['list', List, 'Lista'],
                  ['kanban', Kanban, 'Kanban'],
                ].map(([mode, Icon, label]) => (
                  <Button key={mode} type="button" variant={viewMode === mode ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 rounded-lg" onClick={() => setViewModePersist(mode)} aria-label={label} title={label}><Icon className="h-4 w-4" /></Button>
                ))}
              </div>
              {canManageClients && <Button type="button" size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={() => handleOpenForm()}><Plus className="mr-1.5 h-3.5 w-3.5" />Novo cliente</Button>}
            </>}
          />

          <div className="planeje-clients-stats">
            <button
              type="button"
              className={`planeje-clients-stat planeje-clients-stat--active${carteiraFocus === 'ativos' ? ' is-active' : ''}`}
              onClick={() => toggleCarteiraFocus('ativos')}
            >
              <p className="planeje-clients-stat-label">Ativos</p>
              <p className="planeje-clients-stat-value">{carteira.ativos}</p>
              <p className="planeje-clients-stat-sub">{carteira.novos ? `${carteira.novos} novo${carteira.novos > 1 ? 's' : ''} no mês` : 'Contratos fechados'}</p>
            </button>
            {canViewField('valor') && (
              <button
                type="button"
                className={`planeje-clients-stat planeje-clients-stat--value${carteiraFocus === 'ativos' ? ' is-active' : ''}`}
                onClick={() => toggleCarteiraFocus('ativos')}
              >
                <p className="planeje-clients-stat-label">MRR</p>
                <p className="planeje-clients-stat-value text-lg md:text-2xl">{formatCompactMoney(carteira.mrr)}</p>
                <p className="planeje-clients-stat-sub">Receita dos ativos</p>
              </button>
            )}
            {canViewField('valor') && (
              <div className="planeje-clients-stat planeje-clients-stat--ticket">
                <p className="planeje-clients-stat-label">Ticket médio</p>
                <p className="planeje-clients-stat-value text-lg md:text-2xl">{formatCompactMoney(carteira.ticket)}</p>
                <p className="planeje-clients-stat-sub">Por cliente ativo</p>
              </div>
            )}
            <button
              type="button"
              className={`planeje-clients-stat planeje-clients-stat--risk${carteiraFocus === 'risco' ? ' is-active' : ''}`}
              onClick={() => toggleCarteiraFocus('risco')}
            >
              <p className="planeje-clients-stat-label">Em risco</p>
              <p className="planeje-clients-stat-value">{pulse.loading ? '—' : carteira.risco}</p>
              <p className="planeje-clients-stat-sub">Cobertura, atraso ou inbox</p>
            </button>
            {canViewField('vencimento') && (
              <button
                type="button"
                className={`planeje-clients-stat planeje-clients-stat--due${carteiraFocus === 'vencendo' ? ' is-active' : ''}`}
                onClick={() => toggleCarteiraFocus('vencendo')}
              >
                <p className="planeje-clients-stat-label">Vencendo</p>
                <p className="planeje-clients-stat-value">{carteira.vencendo}</p>
                <p className="planeje-clients-stat-sub">Próximos 30 dias</p>
              </button>
            )}
            {canViewField('vencimento') && (
              <button
                type="button"
                className={`planeje-clients-stat planeje-clients-stat--overdue${carteiraFocus === 'vencidos' ? ' is-active' : ''}`}
                onClick={() => toggleCarteiraFocus('vencidos')}
              >
                <p className="planeje-clients-stat-label">Vencidos</p>
                <p className="planeje-clients-stat-value">{carteira.vencidos}</p>
                <p className="planeje-clients-stat-sub">Contrato atrasado</p>
              </button>
            )}
          </div>

          {viewMode !== 'overview' && (
          <div className="planeje-clients-toolbar">
            <div className="planeje-clients-search">
              <Search className="planeje-clients-search-icon w-4 h-4" />
              <input
                type="search"
                placeholder="Buscar por empresa, contato, cidade ou UF…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="planeje-clients-toolbar-actions">
              {viewMode !== 'overview' && (
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px] h-[42px]">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Nome A–Z</SelectItem>
                  <SelectItem value="valor">Maior valor</SelectItem>
                  <SelectItem value="vencimento">Vencimento</SelectItem>
                  <SelectItem value="created_at">Mais recentes</SelectItem>
                </SelectContent>
              </Select>
              )}
              {viewMode !== 'overview' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-[42px]">
                    Etiquetas {etiquetaFilter.length > 0 && `(${etiquetaFilter.length})`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar etiquetas…" />
                    <CommandEmpty>Nenhuma etiqueta.</CommandEmpty>
                    <CommandGroup>
                      {etiquetaCatalog.map((option) => {
                        const selected = etiquetaFilter.includes(option.chave);
                        return (
                          <CommandItem
                            key={option.chave}
                            value={option.nome}
                            onSelect={() => {
                              setEtiquetaFilter((prev) =>
                                prev.includes(option.chave)
                                  ? prev.filter((value) => value !== option.chave)
                                  : [...prev, option.chave]
                              );
                            }}
                          >
                            <EtiquetaDot chave={option.chave} catalog={etiquetaCatalog} />
                            <span className="min-w-0 flex-1 truncate">{option.nome}</span>
                            {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </Command>
                  <EtiquetaCreateRow onCreate={async (nome) => {
                    const created = await createEtiqueta(nome);
                    if (created) setEtiquetaFilter((prev) => (prev.includes(created.chave) ? prev : [...prev, created.chave]));
                    return created;
                  }} />
                </PopoverContent>
              </Popover>
              )}
              {hasActiveFilters && (
                <Button variant="outline" className="h-[42px]" onClick={clearFilters}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Limpar
                </Button>
              )}
              <Button variant="outline" className="h-[42px]" onClick={exportClientsToCsv}>
                <Download size={16} className="mr-2" />
                CSV
              </Button>
            </div>
          </div>
          )}

          {viewMode !== 'kanban' && viewMode !== 'overview' && (
          <div className="planeje-clients-pipeline">
            <button
              type="button"
              className={`planeje-clients-pipeline-chip${etapaFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setEtapaFilter('all')}
            >
              Todos
              <span className="planeje-clients-pipeline-count">{pipelineCounts.all}</span>
            </button>
            {ETAPAS.map((etapa) => (
              <button
                key={etapa.value}
                type="button"
                className={`planeje-clients-pipeline-chip${etapaFilter === etapa.value ? ' is-active' : ''}`}
                onClick={() => setEtapaFilter(etapa.value)}
              >
                <span className={`planeje-clients-pipeline-dot ${etapa.color}`} />
                {etapa.label}
                <span className="planeje-clients-pipeline-count">{pipelineCounts[etapa.value] || 0}</span>
              </button>
            ))}
          </div>
          )}

          <div key={viewMode}>
            {loading || authLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="planeje-clients-skeleton" />
                ))}
              </div>
            ) : viewMode === 'overview' ? (
              <ClientesVisaoGeral
                clients={clients}
                users={users}
                pulse={pulse}
                canViewField={canViewField}
                onOpenClient={handleOpenHub}
                onFilterSearch={(term) => {
                  setSearchTerm(term || '');
                  setViewModePersist('list');
                }}
              />
            ) : (viewMode === 'kanban' ? clientsForKanban : sortedFilteredClients).length === 0 ? (
              <div className="planeje-clients-empty">
                <div className="planeje-clients-empty-icon">
                  <UsersIcon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nenhum cliente encontrado</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  {userRole === 'colaborador'
                    ? 'Você ainda não é responsável por nenhum cliente.'
                    : 'Ajuste os filtros ou cadastre um novo cliente.'}
                </p>
                {canManageClients && (
                  <Button className="mt-4 jb-gradient-bg text-white border-0" onClick={() => handleOpenForm()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo cliente
                  </Button>
                )}
              </div>
            ) : viewMode === 'kanban' ? (
              <ClientesKanban
                clients={clientsForKanban}
                onOpen={handleOpenHub}
                onEdit={handleOpenForm}
                onUpdateField={handleUpdateClientField}
                onProgress={handleOpenProgress}
                onOpenDocument={handleOpenDocument}
                onOpenUserManager={handleOpenUserManager}
                fetchClients={fetchClients}
                userRole={userRole}
                pulseById={pulseById}
                etiquetaCatalog={etiquetaCatalog}
              />
            ) : (
              <ClientesLista
                clients={sortedFilteredClients}
                users={users}
                onOpen={handleOpenHub}
                onEdit={handleOpenForm}
                onUpdateField={handleUpdateClientField}
                onAddClient={() => handleOpenForm()}
                onOpenDocument={handleOpenDocument}
                onOpenUserManager={handleOpenUserManager}
                selectedClients={selectedClients}
                setSelectedClients={setSelectedClients}
                fetchClients={fetchClients}
                userRole={userRole}
                pulseById={pulseById}
                etiquetaCatalog={etiquetaCatalog}
                onCreateEtiqueta={createEtiqueta}
              />
            )}
          </div>

          <AnimatePresence>
            {isFormOpen && <ClientForm client={editingClient} users={users} etiquetaCatalog={etiquetaCatalog} onCreateEtiqueta={createEtiqueta}
              onSave={handleSaveClient} onClose={handleCloseForm} initialStage={fromCsPortfolio ? 'closed' : undefined} />}
          </AnimatePresence>
          <AnimatePresence>
            {showProgress && selectedClientForProgress && <ClientProgress client={selectedClientForProgress} onClose={() => { setShowProgress(false); setSelectedClientForProgress(null); }} />}
          </AnimatePresence>
           <AnimatePresence>
            {showUserManager && selectedClientForUser && (
              <ClientUserManager
                clientId={selectedClientForUser.id}
                clientName={selectedClientForUser.empresa}
                onClose={() => {
                  setShowUserManager(false);
                  setSelectedClientForUser(null);
                }}
              />
            )}
          </AnimatePresence>
           <AnimatePresence>
            {showDocument && selectedClientForDoc && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 flex flex-col"
                style={{ height: '100dvh', maxHeight: '100dvh' }}
              >
                <div className="flex flex-col h-full p-3 md:p-6 overflow-hidden">
                  <div className="flex-shrink-0 mb-3 md:mb-4 flex items-center justify-between">
                    <h2 className="text-lg md:text-2xl font-bold text-gray-800 dark:text-white truncate pr-2">Documentos de: {selectedClientForDoc.empresa}</h2>
                    <Button variant="ghost" size="icon" onClick={() => { setShowDocument(false); setSelectedClientForDoc(null); }}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden flex flex-col" style={{ maxHeight: '100%' }}>
                    <ProjectDocuments client={selectedClientForDoc} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default Clients;
