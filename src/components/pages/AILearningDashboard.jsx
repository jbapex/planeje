/**
 * Dashboard para visualizar o aprendizado da IA
 * Mostra feedback, preferências, padrões e exemplos
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ThumbsUp, ThumbsDown, Edit, Star, TrendingUp, BarChart3, FileText, Sparkles } from 'lucide-react';

const AILearningDashboard = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalFeedback: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    corrections: 0,
    examples: 0,
    preferences: null
  });
  const [recentFeedback, setRecentFeedback] = useState([]);
  const [examples, setExamples] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [isLearningActive, setIsLearningActive] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Carregar estatísticas de feedback
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('ai_learning_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (feedbackError) throw feedbackError;

      // Carregar exemplos
      const { data: examplesData, error: examplesError } = await supabase
        .from('ai_reference_examples')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (examplesError) throw examplesError;

      // Carregar preferências
      const { data: preferencesData, error: preferencesError } = await supabase
        .from('ai_user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (preferencesError && preferencesError.code !== 'PGRST116') throw preferencesError;

      // Carregar padrões aprendidos
      const { data: patternsData, error: patternsError } = await supabase
        .from('ai_learned_patterns')
        .select('*')
        .eq('user_id', user.id)
        .order('confidence_score', { ascending: false })
        .limit(10);

      if (patternsError) console.error('Erro ao carregar padrões:', patternsError);

      // Calcular estatísticas
      const totalFeedback = feedbackData?.length || 0;
      const positiveFeedback = feedbackData?.filter(f => f.feedback_type === 'positive').length || 0;
      const negativeFeedback = feedbackData?.filter(f => f.feedback_type === 'negative').length || 0;
      const corrections = feedbackData?.filter(f => f.feedback_type === 'correction').length || 0;

      setStats({
        totalFeedback,
        positiveFeedback,
        negativeFeedback,
        corrections,
        examples: examplesData?.length || 0,
        preferences: preferencesData
      });

      setRecentFeedback(feedbackData || []);
      setExamples(examplesData || []);
      setPreferences(preferencesData);
      setPatterns(patternsData || []);

      // Verificar se o aprendizado está ativo
      // Considera ativo se há pelo menos 3 feedbacks ou preferências definidas
      const hasEnoughData = totalFeedback >= 3 || preferencesData !== null;
      setIsLearningActive(hasEnoughData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Carregando dados de aprendizado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard de Aprendizado da IA</h1>
            <p className="text-gray-500 mt-2">
              Visualize como a IA está aprendendo com suas interações
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-lg ${isLearningActive ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isLearningActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                <span className={`text-sm font-medium ${isLearningActive ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                  {isLearningActive ? '✅ Modo Inteligente Ativo' : '⚠️ Coletando Dados'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {!isLearningActive && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Dica:</strong> Dê pelo menos 3 feedbacks para ativar o modo inteligente. 
              Quanto mais você usar, mais inteligente a IA fica!
            </p>
          </div>
        )}
      </div>

      {/* Estatísticas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500">Total de Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFeedback}</div>
            <p className="text-xs text-gray-500 mt-1">Interações registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-500" />
              Positivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.positiveFeedback}</div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.totalFeedback > 0 
                ? `${Math.round((stats.positiveFeedback / stats.totalFeedback) * 100)}% do total`
                : '0%'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-red-500" />
              Negativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.negativeFeedback}</div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.totalFeedback > 0 
                ? `${Math.round((stats.negativeFeedback / stats.totalFeedback) * 100)}% do total`
                : '0%'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              Exemplos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.examples}</div>
            <p className="text-xs text-gray-500 mt-1">Salvos como referência</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Detalhes */}
      <Tabs defaultValue="feedback" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feedback">Feedback Recente</TabsTrigger>
          <TabsTrigger value="preferences">Preferências</TabsTrigger>
          <TabsTrigger value="examples">Exemplos</TabsTrigger>
          <TabsTrigger value="patterns">Padrões Aprendidos</TabsTrigger>
        </TabsList>

        {/* Tab: Feedback Recente */}
        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feedback Recente</CardTitle>
              <CardDescription>
                Últimas interações com feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentFeedback.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Nenhum feedback registrado ainda.</p>
                  <p className="text-sm mt-2">Comece a dar feedback nas respostas da IA!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentFeedback.map((feedback) => (
                    <div
                      key={feedback.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {feedback.feedback_type === 'positive' && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <ThumbsUp className="h-3 w-3 mr-1" />
                                Positivo
                              </Badge>
                            )}
                            {feedback.feedback_type === 'negative' && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                <ThumbsDown className="h-3 w-3 mr-1" />
                                Negativo
                              </Badge>
                            )}
                            {feedback.feedback_type === 'correction' && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <Edit className="h-3 w-3 mr-1" />
                                Correção
                              </Badge>
                            )}
                            {feedback.message_type && (
                              <Badge variant="secondary">{feedback.message_type}</Badge>
                            )}
                            {feedback.model_used && (
                              <Badge variant="outline" className="text-xs">
                                {feedback.model_used.split('/').pop()}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                            {feedback.original_message.substring(0, 200)}
                            {feedback.original_message.length > 200 && '...'}
                          </p>
                          {feedback.feedback_notes && (
                            <p className="text-xs text-gray-500 mt-2 italic">
                              Nota: {feedback.feedback_notes}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 ml-4">
                          {new Date(feedback.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Preferências */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preferências Aprendidas</CardTitle>
              <CardDescription>
                Preferências identificadas pelo sistema baseado no seu feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!preferences ? (
                <div className="text-center py-8 text-gray-500">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Nenhuma preferência aprendida ainda.</p>
                  <p className="text-sm mt-2">Dê mais feedback para o sistema aprender suas preferências!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Profundidade de Análise</h3>
                    <Badge variant="outline" className="text-sm">
                      {preferences.preferred_analysis_depth === 'shallow' && 'Superficial'}
                      {preferences.preferred_analysis_depth === 'medium' && 'Médio'}
                      {preferences.preferred_analysis_depth === 'deep' && 'Profundo'}
                    </Badge>
                  </div>

                  {preferences.preferred_tone && (
                    <div>
                      <h3 className="font-semibold mb-2">Tom de Voz</h3>
                      <Badge variant="outline" className="text-sm">
                        {preferences.preferred_tone}
                      </Badge>
                    </div>
                  )}

                  {preferences.preferred_models && Object.keys(preferences.preferred_models).length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Modelos Preferidos</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(preferences.preferred_models).map(([type, model]) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {type}: {model?.split('/').pop() || model}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 mt-4">
                    Última atualização: {new Date(preferences.updated_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Exemplos */}
        <TabsContent value="examples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exemplos de Referência</CardTitle>
              <CardDescription>
                Respostas marcadas como exemplos para uso futuro
              </CardDescription>
            </CardHeader>
            <CardContent>
              {examples.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Star className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Nenhum exemplo salvo ainda.</p>
                  <p className="text-sm mt-2">Marque respostas como "Exemplo" para salvá-las!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {examples.map((example) => (
                    <div
                      key={example.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            <Star className="h-3 w-3 mr-1" />
                            {example.example_type}
                          </Badge>
                          {example.tags && example.tags.length > 0 && (
                            <div className="flex gap-1">
                              {example.tags.map((tag, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {example.times_referenced > 0 && (
                            <span className="mr-2">
                              Usado {example.times_referenced}x
                            </span>
                          )}
                          {new Date(example.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                        {example.example_content.substring(0, 300)}
                        {example.example_content.length > 300 && '...'}
                      </p>
                      {example.description && (
                        <p className="text-xs text-gray-500 mt-2 italic">
                          {example.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Padrões Aprendidos */}
        <TabsContent value="patterns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Padrões de Sucesso Identificados</CardTitle>
              <CardDescription>
                Padrões que o sistema identificou como bem-sucedidos baseado no seu feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              {patterns.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Nenhum padrão identificado ainda.</p>
                  <p className="text-sm mt-2">Dê mais feedback para o sistema identificar padrões de sucesso!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {patterns.map((pattern) => (
                    <div
                      key={pattern.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            {pattern.pattern_type}
                          </Badge>
                          {pattern.niche && (
                            <Badge variant="secondary" className="text-xs">
                              {pattern.niche}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          Confiança: {pattern.confidence_score}%
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-green-600 dark:text-green-400">
                            {pattern.success_rate}% sucesso
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                          <span className="text-blue-600 dark:text-blue-400">
                            Usado {pattern.times_used}x
                          </span>
                        </div>
                        {pattern.last_used_at && (
                          <div className="text-gray-500">
                            Último uso: {new Date(pattern.last_used_at).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AILearningDashboard;

