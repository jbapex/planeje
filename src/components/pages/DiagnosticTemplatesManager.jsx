import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Edit, Trash2, GripVertical, Sparkles } from 'lucide-react';
import { supabaseUrl } from '@/lib/customSupabaseClient';

const DiagnosticTemplatesManager = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [questions, setQuestions] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', is_active: true });
  const [questionForm, setQuestionForm] = useState({ question: '', type: 'choice', options: [], block: '', key: '', order_index: 0 });
  const [generatingWithAI, setGeneratingWithAI] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('diagnostic_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
      if (data) {
        for (const template of data) {
          await loadQuestions(template.id);
        }
      }
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (templateId) => {
    try {
      const { data, error } = await supabase
        .from('diagnostic_template_questions')
        .select('*')
        .eq('template_id', templateId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      setQuestions(prev => ({ ...prev, [templateId]: data || [] }));
    } catch (err) {
      console.error('Erro ao carregar perguntas:', err);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('diagnostic_templates')
          .update(templateForm)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Template atualizado.' });
      } else {
        const { error } = await supabase
          .from('diagnostic_templates')
          .insert([templateForm]);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Template criado.' });
      }
      setEditingTemplate(null);
      setTemplateDialogOpen(false);
      setTemplateForm({ name: '', description: '', is_active: true });
      loadTemplates();
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Tem certeza? Isso apagará o template e todas as perguntas.')) return;
    try {
      const { error } = await supabase.from('diagnostic_templates').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Template deletado.' });
      loadTemplates();
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveQuestion = async (templateId) => {
    try {
      // Se for pergunta open, garante que seja a última
      let finalOrderIndex = questionForm.order_index;
      if (questionForm.type === 'open') {
        const existingQuestions = questions[templateId] || [];
        const maxOrder = existingQuestions.reduce((max, q) => Math.max(max, q.order_index || 0), 0);
        // Se está editando e já é open, mantém a ordem; senão, coloca no final
        if (editingQuestion && editingQuestion.type === 'open') {
          finalOrderIndex = editingQuestion.order_index;
        } else {
          finalOrderIndex = maxOrder + 1;
        }
      }
      
      const payload = {
        ...questionForm,
        template_id: templateId,
        order_index: finalOrderIndex,
        options: questionForm.type === 'choice' ? questionForm.options : null,
      };
      
      if (editingQuestion) {
        const { error } = await supabase
          .from('diagnostic_template_questions')
          .update(payload)
          .eq('id', editingQuestion.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Pergunta atualizada.' });
      } else {
        const { error } = await supabase
          .from('diagnostic_template_questions')
          .insert([payload]);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Pergunta adicionada.' });
      }
      setEditingQuestion(null);
      setQuestionDialogOpen(false);
      setQuestionForm({ question: '', type: 'choice', options: [], block: '', key: '', order_index: 0 });
      loadQuestions(templateId);
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteQuestion = async (questionId, templateId) => {
    if (!confirm('Tem certeza?')) return;
    try {
      const { error } = await supabase.from('diagnostic_template_questions').delete().eq('id', questionId);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Pergunta deletada.' });
      loadQuestions(templateId);
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const addOption = () => {
    setQuestionForm(prev => ({
      ...prev,
      options: [...(prev.options || []), { text: '' }],
    }));
  };

  const updateOption = (index, text) => {
    setQuestionForm(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? { text } : opt),
    }));
  };

  const removeOption = (index) => {
    setQuestionForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const generateQuestionsWithAI = async (templateDescription) => {
    if (!templateDescription.trim()) {
      toast({ title: 'Erro', description: 'Descreva o template ou nicho.', variant: 'destructive' });
      return;
    }
    setGeneratingWithAI(true);
    try {
      const prompt = `Você é uma IA especializada em criar questionários de diagnóstico de marketing.

Crie um conjunto de 8-10 perguntas estratégicas para um diagnóstico de marketing focado em: ${templateDescription}

REGRAS IMPORTANTES:
- Apenas UMA pergunta pode ser do tipo "open" (mensagem personalizada)
- A pergunta "open" DEVE SER SEMPRE A ÚLTIMA do array
- Todas as outras perguntas devem ser tipo "choice" (com opções de resposta)
- Cada pergunta "choice" deve ter pelo menos 2 opções

Retorne APENAS um JSON válido no seguinte formato (sem explicações, apenas o JSON):
{
  "questions": [
    {
      "question": "Texto da pergunta",
      "type": "choice" ou "open",
      "block": "Nome do bloco (ex: Presença Digital)",
      "key": "chave_identificadora",
      "options": [{"text": "Opção 1"}, {"text": "Opção 2"}] (apenas se type for "choice", obrigatório para choice)
    }
  ]
}

As perguntas devem ser relevantes, práticas e focadas em identificar problemas de marketing/growth do negócio.
Inclua perguntas sobre: presença digital, estratégia, métricas, atendimento, diferenciação.
A última pergunta deve ser "open" e perguntar sobre o principal problema que o negócio quer resolver.

Retorne APENAS o JSON, sem markdown, sem code blocks.`;

      const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL || supabaseUrl}/functions/v1/openai-chat`;
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao comunicar com a IA');
      }

      const contentType = response.headers.get('content-type') || '';
      let content = '';
      
      if (contentType.includes('text/event-stream')) {
        // SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bufferedText = '';
        let assembledContent = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bufferedText += decoder.decode(value, { stream: true });
          const parts = bufferedText.split('\n\n');
          bufferedText = parts.pop() || '';
          for (const chunk of parts) {
            const line = chunk.trim();
            if (!line.startsWith('data:')) continue;
            const dataStr = line.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') assembledContent += delta;
              const full = parsed?.choices?.[0]?.message?.content;
              if (typeof full === 'string') assembledContent += full;
            } catch (_) {}
          }
        }
        content = assembledContent;
      } else {
        const data = await response.json();
        content = data?.content || '';
      }

      // Limpa markdown se houver
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(content);
      
      if (parsed.questions && Array.isArray(parsed.questions)) {
        // Separa perguntas choice e open, colocando open sempre por último
        const choiceQuestions = parsed.questions.filter(q => q.type !== 'open');
        const openQuestions = parsed.questions.filter(q => q.type === 'open');
        
        // Máximo 1 pergunta open (sempre a última)
        const finalOpen = openQuestions.length > 0 ? [openQuestions[0]] : [];
        
        // Reordena: todas as choice primeiro, depois a open (se houver)
        const orderedQuestions = [...choiceQuestions, ...finalOpen];
        
        setGeneratedQuestions(orderedQuestions.map((q, idx) => ({
          ...q,
          order_index: idx + 1,
        })));
        toast({ title: 'Sucesso', description: `${orderedQuestions.length} perguntas geradas pela IA!` });
      } else {
        throw new Error('Formato de resposta inválido da IA');
      }
    } catch (err) {
      console.error('Erro ao gerar perguntas:', err);
      toast({ title: 'Erro', description: err.message || 'Falha ao gerar perguntas com IA', variant: 'destructive' });
    } finally {
      setGeneratingWithAI(false);
    }
  };

  const useGeneratedQuestion = (genQuestion, orderIndex) => {
    setQuestionForm({
      question: genQuestion.question,
      type: genQuestion.type || 'choice',
      options: genQuestion.options || [],
      block: genQuestion.block || '',
      key: genQuestion.key || '',
      order_index: orderIndex,
    });
    // Remove a pergunta da lista de geradas
    setGeneratedQuestions(prev => prev.filter((_, idx) => {
      const foundIdx = prev.findIndex(q => q.question === genQuestion.question);
      return idx !== foundIdx;
    }));
  };

  const saveAllGeneratedQuestions = async (templateId) => {
    if (generatedQuestions.length === 0) return;
    try {
      const existingQuestions = questions[templateId] || [];
      const maxOrder = existingQuestions.reduce((max, q) => Math.max(max, q.order_index || 0), 0);
      
      // Separa choice e open, colocando open sempre por último
      const choiceQuestions = generatedQuestions.filter(q => q.type !== 'open');
      const openQuestions = generatedQuestions.filter(q => q.type === 'open');
      
      // Máximo 1 pergunta open (sempre a última)
      const finalOpen = openQuestions.length > 0 ? [openQuestions[0]] : [];
      
      // Reordena: todas as choice primeiro, depois a open (se houver)
      const orderedQuestions = [...choiceQuestions, ...finalOpen];
      
      const payloads = orderedQuestions.map((q, idx) => ({
        template_id: templateId,
        question: q.question,
        type: q.type || 'choice',
        options: q.type === 'choice' ? q.options : null,
        block: q.block || '',
        key: q.key || '',
        order_index: maxOrder + idx + 1,
      }));
      
      const { error } = await supabase
        .from('diagnostic_template_questions')
        .insert(payloads);
      if (error) throw error;
      toast({ title: 'Sucesso', description: `${payloads.length} perguntas adicionadas!` });
      setGeneratedQuestions([]);
      setAiDescription('');
      loadQuestions(templateId);
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Templates de Diagnóstico</h2>
        <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) setEditingTemplate(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingTemplate(null);
              setTemplateForm({ name: '', description: '', is_active: true });
              setTemplateDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={templateForm.name} onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={templateForm.description} onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={templateForm.is_active} onCheckedChange={(checked) => setTemplateForm(prev => ({ ...prev, is_active: checked }))} />
                <Label>Ativo</Label>
              </div>
              <Button onClick={handleSaveTemplate}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates.map(template => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                  <Badge className={template.is_active ? 'bg-green-500' : 'bg-gray-500'}>{template.is_active ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingTemplate(template);
                    setTemplateForm({ name: template.name, description: template.description || '', is_active: template.is_active });
                    setTemplateDialogOpen(true);
                  }}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteTemplate(template.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Perguntas ({questions[template.id]?.length || 0})</h3>
                  <Dialog open={questionDialogOpen} onOpenChange={(open) => { 
                    setQuestionDialogOpen(open); 
                    if (!open) {
                      setEditingQuestion(null);
                      setGeneratedQuestions([]);
                      setAiDescription('');
                      setCurrentTemplateId(null);
                    } else {
                      setCurrentTemplateId(template.id);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => {
                        setEditingQuestion(null);
                        setCurrentTemplateId(template.id);
                        setQuestionForm({
                          question: '',
                          type: 'choice',
                          options: [],
                          block: '',
                          key: '',
                          order_index: (questions[template.id]?.length || 0) + 1,
                        });
                        setQuestionDialogOpen(true);
                      }}>
                        <Plus className="mr-2 h-4 w-4" /> Adicionar Pergunta
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingQuestion ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {!editingQuestion && (
                          <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                <h4 className="font-semibold">Gerar perguntas com IA</h4>
                              </div>
                              <p className="text-sm text-muted-foreground">Descreva o template ou nicho para a IA gerar perguntas automaticamente.</p>
                              <div className="flex gap-2">
                                <Input
                                  value={aiDescription}
                                  onChange={(e) => setAiDescription(e.target.value)}
                                  placeholder="ex: E-commerce de moda, clínica odontológica, restaurante..."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      generateQuestionsWithAI(aiDescription);
                                    }
                                  }}
                                />
                                <Button
                                  onClick={() => generateQuestionsWithAI(aiDescription)}
                                  disabled={generatingWithAI || !aiDescription.trim()}
                                >
                                  {generatingWithAI ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
                                  ) : (
                                    <><Sparkles className="mr-2 h-4 w-4" /> Gerar</>
                                  )}
                                </Button>
                              </div>
                              {generatedQuestions.length > 0 && (
                                <div className="space-y-2 mt-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">{generatedQuestions.length} perguntas geradas:</p>
                                    <Button size="sm" onClick={() => {
                                      if (currentTemplateId) {
                                        saveAllGeneratedQuestions(currentTemplateId);
                                      } else {
                                        toast({ title: 'Erro', description: 'Template não identificado. Feche e abra novamente.', variant: 'destructive' });
                                      }
                                    }}>
                                      Salvar todas
                                    </Button>
                                  </div>
                                  <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {generatedQuestions.map((q, idx) => (
                                      <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border text-sm flex items-center justify-between">
                                        <span className="flex-1">{q.question}</span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            if (currentTemplateId) {
                                              useGeneratedQuestion(q, (questions[currentTemplateId]?.length || 0) + 1);
                                            } else {
                                              toast({ title: 'Erro', description: 'Template não identificado.', variant: 'destructive' });
                                            }
                                          }}
                                        >
                                          Usar
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </Card>
                        )}
                        <div className="border-t pt-4">
                          <h4 className="font-semibold mb-3">{editingQuestion ? 'Editar pergunta' : 'Adicionar pergunta manualmente'}</h4>
                        </div>
                        <div>
                          <Label>Pergunta</Label>
                          <Textarea value={questionForm.question} onChange={(e) => setQuestionForm(prev => ({ ...prev, question: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Tipo</Label>
                          <select
                            className="w-full p-2 border rounded"
                            value={questionForm.type}
                            onChange={(e) => setQuestionForm(prev => ({ ...prev, type: e.target.value }))}
                          >
                            <option value="choice">Escolha</option>
                            <option value="open">Aberta</option>
                          </select>
                        </div>
                        <div>
                          <Label>Bloco</Label>
                          <Input value={questionForm.block} onChange={(e) => setQuestionForm(prev => ({ ...prev, block: e.target.value }))} placeholder="ex: Presença Digital" />
                        </div>
                        <div>
                          <Label>Chave (key)</Label>
                          <Input value={questionForm.key} onChange={(e) => setQuestionForm(prev => ({ ...prev, key: e.target.value }))} placeholder="ex: publica_conteudo" />
                        </div>
                        <div>
                          <Label>Ordem</Label>
                          <Input type="number" value={questionForm.order_index} onChange={(e) => setQuestionForm(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))} />
                        </div>
                        {questionForm.type === 'choice' && (
                          <div>
                            <Label>Opções</Label>
                            {questionForm.options?.map((opt, idx) => (
                              <div key={idx} className="flex gap-2 mb-2">
                                <Input value={opt.text} onChange={(e) => updateOption(idx, e.target.value)} placeholder="Texto da opção" />
                                <Button variant="outline" size="sm" onClick={() => removeOption(idx)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={addOption}><Plus className="h-4 w-4 mr-2" />Adicionar Opção</Button>
                          </div>
                        )}
                        <Button onClick={() => {
                          if (currentTemplateId) {
                            handleSaveQuestion(currentTemplateId);
                          } else {
                            toast({ title: 'Erro', description: 'Template não identificado. Feche e abra novamente.', variant: 'destructive' });
                          }
                        }}>Salvar</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="space-y-2">
                  {questions[template.id]?.map((q, idx) => (
                    <div key={q.id} className="p-3 border rounded flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{q.order_index}. {q.question}</span>
                          <Badge variant="outline">{q.type}</Badge>
                          {q.block && <Badge variant="outline">{q.block}</Badge>}
                        </div>
                        {q.options && (
                          <div className="text-sm text-muted-foreground ml-6">
                            {q.options.map((opt, i) => (
                              <span key={i}>{opt.text}{i < q.options.length - 1 ? ', ' : ''}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          setEditingQuestion(q);
                          setCurrentTemplateId(template.id);
                          setQuestionForm({
                            question: q.question,
                            type: q.type || 'choice',
                            options: q.options || [],
                            block: q.block || '',
                            key: q.key || '',
                            order_index: q.order_index || 0,
                          });
                          setQuestionDialogOpen(true);
                        }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteQuestion(q.id, template.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DiagnosticTemplatesManager;

