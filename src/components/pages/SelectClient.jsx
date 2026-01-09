import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, ArrowLeft, Clock, Building2, MessageSquare, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const SelectClient = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientConversations, setClientConversations] = useState({});

  const fetchClients = useCallback(async () => {
    if (!user) return;
    
    try {
      let query = supabase
        .from('clientes')
        .select('id, empresa, nome_contato, logo_urls')
        .order('empresa', { ascending: true });

      // Se for colaborador, filtrar por responsável
      if (profile?.role === 'colaborador') {
        // Assumindo que há um campo responsavel ou similar
        // Ajuste conforme sua estrutura
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setClients(data || []);
      setFilteredClients(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os clientes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, profile, toast]);

  const fetchClientConversations = useCallback(async (clientIds) => {
    if (!user || clientIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select('id, client_id, title, updated_at')
        .eq('owner_id', user.id)
        .eq('mode', 'client_specific')
        .in('client_id', clientIds);

      if (error) throw error;

      // Agrupar por client_id
      const grouped = {};
      data?.forEach(conv => {
        if (!grouped[conv.client_id]) {
          grouped[conv.client_id] = [];
        }
        grouped[conv.client_id].push(conv);
      });

      setClientConversations(grouped);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (clients.length > 0) {
      const clientIds = clients.map(c => c.id);
      fetchClientConversations(clientIds);
    }
  }, [clients, fetchClientConversations]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredClients(clients);
    } else {
      const filtered = clients.filter(client =>
        client.empresa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.nome_contato?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredClients(filtered);
    }
  }, [searchTerm, clients]);

  const handleClientSelect = (clientId) => {
    navigate(`/assistant/client/${clientId}`);
  };

  const formatTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `há ${diffDays} dias`;
    return new Date(date).toLocaleDateString('pt-BR');
  };

  // Componente para item de cliente
  const ClientItem = ({ client, conversations, lastConversation, onClick }) => {
    const [logoError, setLogoError] = useState(false);
    const initial = client.empresa?.charAt(0)?.toUpperCase() || 'C';
    const colors = [
      'from-orange-500 to-orange-600',
      'from-purple-500 to-purple-600',
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-pink-500 to-pink-600',
    ];
    const colorIndex = initial.charCodeAt(0) % colors.length;
    const gradient = colors[colorIndex];
    const logoUrl = client.logo_urls && client.logo_urls.length > 0 ? client.logo_urls[0] : null;

    return (
      <div
        className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-all group border-l-4 border-transparent hover:border-orange-500"
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm overflow-hidden relative`}>
              {logoUrl && !logoError ? (
                <img 
                  src={logoUrl} 
                  alt={client.empresa}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
                  {client.empresa}
                </h3>
                {conversations.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
                  </Badge>
                )}
              </div>
              {client.nome_contato && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {client.nome_contato}
                </p>
              )}
              {lastConversation && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Última conversa: {formatTimeAgo(lastConversation.updated_at)}</span>
                </div>
              )}
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-orange-600 transition-colors flex-shrink-0" />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/assistant')}
              className="hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-purple-600">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">
                  Selecionar Cliente
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Escolha um cliente para trabalhar em projetos específicos
                </p>
              </div>
            </div>
          </div>

          {/* Busca */}
          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="search"
                  placeholder="Buscar por nome da empresa ou contato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 text-base"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Clientes */}
        <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {filteredClients.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 font-medium">
                    Nenhum cliente encontrado
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    Tente ajustar sua busca
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredClients.map((client) => {
                    const conversations = clientConversations[client.id] || [];
                    const lastConversation = conversations.length > 0
                      ? conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]
                      : null;

                    return (
                      <ClientItem
                        key={client.id}
                        client={client}
                        conversations={conversations}
                        lastConversation={lastConversation}
                        onClick={() => handleClientSelect(client.id)}
                      />
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SelectClient;

