import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, MessageSquare, Zap, FileText, PenTool, BarChart3, Image as ImageIcon, Megaphone, Target, TrendingUp, Search, Clock, Sparkles, Palette, TrendingDown, ArrowRight, Building2, Brain } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const AssistantHome = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [recentConversations, setRecentConversations] = useState([]);
  const [frequentClients, setFrequentClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Ações rápidas categorizadas
  const quickActions = {
    conteudo: [
      { id: 'roteiro', label: 'Roteiro de Vídeo', icon: FileText, action: () => navigate('/assistant/general?action=roteiro') },
      { id: 'legenda', label: 'Escrever Legenda', icon: PenTool, action: () => navigate('/assistant/general?action=legenda') },
      { id: 'post', label: 'Criar Post', icon: Megaphone, action: () => navigate('/assistant/general?action=post') },
      { id: 'copy', label: 'Copy para Anúncio', icon: FileText, action: () => navigate('/assistant/general?action=copy') },
    ],
    analise: [
      { id: 'trafego', label: 'Analisar Tráfego', icon: BarChart3, action: () => navigate('/assistant/general?action=trafego') },
      { id: 'campanha', label: 'Analisar Campanha', icon: TrendingUp, action: () => navigate('/assistant/general?action=campanha') },
      { id: 'comparar', label: 'Comparar Clientes', icon: Users, action: () => navigate('/assistant/general?action=comparar') },
      { id: 'financeiro', label: 'Análise Financeira', icon: BarChart3, action: () => navigate('/assistant/general?action=financeiro') },
    ],
    criativo: [
      { id: 'imagem', label: 'Gerar Imagem', icon: ImageIcon, action: () => navigate('/assistant/general?action=imagem') },
      { id: 'arte', label: 'Criar Arte', icon: ImageIcon, action: () => navigate('/assistant/general?action=arte') },
      { id: 'ideias', label: 'Ideias de Conteúdo', icon: Zap, action: () => navigate('/assistant/general?action=ideias') },
      { id: 'brainstorm', label: 'Brainstorm', icon: Target, action: () => navigate('/assistant/general?action=brainstorm') },
    ],
    estrategia: [
      { id: 'planejar', label: 'Planejar Campanha', icon: Target, action: () => navigate('/assistant/general?action=planejar') },
      { id: 'estrategia', label: 'Criar Estratégia', icon: Target, action: () => navigate('/assistant/general?action=estrategia') },
      { id: 'otimizar', label: 'Otimizar Campanha', icon: TrendingUp, action: () => navigate('/assistant/general?action=otimizar') },
      { id: 'sugerir', label: 'Sugerir Melhorias', icon: Zap, action: () => navigate('/assistant/general?action=sugerir') },
    ],
  };

  // Buscar conversas recentes
  const fetchRecentConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('assistant_project_conversations')
        .select(`
          id,
          mode,
          title,
          updated_at,
          client_id,
          clientes:client_id (empresa)
        `)
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentConversations(data || []);
    } catch (error) {
      console.error('Erro ao buscar conversas recentes:', error);
    }
  }, [user]);

  // Buscar clientes frequentes
  const fetchFrequentClients = useCallback(async () => {
    if (!user) return;
    
    try {
      // Buscar clientes que têm mais conversas
      const { data: conversations, error: convError } = await supabase
        .from('assistant_project_conversations')
        .select('client_id')
        .eq('owner_id', user.id)
        .eq('mode', 'client_specific')
        .not('client_id', 'is', null);

      if (convError) throw convError;

      // Contar frequência de cada cliente
      const clientCounts = {};
      conversations?.forEach(conv => {
        if (conv.client_id) {
          clientCounts[conv.client_id] = (clientCounts[conv.client_id] || 0) + 1;
        }
      });

      // Pegar os 3-5 mais frequentes
      const sortedClients = Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id]) => id);

      if (sortedClients.length > 0) {
        const { data: clients, error: clientsError } = await supabase
          .from('clientes')
          .select('id, empresa')
          .in('id', sortedClients);

        if (clientsError) throw clientsError;
        
        // Ordenar pela frequência
        const orderedClients = sortedClients
          .map(id => clients?.find(c => c.id === id))
          .filter(Boolean);
        
        setFrequentClients(orderedClients || []);
      }
    } catch (error) {
      console.error('Erro ao buscar clientes frequentes:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      Promise.all([fetchRecentConversations(), fetchFrequentClients()]).finally(() => {
        setLoading(false);
      });
    }
  }, [user, fetchRecentConversations, fetchFrequentClients]);

  const formatTimeAgo = (date) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays < 7) return `há ${diffDays} dias`;
    return past.toLocaleDateString('pt-BR');
  };

  const handleQuickAction = (action) => {
    action.action();
  };

  const handleClientClick = (clientId) => {
    navigate(`/assistant/client/${clientId}`);
  };

  const handleConversationClick = (conversation) => {
    if (conversation.mode === 'client_specific' && conversation.client_id) {
      navigate(`/assistant/client/${conversation.client_id}?conversation=${conversation.id}`);
    } else {
      navigate(`/assistant/general?conversation=${conversation.id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const categoryIcons = {
    conteudo: FileText,
    analise: BarChart3,
    criativo: Palette,
    estrategia: Target,
  };

  const categoryLabels = {
    conteudo: 'Conteúdo',
    analise: 'Análise',
    criativo: 'Criativo',
    estrategia: 'Estratégia',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-purple-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">
                Assistente de Projetos
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Gerencie projetos e tarefas com inteligência artificial
              </p>
            </div>
          </div>
        </div>

        {/* Botões Principais - Destaque */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="h-full border-2 border-gray-200 dark:border-gray-800 hover:border-orange-500/50 dark:hover:border-orange-500/50 transition-all cursor-pointer group">
              <CardContent className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-600/10 group-hover:from-orange-500/20 group-hover:to-orange-600/20 transition-colors">
                    <Building2 className="h-8 w-8 text-orange-600 dark:text-orange-500" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Cliente Específico
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  Trabalhe com projetos focados em um cliente específico. Acesse histórico completo, documentos e tarefas relacionadas.
                </p>
                <Button
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                  onClick={() => navigate('/assistant/select-client')}
                >
                  Selecionar Cliente
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="h-full border-2 border-gray-200 dark:border-gray-800 hover:border-purple-500/50 dark:hover:border-purple-500/50 transition-all cursor-pointer group">
              <CardContent className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 group-hover:from-purple-500/20 group-hover:to-purple-600/20 transition-colors">
                    <MessageSquare className="h-8 w-8 text-purple-600 dark:text-purple-500" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Chat Geral
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  Acesse todas as funcionalidades da agência. Crie roteiros, legendas, análises e muito mais com acesso completo aos dados.
                </p>
                <Button
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white"
                  onClick={() => navigate('/assistant/general')}
                >
                  Abrir Chat Geral
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Dashboard de Aprendizado */}
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
          className="mb-10"
        >
          <Card className="border-2 border-gray-200 dark:border-gray-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all cursor-pointer group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 group-hover:from-blue-500/20 group-hover:to-blue-600/20 transition-colors">
                    <Brain className="h-6 w-6 text-blue-600 dark:text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      Dashboard de Aprendizado
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize como a IA está aprendendo com suas interações e preferências
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  onClick={() => navigate('/assistant/learning')}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Ver Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ações Rápidas */}
        <Card className="mb-8 border border-gray-200 dark:border-gray-800 shadow-sm">
          <CardContent className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Zap className="h-5 w-5 text-orange-600 dark:text-orange-500" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Ações Rápidas</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(quickActions).map(([category, actions]) => {
                const CategoryIcon = categoryIcons[category];
                return (
                  <div key={category} className="space-y-3">
                    <div className="flex items-center gap-2 mb-4">
                      <CategoryIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        {categoryLabels[category]}
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {actions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <Button
                            key={action.id}
                            variant="ghost"
                            className="w-full justify-start h-auto py-2.5 px-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            onClick={() => handleQuickAction(action)}
                          >
                            <Icon className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{action.label}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Clientes Frequentes */}
          {frequentClients.length > 0 && (
            <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Clientes Frequentes</h2>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs"
                    onClick={() => navigate('/assistant/select-client')}
                  >
                    Ver todos
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {frequentClients.map((client) => (
                    <Badge
                      key={client.id}
                      variant="secondary"
                      className="px-4 py-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => handleClientClick(client.id)}
                    >
                      <Building2 className="h-3 w-3 mr-2" />
                      {client.empresa}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conversas Recentes */}
          {recentConversations.length > 0 && (
            <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Clock className="h-5 w-5 text-purple-600 dark:text-purple-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Conversas Recentes</h2>
                  </div>
                </div>
                <ScrollArea className="h-[240px]">
                  <div className="space-y-2">
                    {recentConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-all group"
                        onClick={() => handleConversationClick(conv)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {conv.mode === 'client_specific' ? (
                                <Building2 className="h-4 w-4 text-orange-600 dark:text-orange-500 flex-shrink-0" />
                              ) : (
                                <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-500 flex-shrink-0" />
                              )}
                              <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                {conv.mode === 'client_specific' 
                                  ? conv.clientes?.empresa || 'Cliente'
                                  : 'Chat Geral'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                              {conv.title || 'Sem título'}
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                            {formatTimeAgo(conv.updated_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssistantHome;

