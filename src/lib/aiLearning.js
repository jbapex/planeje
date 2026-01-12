/**
 * Sistema de Aprendizado Contínuo para IA
 * Gerencia feedback, preferências, padrões aprendidos e exemplos de referência
 */

import { supabase } from '@/lib/customSupabaseClient';

/**
 * Salvar feedback do usuário sobre uma resposta da IA
 */
export async function saveFeedback({
  conversationId,
  messageIndex,
  feedbackType, // 'positive', 'negative', 'correction'
  originalMessage,
  correctedMessage = null,
  feedbackNotes = null,
  messageType = null,
  clientId = null,
  modelUsed = null,
  userId = null
}) {
  try {
    // Obter userId se não fornecido
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      userId = user.id;
    }

    const { data, error } = await supabase
      .from('ai_learning_feedback')
      .insert({
        conversation_id: conversationId,
        message_index: messageIndex,
        feedback_type: feedbackType,
        user_id: userId,
        original_message: originalMessage,
        corrected_message: correctedMessage,
        feedback_notes: feedbackNotes,
        message_type: messageType,
        client_id: clientId,
        model_used: modelUsed,
        learned_patterns: {} // Será preenchido por análise posterior
      })
      .select()
      .single();

    if (error) throw error;

    // Se for feedback positivo ou correção, analisar padrões
    if (feedbackType === 'positive' || feedbackType === 'correction') {
      await analyzeAndUpdatePreferences(userId, originalMessage, correctedMessage, messageType);
    }

    return data;
  } catch (error) {
    console.error('Erro ao salvar feedback:', error);
    throw error;
  }
}

/**
 * Obter preferências do usuário
 */
export async function getUserPreferences(userId = null) {
  try {
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      userId = user.id;
    }

    const { data, error } = await supabase
      .from('ai_user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = não encontrado

    // Se não existir, criar com valores padrão
    if (!data) {
      const { data: newData, error: insertError } = await supabase
        .from('ai_user_preferences')
        .insert({
          user_id: userId,
          preferred_campaign_format: {},
          preferred_analysis_depth: 'medium',
          preferred_tone: null,
          preferred_presentation_style: {},
          preferred_models: {},
          preferences: {}
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newData;
    }

    return data;
  } catch (error) {
    console.error('Erro ao obter preferências:', error);
    return null;
  }
}

/**
 * Atualizar preferências do usuário
 */
export async function updateUserPreferences(preferences, userId = null) {
  try {
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      userId = user.id;
    }

    const { data, error } = await supabase
      .from('ai_user_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao atualizar preferências:', error);
    throw error;
  }
}

/**
 * Analisar feedback e atualizar preferências
 */
async function analyzeAndUpdatePreferences(userId, originalMessage, correctedMessage, messageType) {
  try {
    const preferences = await getUserPreferences(userId);
    if (!preferences) return;

    const updates = {};

    // Se houver correção, analisar diferenças
    if (correctedMessage) {
      const differences = analyzeMessageDifferences(originalMessage, correctedMessage);
      
      // Atualizar preferências baseado nas diferenças
      if (differences.structure) {
        updates.preferred_presentation_style = {
          ...preferences.preferred_presentation_style,
          structure: differences.structure
        };
      }
      
      if (differences.tone) {
        updates.preferred_tone = differences.tone;
      }
      
      if (differences.depth) {
        updates.preferred_analysis_depth = differences.depth;
      }
    }

    // Se for feedback positivo sem correção, reforçar padrões existentes
    if (!correctedMessage && messageType) {
      // Incrementar confiança nos padrões existentes
      const currentFormat = preferences.preferred_campaign_format || {};
      updates.preferred_campaign_format = {
        ...currentFormat,
        [messageType]: {
          ...currentFormat[messageType],
          positive_feedback_count: (currentFormat[messageType]?.positive_feedback_count || 0) + 1
        }
      };
    }

    if (Object.keys(updates).length > 0) {
      await updateUserPreferences(updates, userId);
    }
  } catch (error) {
    console.error('Erro ao analisar preferências:', error);
  }
}

/**
 * Analisar diferenças entre mensagem original e corrigida
 */
function analyzeMessageDifferences(original, corrected) {
  const differences = {};

  // Análise básica de estrutura
  const originalSections = countSections(original);
  const correctedSections = countSections(corrected);
  
  if (originalSections !== correctedSections) {
    differences.structure = {
      preferred_sections: correctedSections,
      section_count: correctedSections
    };
  }

  // Análise de tom (básico)
  const originalTone = detectTone(original);
  const correctedTone = detectTone(corrected);
  
  if (originalTone !== correctedTone) {
    differences.tone = correctedTone;
  }

  // Análise de profundidade (básico)
  const originalDepth = estimateDepth(original);
  const correctedDepth = estimateDepth(corrected);
  
  if (originalDepth !== correctedDepth) {
    differences.depth = correctedDepth;
  }

  return differences;
}

/**
 * Contar seções em uma mensagem
 */
function countSections(text) {
  // Contar títulos (markdown ## ou ###)
  const headingMatches = text.match(/^#{2,3}\s+.+$/gm);
  return headingMatches ? headingMatches.length : 0;
}

/**
 * Detectar tom da mensagem
 */
function detectTone(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('formal') || lowerText.includes('senhor') || lowerText.includes('senhora')) {
    return 'formal';
  }
  if (lowerText.includes('casual') || lowerText.includes('beleza') || lowerText.includes('tranquilo')) {
    return 'casual';
  }
  if (lowerText.includes('técnico') || lowerText.includes('dados') || lowerText.includes('métricas')) {
    return 'technical';
  }
  
  return 'professional';
}

/**
 * Estimar profundidade da análise
 */
function estimateDepth(text) {
  const wordCount = text.split(/\s+/).length;
  
  if (wordCount < 200) return 'shallow';
  if (wordCount < 500) return 'medium';
  return 'deep';
}

/**
 * Marcar mensagem como exemplo de referência
 */
export async function saveReferenceExample({
  conversationId,
  messageIndex,
  exampleType,
  exampleContent,
  clientId = null,
  tags = [],
  description = null,
  userId = null
}) {
  try {
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      userId = user.id;
    }

    // Extrair estrutura do exemplo
    const exampleStructure = extractStructure(exampleContent);

    const { data, error } = await supabase
      .from('ai_reference_examples')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        message_index: messageIndex,
        example_type: exampleType,
        example_content: exampleContent,
        example_structure: exampleStructure,
        client_id: clientId,
        tags: tags,
        description: description
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao salvar exemplo:', error);
    throw error;
  }
}

/**
 * Buscar exemplos de referência similares
 */
export async function findSimilarExamples(exampleType, tags = [], limit = 5, userId = null) {
  try {
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      userId = user.id;
    }

    let query = supabase
      .from('ai_reference_examples')
      .select('*')
      .eq('user_id', userId)
      .eq('example_type', exampleType)
      .order('times_referenced', { ascending: false })
      .limit(limit);

    // Se houver tags, filtrar por tags
    if (tags.length > 0) {
      query = query.contains('tags', tags);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar exemplos:', error);
    return [];
  }
}

/**
 * Extrair estrutura de um exemplo
 */
function extractStructure(content) {
  const structure = {
    sections: [],
    hasList: false,
    hasTable: false,
    hasCode: false
  };

  // Detectar seções (títulos markdown)
  const headings = content.match(/^#{1,3}\s+(.+)$/gm);
  if (headings) {
    structure.sections = headings.map(h => h.replace(/^#+\s+/, ''));
  }

  // Detectar listas
  if (content.match(/^[-*+]\s+/m) || content.match(/^\d+\.\s+/m)) {
    structure.hasList = true;
  }

  // Detectar tabelas
  if (content.includes('|')) {
    structure.hasTable = true;
  }

  // Detectar código
  if (content.includes('```')) {
    structure.hasCode = true;
  }

  return structure;
}

/**
 * Obter padrões aprendidos relevantes
 */
export async function getRelevantPatterns(patternType, clientId = null, niche = null, limit = 5) {
  try {
    let query = supabase
      .from('ai_learned_patterns')
      .select('*')
      .eq('pattern_type', patternType)
      .order('confidence_score', { ascending: false })
      .order('success_rate', { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq('client_id', clientId);
    } else if (niche) {
      query = query.eq('niche', niche);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar padrões:', error);
    return [];
  }
}

/**
 * Aplicar preferências aprendidas ao prompt do sistema
 */
export async function applyLearnedPreferences(systemPrompt, messageType = null, userId = null) {
  try {
    const preferences = await getUserPreferences(userId);
    if (!preferences) return systemPrompt;

    let enhancedPrompt = systemPrompt;

    // Aplicar preferências de profundidade
    if (preferences.preferred_analysis_depth) {
      const depthInstructions = {
        shallow: 'Seja conciso e direto ao ponto.',
        medium: 'Forneça detalhes moderados, equilibrando profundidade e clareza.',
        deep: 'Seja extremamente detalhado e abrangente, fornecendo análise profunda.'
      };
      enhancedPrompt += `\n\n**Nível de Detalhamento Preferido:** ${depthInstructions[preferences.preferred_analysis_depth]}`;
    }

    // Aplicar preferências de tom
    if (preferences.preferred_tone) {
      const toneInstructions = {
        formal: 'Use linguagem formal e respeitosa.',
        casual: 'Use linguagem casual e descontraída.',
        technical: 'Use linguagem técnica e precisa.',
        professional: 'Use linguagem profissional e equilibrada.'
      };
      enhancedPrompt += `\n\n**Tom de Voz Preferido:** ${toneInstructions[preferences.preferred_tone] || toneInstructions.professional}`;
    }

    // Aplicar preferências de formato (se específico para o tipo de mensagem)
    if (messageType && preferences.preferred_campaign_format?.[messageType]) {
      const format = preferences.preferred_campaign_format[messageType];
      enhancedPrompt += `\n\n**Formato Preferido para ${messageType}:** Siga o formato que foi bem recebido anteriormente.`;
    }

    return enhancedPrompt;
  } catch (error) {
    console.error('Erro ao aplicar preferências:', error);
    return systemPrompt;
  }
}

/**
 * Incrementar contador de referência de um exemplo
 */
export async function incrementExampleReference(exampleId) {
  try {
    const { data, error } = await supabase.rpc('increment_example_reference', {
      example_id: exampleId
    });

    if (error) {
      // Se a função RPC não existir, fazer update manual
      const { data: example } = await supabase
        .from('ai_reference_examples')
        .select('times_referenced')
        .eq('id', exampleId)
        .single();

      if (example) {
        await supabase
          .from('ai_reference_examples')
          .update({ times_referenced: (example.times_referenced || 0) + 1 })
          .eq('id', exampleId);
      }
    }

    return data;
  } catch (error) {
    console.error('Erro ao incrementar referência:', error);
  }
}

