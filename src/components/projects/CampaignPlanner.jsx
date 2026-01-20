import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { Save, Sparkles, AlertTriangle, PlusCircle, Trash2, Edit, Check, Plus, FileText, Video, Target, Megaphone, Lightbulb, DollarSign, List, Calendar, Loader2, Wand2, Bot, FileDown, BookOpen, Download } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { useToast } from '@/components/ui/use-toast';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
    import { supabase } from '@/lib/customSupabaseClient';
    import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent } from "@/components/ui/alert-dialog";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { motion } from 'framer-motion';
    import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
    import AiChatDialog from '@/components/projects/AiChatDialog';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import { format } from 'date-fns';

    const SectionCard = ({ icon, title, children }) => (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="overflow-hidden">
                <CardHeader className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex flex-row items-center gap-3 space-y-0 py-4">
                    {icon}
                    <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    {children}
                </CardContent>
            </Card>
        </motion.div>
    );

    const CampaignPlanner = ({ project, client, onClose, isPage = false }) => {
      const [plan, setPlan] = useState(null);
      const [loading, setLoading] = useState(true);
      const [isGenerating, setIsGenerating] = useState(false);
      const [generatingField, setGeneratingField] = useState(null);
      const [showIncompleteDataAlert, setShowIncompleteDataAlert] = useState(false);
      const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);
      const [editingItemId, setEditingItemId] = useState(null);
      const [editingDetailId, setEditingDetailId] = useState(null);
      const [isSaving, setIsSaving] = useState(false);
      const [refineDialogOpen, setRefineDialogOpen] = useState(false);
      const [refinementContext, setRefinementContext] = useState('');
      const [refiningFieldInfo, setRefiningFieldInfo] = useState(null);
      const [profiles, setProfiles] = useState([]);
      const [isChatOpen, setIsChatOpen] = useState(false);
      const [showDocumentSelector, setShowDocumentSelector] = useState(false);
      const [availableDocuments, setAvailableDocuments] = useState([]);
      const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
      const [loadingDocuments, setLoadingDocuments] = useState(false);
      const { toast } = useToast();
      const { user, getOpenAIKey } = useAuth();
      const debounceTimeout = useRef(null);
      const isInitialMount = useRef(true);
      const [isExporting, setIsExporting] = useState(false);

      const handleExportPDF = async () => {
        if (!plan) return;
    
        setIsExporting(true);
        toast({ title: 'Gerando PDF profissional...', description: 'Aguarde enquanto criamos seu documento.' });
    
        try {
            const doc = new jsPDF();
            let yPos = 20;
    
            // Cabeçalho
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('Plano de Campanha Estratégico', 105, yPos, { align: 'center' });
            yPos += 10;
    
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text(`Campanha: ${project.name}`, 105, yPos, { align: 'center' });
            yPos += 6;
            doc.text(`Cliente: ${client.empresa}`, 105, yPos, { align: 'center' });
            yPos += 15;
    
            const addSection = (title, content, isList = false) => {
                if (yPos > 260) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text(title, 14, yPos);
                yPos += 8;
                doc.setDrawColor(200, 200, 200);
                doc.line(14, yPos - 4, 196, yPos - 4);
    
                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                if (isList) {
                    content.forEach(item => {
                        doc.text(`• ${item}`, 18, yPos);
                        yPos += 6;
                    });
                } else {
                    const splitContent = doc.splitTextToSize(content || 'Não informado', 182);
                    doc.text(splitContent, 14, yPos);
                    yPos += (splitContent.length * 5) + 5;
                }
                yPos += 5;
            };
    
            // Seções
            addSection('📌 Objetivo Principal', plan.objetivo);
            
            addSection('1️⃣ Estratégia de Comunicação', `Mensagem Principal: ${plan.estrategia_comunicacao?.mensagem_principal || 'Não informado'}\nTom de Voz: ${plan.estrategia_comunicacao?.tom_voz || 'Não informado'}\nGatilhos Emocionais: ${plan.estrategia_comunicacao?.gatilhos || 'Não informado'}`);
    
            if (plan.conteudo_criativos?.fases?.length > 0) {
                addSection('2️⃣ Conteúdo & Criativos', '');
                plan.conteudo_criativos.fases.forEach(fase => {
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text(fase.nome, 18, yPos);
                    yPos += 5;
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    const descSplit = doc.splitTextToSize(fase.descricao, 170);
                    doc.text(descSplit, 18, yPos);
                    yPos += (descSplit.length * 4) + 4;
                });
            }
    
            addSection('3️⃣ Tráfego Pago (Anúncios)', `Orçamento: R$ ${plan.trafego_pago?.orcamento || '0'}\nPúblico: ${plan.trafego_pago?.publico || 'Não informado'}\nObjetivo: ${plan.trafego_pago?.objetivo || 'Não informado'}`);
    
            // Tabela de Materiais
            if (plan.materiais?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('4️⃣ Materiais Necessários', 14, yPos);
                yPos += 8;
                
                const materialBody = plan.materiais.map(item => [
                    item.tipo,
                    item.descricao,
                    item.data_entrega ? format(new Date(item.data_entrega), 'dd/MM/yy') : '-',
                    item.data_postagem ? format(new Date(item.data_postagem), 'dd/MM/yy') : '-',
                    profiles.find(p => p.id === item.responsavel_id)?.full_name || '-'
                ]);
    
                autoTable(doc, {
                    startY: yPos,
                    head: [['Tipo', 'Descrição', 'Entrega', 'Postagem', 'Responsável']],
                    body: materialBody,
                    theme: 'grid',
                    headStyles: { fillColor: [75, 85, 99] },
                });
                yPos = doc.lastAutoTable.finalY + 10;
            }
    
            // Tabela de Cronograma
            if (plan.cronograma?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('📆 Cronograma de Ações', 14, yPos);
                yPos += 8;
    
                const cronogramaBody = plan.cronograma.map(item => [
                    item.data ? format(new Date(item.data), 'dd/MM/yyyy') : '-',
                    item.acao
                ]);
    
                autoTable(doc, {
                    startY: yPos,
                    head: [['Data', 'Ação']],
                    body: cronogramaBody,
                    theme: 'grid',
                    headStyles: { fillColor: [75, 85, 99] },
                });
            }
    
            doc.save(`Plano_de_Campanha_${project.name.replace(/\s+/g, '_')}.pdf`);
            toast({ title: 'PDF Gerado!', description: 'Seu plano de campanha profissional está pronto.' });
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            toast({ title: 'Erro ao gerar PDF', description: error.message, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
      };

      useEffect(() => {
        const fetchProfiles = async () => {
            // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
            // Então removemos perfis de cliente da lista usada para atribuição de "responsável".
            const { data, error } = await supabase
              .from('profiles')
              .select('id, full_name')
              .neq('role', 'cliente');
            if (error) {
                toast({ title: 'Erro ao buscar usuários', description: error.message, variant: 'destructive' });
            } else {
                setProfiles(data);
            }
        };
        fetchProfiles();
      }, [toast]);
      
      const handlePlanUpdateFromAI = (updates) => {
        let newPlan = { ...plan };
        for (const key in updates) {
            const value = updates[key];
            if (key.includes('.')) {
                const [mainField, nestedField] = key.split('.');
                newPlan = { ...newPlan, [mainField]: { ...(newPlan[mainField] || {}), [nestedField]: value } };
            } else {
                newPlan = { ...newPlan, [key]: value };
            }
        }
        setPlan(newPlan);
      };

      const savePlan = useCallback(async (currentPlan) => {
        if (!currentPlan || !currentPlan.id) return;

        setIsSaving(true);
        
        // Cria uma cópia do plano para evitar modificar o original
        const planToSave = { ...currentPlan };
        
        // Remove contexto_ia se a coluna não existir (evita erro)
        // O Supabase vai reclamar se a coluna não existir no schema
        const { error } = await supabase.from('campaign_plans').update(planToSave).eq('id', currentPlan.id);
        
        if (error) {
          // Se o erro for sobre contexto_ia, tenta salvar sem essa coluna
          if (error.message.includes('contexto_ia')) {
            const planWithoutContexto = { ...planToSave };
            delete planWithoutContexto.contexto_ia;
            const { error: retryError } = await supabase.from('campaign_plans').update(planWithoutContexto).eq('id', currentPlan.id);
            if (retryError) {
              toast({ title: "Erro ao salvar", description: retryError.message, variant: "destructive" });
            } else {
              toast({ title: "Salvo automaticamente!", duration: 2000 });
            }
          } else {
            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: "Salvo automaticamente!", duration: 2000 });
        }
        setIsSaving(false);
      }, [toast]);

      useEffect(() => {
        const fetchPlan = async () => {
          setLoading(true);
          
          // Tenta restaurar do sessionStorage primeiro
          const sessionKey = `campaign_plan_${project.id}`;
          try {
            const saved = sessionStorage.getItem(sessionKey);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                const planData = parsed.data;
                if (!planData.conteudo_criativos) planData.conteudo_criativos = { fases: [] };
                if (!planData.materiais) planData.materiais = [];
                if (!planData.cronograma) planData.cronograma = [];
                setPlan(planData);
                setLoading(false);
                isInitialMount.current = false;
                return; // Não busca do banco se tem cache válido
              }
            }
          } catch (error) {
            console.error('Error restoring plan from session:', error);
          }
          
          // Se não tem cache, busca do banco
          const { data, error } = await supabase.from('campaign_plans').select('*').eq('project_id', project.id).maybeSingle();
          if (data) {
            const planData = data;
            if (!planData.conteudo_criativos) planData.conteudo_criativos = { fases: [] };
            if (!planData.materiais) planData.materiais = [];
            if (!planData.cronograma) planData.cronograma = [];
            setPlan(planData);
          }
          else if (error && error.code !== 'PGRST116') toast({ title: "Erro ao buscar plano", description: error.message, variant: "destructive" });
          setLoading(false);
          isInitialMount.current = false;
        };
        fetchPlan();
      }, [project.id, toast]);
      
      useEffect(() => {
        if (!isInitialMount.current && plan && plan.id) {
          // Salva no sessionStorage imediatamente (sem debounce)
          const sessionKey = `campaign_plan_${project.id}`;
          try {
            sessionStorage.setItem(sessionKey, JSON.stringify({
              data: plan,
              timestamp: Date.now()
            }));
          } catch (error) {
            console.error('Error saving plan to session:', error);
          }
          
          // Salva no banco com debounce
          if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
          }
          debounceTimeout.current = setTimeout(() => {
            savePlan(plan);
          }, 1500);
        }
        return () => {
          if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
          }
        };
      }, [plan, savePlan, project.id]);

      useEffect(() => {
        if (plan && plan.materiais) {
          const cronogramaFromMaterials = plan.materiais
            .filter(m => m.data_postagem)
            .map(m => ({
              id: `material-${m.id}`,
              data: m.data_postagem,
              acao: m.descricao || 'Ação do material',
              source: 'material'
            }));

          const otherCronogramaItems = (plan.cronograma || []).filter(c => c.source !== 'material');
          
          const newCronograma = [...otherCronogramaItems, ...cronogramaFromMaterials].sort((a, b) => new Date(a.data) - new Date(b.data));
          
          if (JSON.stringify(newCronograma) !== JSON.stringify(plan.cronograma)) {
            setPlan(p => ({ ...p, cronograma: newCronograma }));
          }
        }
      }, [plan?.materiais]);

      const createPlanTemplate = async () => {
        const newPlan = {
          project_id: project.id,
          objetivo: '', estrategia_comunicacao: { mensagem_principal: '', tom_voz: '', gatilhos: '' }, conteudo_criativos: { fases: [] }, trafego_pago: { orcamento: '', publico: '', objetivo: '' }, materiais: [], cronograma: []
        };
        
        // Tenta adicionar contexto_ia apenas se a coluna existir
        // Se não existir, o Supabase vai ignorar e criar sem essa coluna
        try {
          const { data, error } = await supabase.from('campaign_plans').insert(newPlan).select().single();
          if (error) {
            // Se o erro for sobre contexto_ia, tenta novamente sem essa coluna
            if (error.message.includes('contexto_ia')) {
              const planWithoutContexto = { ...newPlan };
              delete planWithoutContexto.contexto_ia;
              const { data: retryData, error: retryError } = await supabase.from('campaign_plans').insert(planWithoutContexto).select().single();
              if (retryError) {
                toast({ title: "Erro ao criar formulário", description: retryError.message, variant: "destructive" });
              } else {
                setPlan(retryData);
              }
            } else {
              toast({ title: "Erro ao criar formulário", description: error.message, variant: "destructive" });
            }
          } else {
            setPlan(data);
          }
        } catch (err) {
          // Fallback: tenta criar sem contexto_ia
          const planWithoutContexto = { ...newPlan };
          delete planWithoutContexto.contexto_ia;
          const { data, error } = await supabase.from('campaign_plans').insert(planWithoutContexto).select().single();
          if (error) {
            toast({ title: "Erro ao criar formulário", description: error.message, variant: "destructive" });
          } else {
            setPlan(data);
          }
        }
      };

      const openDocumentSelector = async () => {
        if (!client?.id) {
          toast({ title: "Erro", description: "Cliente não encontrado.", variant: "destructive" });
          return;
        }

        setLoadingDocuments(true);
        setShowDocumentSelector(true);
        setSelectedDocumentIds([]);

        try {
          // Busca todos os documentos do cliente da tabela client_documents
          const { data: documents, error } = await supabase
            .from('client_documents')
            .select('id, title, content')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

          if (error) {
            toast({ title: "Erro ao buscar documentos", description: error.message, variant: "destructive" });
            setShowDocumentSelector(false);
            return;
          }

          if (!documents || documents.length === 0) {
            // Se não tem documentos na tabela, tenta o campo client_document
            if (client?.client_document) {
              const textContent = client.client_document
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
              
              if (textContent) {
                handleUpdate('contexto_ia', textContent);
                toast({ title: "Documento do cliente carregado!", description: "O contexto foi adicionado ao campo de contexto para IA." });
              } else {
                toast({ title: "Documento vazio", description: "O documento do cliente está vazio.", variant: "destructive" });
              }
            } else {
              toast({ title: "Documento não encontrado", description: "Este cliente não possui documentos cadastrados.", variant: "destructive" });
            }
            setShowDocumentSelector(false);
            return;
          }

          setAvailableDocuments(documents);
        } catch (error) {
          toast({ title: "Erro ao carregar documentos", description: error.message, variant: "destructive" });
          setShowDocumentSelector(false);
        } finally {
          setLoadingDocuments(false);
        }
      };

      const loadSelectedDocuments = () => {
        if (selectedDocumentIds.length === 0) {
          toast({ title: "Nenhum documento selecionado", description: "Por favor, selecione pelo menos um documento.", variant: "destructive" });
          return;
        }

        // Filtra apenas os documentos selecionados
        const selectedDocs = availableDocuments.filter(doc => selectedDocumentIds.includes(doc.id));

        // Combina os documentos selecionados em um único texto
        let combinedContent = '';
        selectedDocs.forEach((doc) => {
          const title = doc.title || 'Documento sem título';
          let content = '';
          
          if (doc.content?.text_content) {
            content = doc.content.text_content;
          } else if (typeof doc.content === 'string') {
            content = doc.content;
          }
          
          // Remove tags HTML se houver
          content = content
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
          
          if (content) {
            if (combinedContent) combinedContent += '\n\n';
            combinedContent += `=== ${title} ===\n${content}`;
          }
        });

        if (combinedContent) {
          // Se já tem conteúdo, adiciona ao final. Se não, substitui.
          const currentContext = plan.contexto_ia || '';
          const newContext = currentContext 
            ? `${currentContext}\n\n${combinedContent}`
            : combinedContent;
          
          handleUpdate('contexto_ia', newContext);
          toast({ 
            title: "Documentos carregados!", 
            description: `${selectedDocs.length} ${selectedDocs.length === 1 ? 'documento foi' : 'documentos foram'} adicionados ao contexto.` 
          });
          setShowDocumentSelector(false);
          setSelectedDocumentIds([]);
        } else {
          toast({ title: "Documentos vazios", description: "Os documentos selecionados estão vazios.", variant: "destructive" });
        }
      };

      const toggleDocumentSelection = (docId) => {
        setSelectedDocumentIds(prev => 
          prev.includes(docId) 
            ? prev.filter(id => id !== docId)
            : [...prev, docId]
        );
      };

      const handleUpdate = (field, value) => setPlan(p => ({ ...p, [field]: value }));
      const handleNestedUpdate = (mainField, nestedField, value) => setPlan(p => ({ ...p, [mainField]: { ...p[mainField], [nestedField]: value } }));
      const addToList = (field, newItem) => handleUpdate(field, [...(plan[field] || []), newItem]);

      const checkClientData = () => !client?.publico_alvo || !client?.tom_de_voz;

      const processAIRequest = async (prompt, field, materialItem = null) => {
        const apiKey = await getOpenAIKey();
        if (!apiKey) {
          setShowOpenAIAlert(true);
          return;
        }
        if (checkClientData()) {
          setShowIncompleteDataAlert(true);
          return;
        }

        setIsGenerating(true);
        setGeneratingField(field);

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 500 })
          });

          const data = await response.json();

          if (!response.ok) {
            if (data?.error?.code === 'insufficient_quota') {
              toast({
                title: "Sua cota da OpenAI esgotou!",
                description: "Verifique seu plano e detalhes de faturamento na sua conta da OpenAI.",
                variant: "destructive",
                duration: 10000,
              });
            } else {
              throw new Error(data?.error?.message || `API da OpenAI respondeu com status ${response.status}`);
            }
            return;
          }

          let result = data.choices[0].message.content.trim();
          
          try {
            const parsedResult = JSON.parse(result);
            if (field === 'conteudo_criativos.fases') {
                handleUpdate('conteudo_criativos', { fases: parsedResult.map(item => ({...item, id: Date.now() + Math.random()})) });
            } else if (field === 'materiais') {
                const newMaterials = parsedResult.map(item => ({...item, id: Date.now() + Math.random()}));
                handleUpdate('materiais', [...(plan.materiais || []), ...newMaterials]);
            }
          } catch (e) {
            if (field === 'materiais.detalhes' && materialItem) {
              handleUpdateListItem('materiais', materialItem.id, 'detalhes', result);
            } else if (field.includes('.')) {
              const [mainField, nestedField] = field.split('.');
              handleNestedUpdate(mainField, nestedField, result);
            } else {
              handleUpdate(field, result);
            }
          }
          toast({ title: `Campo atualizado com sucesso!` });
        } catch (error) {
          toast({ title: "Erro ao usar IA", description: error.message, variant: "destructive" });
        } finally {
          setIsGenerating(false);
          setGeneratingField(null);
        }
      };

      const generateWithAI = async (field, materialItem = null) => {
        // Busca informações da empresa (JB APEX) para incluir no contexto
        let companyInfo = '';
        try {
          const { data } = await supabase
            .from('public_config')
            .select('value')
            .eq('key', 'company_info_for_ai')
            .maybeSingle();
          if (data?.value) {
            companyInfo = data.value;
          }
        } catch (e) {
          console.warn('Não foi possível carregar informações da empresa:', e);
        }

        // Contexto base com informações do cliente e projeto
        let baseContext = `Para uma campanha chamada "${project.name}" para o cliente "${client.empresa}", cujo público-alvo é "${client.publico_alvo}" e o tom de voz padrão é "${client.tom_de_voz}". O sobre a empresa é: "${client.sobre_empresa}". O objetivo da campanha é: "${plan.objetivo}". A mensagem principal é "${plan.estrategia_comunicacao?.mensagem_principal}".`;
        
        // Adiciona informações sobre a JB APEX se existirem
        if (companyInfo && companyInfo.trim()) {
          baseContext += `\n\nInformações sobre a JB APEX (agência responsável pela campanha): ${companyInfo}`;
        }
        
        // Adiciona o contexto adicional da IA se existir
        if (plan.contexto_ia && plan.contexto_ia.trim()) {
          baseContext += `\n\nContexto adicional importante sobre o cliente: ${plan.contexto_ia}`;
        }
        
        let prompt = '';

        switch (field) {
          case 'objetivo':
            prompt = `Aja como um especialista em marketing digital. ${baseContext} Gere um objetivo principal claro e conciso para a campanha. O objetivo deve ser SMART. Responda apenas com o objetivo.`;
            break;
          case 'estrategia_comunicacao.mensagem_principal':
            prompt = `Aja como um estrategista de comunicação. ${baseContext} Crie a mensagem principal da campanha. Responda apenas com a mensagem.`;
            break;
          case 'estrategia_comunicacao.tom_voz':
            prompt = `Aja como um copywriter sênior. ${baseContext} Defina um tom de voz específico para esta campanha. Responda apenas com a definição do tom de voz.`;
            break;
          case 'estrategia_comunicacao.gatilhos':
            prompt = `Aja como um especialista em neuromarketing. ${baseContext} Liste 3 a 5 gatilhos mentais para esta campanha. Responda apenas com a lista de gatilhos, separados por vírgula.`;
            break;
          case 'conteudo_criativos.fases':
            prompt = `Aja como um estrategista de conteúdo. ${baseContext} Sugira 3 fases de conteúdo (ex: Atração, Engajamento, Conversão). Formate como um JSON array com "id", "nome" e "descricao". Ex: [{"id": 1, "nome": "Fase 1", "descricao": "..."}]. Responda apenas com o JSON.`;
            break;
          case 'materiais':
            prompt = `Aja como um planejador de conteúdo. ${baseContext} Sugira 3 ideias de materiais (artes ou vídeos) para esta campanha. Formate como um JSON array com "id", "tipo" ('arte' ou 'video'), "descricao" (curta), "detalhes" (vazio), "data_entrega" (vazio), "data_postagem" (vazio) e "responsavel_id" (vazio). Ex: [{"id": 1, "tipo": "arte", "descricao": "Post sobre...", "detalhes": "", "data_entrega": "", "data_postagem": "", "responsavel_id": ""}]. Responda apenas com o JSON.`;
            break;
          case 'materiais.detalhes':
            if (!materialItem) return;
            const action = materialItem.tipo === 'video' ? 'Crie um roteiro detalhado para um vídeo' : 'Crie um briefing detalhado para uma arte';
            const content = materialItem.tipo === 'video' ? 'O roteiro deve ter cenas, falas e sugestões de visuais. Responda apenas com o roteiro.' : 'Inclua uma sugestão de título (chamada), um texto de apoio (legenda) e uma descrição de como a imagem deve ser. Responda apenas com o briefing.';
            prompt = `Aja como um ${materialItem.tipo === 'video' ? 'roteirista criativo' : 'diretor de arte e copywriter'}. ${baseContext} ${action} com o seguinte tema: "${materialItem.descricao}". ${content}`;
            break;
          default: return;
        }
        await processAIRequest(prompt, field, materialItem);
      };
      
      const refineWithAI = async (context) => {
        if (!refiningFieldInfo) return;
        const { field, content, materialItem } = refiningFieldInfo;
        const baseContext = `Para uma campanha chamada "${project.name}" para o cliente "${client.empresa}".`;
        const prompt = `Aja como um especialista em marketing e copywriting. ${baseContext} Refine e melhore o seguinte texto: "${content}". Aplique a seguinte instrução: "${context}". Retorne apenas o texto refinado.`;
        await processAIRequest(prompt, field, materialItem);
        setRefineDialogOpen(false);
        setRefinementContext('');
        setRefiningFieldInfo(null);
      };

      const handleOpenRefineDialog = (field, content, materialItem = null) => {
        setRefiningFieldInfo({ field, content, materialItem });
        setRefineDialogOpen(true);
      };

      const handleUpdateListItem = (listName, id, field, value) => {
        const list = listName.includes('.') ? plan[listName.split('.')[0]][listName.split('.')[1]] : plan[listName];
        const updatedList = list.map(item => item.id === id ? { ...item, [field]: value } : item);
        if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };
      
      const handleRemoveListItem = (listName, id) => {
        const list = listName.includes('.') ? plan[listName.split('.')[0]][listName.split('.')[1]] : plan[listName];
        const updatedList = list.filter(item => item.id !== id);
        if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };

      const handleAddListItem = (listName, newItem) => {
        const list = listName.includes('.') ? plan[listName.split('.')[0]][listName.split('.')[1]] : plan[listName];
        const updatedList = [...(list || []), newItem];
         if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };

      const createTaskFromPlanItem = async (item) => {
        if (!item.descricao) {
            toast({ title: "Ação necessária", description: "Por favor, adicione uma descrição ao material antes de criar a tarefa.", variant: "destructive" });
            return;
        }
        const newTask = {
          title: `[${item.tipo}] ${item.descricao}`,
          description: item.detalhes,
          status: 'todo',
          project_id: project.id,
          client_id: project.client_id,
          owner_id: user.id,
          assignee_ids: item.responsavel_id ? [item.responsavel_id] : [],
          type: item.tipo,
          due_date: item.data_entrega,
          post_date: item.data_postagem
        };
        const { error } = await supabase.from('tarefas').insert(newTask);
        if (error) {
          toast({ title: "Erro ao criar tarefa", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Tarefa criada com sucesso!", description: "Acesse a página de Tarefas para ver." });
        }
      };

      const handleCronogramaChange = (id, field, value) => {
        const updatedCronograma = plan.cronograma.map(item => 
          item.id === id ? { ...item, [field]: value } : item
        );
        handleUpdate('cronograma', updatedCronograma);
      };

      const handleRemoveCronogramaItem = (id) => {
        const updatedCronograma = plan.cronograma.filter(item => item.id !== id);
        handleUpdate('cronograma', updatedCronograma);
      };
      
      const AiButtonGroup = ({ field, content, materialItem = null }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => generateWithAI(field, materialItem)} disabled={isGenerating}>
            <Sparkles size={14} className="mr-1" />
            {isGenerating && generatingField === field ? 'Gerando...' : 'IA'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleOpenRefineDialog(field, content, materialItem)} disabled={isGenerating || !content}>
            <Wand2 size={14} className="mr-1" />
            Refinar
          </Button>
        </div>
      );

      const renderContent = () => {
        if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        if (!plan) {
          return (
            <div className="flex items-center justify-center h-64">
              <Button onClick={createPlanTemplate}>Criar Plano de Campanha</Button>
            </div>
          );
        }

        return (
          <>
            <div className="space-y-6">
              <SectionCard icon={<BookOpen className="h-6 w-6 text-indigo-600" />} title="🤖 Contexto para IA">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Informações adicionais para a IA aprender sobre o cliente</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={openDocumentSelector}
                      className="flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Selecionar Documentos
                    </Button>
                  </div>
                  <Textarea 
                    value={plan.contexto_ia || ''} 
                    onChange={e => handleUpdate('contexto_ia', e.target.value)}
                    placeholder="Adicione informações importantes sobre o cliente, produtos, serviços, histórico, preferências, ou qualquer contexto relevante que a IA deve considerar ao gerar conteúdo para esta campanha..."
                    rows={6}
                    className="min-h-[150px]"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Este contexto será usado em todas as gerações de IA para criar conteúdo mais personalizado e alinhado com o cliente.
                  </p>
                </div>
              </SectionCard>

              <SectionCard icon={<Target className="h-6 w-6 text-blue-600" />} title="📌 O Que Vamos Fazer? (Objetivo Principal)">
                  <div className="flex items-center justify-between"><label>Objetivo Principal</label><AiButtonGroup field="objetivo" content={plan.objetivo} /></div>
                  <Textarea value={plan.objetivo} onChange={e => handleUpdate('objetivo', e.target.value)} />
              </SectionCard>
              
              <SectionCard icon={<Megaphone className="h-6 w-6 text-purple-600" />} title="1️⃣ Estratégia de Comunicação">
                  <div>
                      <div className="flex items-center justify-between"><label>Mensagem Principal</label><AiButtonGroup field="estrategia_comunicacao.mensagem_principal" content={plan.estrategia_comunicacao?.mensagem_principal} /></div>
                      <Textarea value={plan.estrategia_comunicacao?.mensagem_principal || ''} onChange={e => handleNestedUpdate('estrategia_comunicacao', 'mensagem_principal', e.target.value)} />
                  </div>
                  <div>
                      <div className="flex items-center justify-between"><label>Tom de Voz</label><AiButtonGroup field="estrategia_comunicacao.tom_voz" content={plan.estrategia_comunicacao?.tom_voz} /></div>
                      <Input value={plan.estrategia_comunicacao?.tom_voz || ''} onChange={e => handleNestedUpdate('estrategia_comunicacao', 'tom_voz', e.target.value)} />
                  </div>
                  <div>
                      <div className="flex items-center justify-between"><label>Gatilhos Emocionais</label><AiButtonGroup field="estrategia_comunicacao.gatilhos" content={plan.estrategia_comunicacao?.gatilhos} /></div>
                      <Input value={plan.estrategia_comunicacao?.gatilhos || ''} onChange={e => handleNestedUpdate('estrategia_comunicacao', 'gatilhos', e.target.value)} />
                  </div>
              </SectionCard>
              
              <SectionCard icon={<Lightbulb className="h-6 w-6 text-yellow-600" />} title="2️⃣ Conteúdo & Criativos">
                  <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => generateWithAI('conteudo_criativos.fases')} disabled={isGenerating}><Sparkles size={14} className="mr-1" />{isGenerating && generatingField === 'conteudo_criativos.fases' ? 'Gerando...' : 'Sugerir Fases com IA'}</Button>
                      <Button variant="outline" size="sm" onClick={() => handleAddListItem('conteudo_criativos.fases', { id: Date.now(), nome: 'Nova Fase', descricao: '' })}><PlusCircle className="h-4 w-4 mr-2" />Adicionar Fase</Button>
                  </div>
                  {(plan.conteudo_criativos?.fases || []).map((fase) => (
                  <div key={fase.id} className="p-3 border rounded-lg space-y-2">
                      {editingItemId === fase.id ? (
                      <>
                          <Input value={fase.nome} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'nome', e.target.value)} className="font-bold" />
                          <Textarea value={fase.descricao} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'descricao', e.target.value)} />
                          <Button size="sm" onClick={() => setEditingItemId(null)}><Check className="h-4 w-4 mr-2" />Salvar</Button>
                      </>
                      ) : (
                      <>
                          <div className="flex justify-between items-center">
                          <p className="font-bold">{fase.nome}</p>
                          <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => createTaskFromPlanItem({descricao: `Fase: ${fase.nome}`, detalhes: fase.descricao, tipo: 'Planejamento'})}><Plus className="h-4 w-4 text-blue-500" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItemId(fase.id)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveListItem('conteudo_criativos.fases', fase.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{fase.descricao}</p>
                      </>
                      )}
                  </div>
                  ))}
              </SectionCard>

              <SectionCard icon={<DollarSign className="h-6 w-6 text-green-600" />} title="3️⃣ Tráfego Pago (Anúncios)">
                  <div><label>Orçamento</label><Input type="number" value={plan.trafego_pago?.orcamento || ''} onChange={e => handleNestedUpdate('trafego_pago', 'orcamento', e.target.value)} /></div>
                  <div><label>Público</label><Textarea value={plan.trafego_pago?.publico || ''} onChange={e => handleNestedUpdate('trafego_pago', 'publico', e.target.value)} /></div>
                  <div><label>Objetivo</label><Input value={plan.trafego_pago?.objetivo || ''} onChange={e => handleNestedUpdate('trafego_pago', 'objetivo', e.target.value)} /></div>
              </SectionCard>

              <SectionCard icon={<List className="h-6 w-6 text-indigo-600" />} title="4️⃣ Materiais Necessários">
                  <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => generateWithAI('materiais')} disabled={isGenerating}><Sparkles size={14} className="mr-1" />{isGenerating && generatingField === 'materiais' ? 'Gerando...' : 'Sugerir com IA'}</Button>
                      <Button variant="outline" size="sm" onClick={() => addToList('materiais', { id: Date.now(), tipo: 'arte', descricao: '', data_entrega: '', data_postagem: '', responsavel_id: null, detalhes: '' })}><PlusCircle className="h-4 w-4 mr-2" />Adicionar Material</Button>
                  </div>
                  {(plan.materiais || []).map((item) => (
                      <div key={item.id} className="p-3 border rounded-lg space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                              <Select value={item.tipo} onValueChange={v => handleUpdateListItem('materiais', item.id, 'tipo', v)}>
                                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="arte">Arte</SelectItem>
                                      <SelectItem value="video">Vídeo</SelectItem>
                                      <SelectItem value="outro">Outro</SelectItem>
                                  </SelectContent>
                              </Select>
                              <Input placeholder="Descrição do material..." value={item.descricao} onChange={e => handleUpdateListItem('materiais', item.id, 'descricao', e.target.value)} className="flex-grow min-w-[200px]" />
                              <Button variant="ghost" size="icon" onClick={() => createTaskFromPlanItem(item)}><Plus className="h-4 w-4 text-blue-500" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveListItem('materiais', item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                  <Label>Data de Entrega</Label>
                                  <Input type="date" value={item.data_entrega || ''} onChange={e => handleUpdateListItem('materiais', item.id, 'data_entrega', e.target.value)} />
                              </div>
                              <div>
                                  <Label>Data de Postagem</Label>
                                  <Input type="date" value={item.data_postagem || ''} onChange={e => handleUpdateListItem('materiais', item.id, 'data_postagem', e.target.value)} />
                              </div>
                              <div>
                                  <Label>Responsável</Label>
                                  <Select value={item.responsavel_id || 'ninguem'} onValueChange={v => handleUpdateListItem('materiais', item.id, 'responsavel_id', v === 'ninguem' ? null : v)}>
                                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="ninguem">Ninguém</SelectItem>
                                          {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                                      </SelectContent>
                                  </Select>
                              </div>
                          </div>
                          {editingDetailId !== item.id && (item.tipo === 'video' || item.tipo === 'arte') && (
                          <Button variant="outline" size="sm" onClick={() => setEditingDetailId(item.id)}>
                              {item.tipo === 'video' ? <Video size={14} className="mr-2" /> : <FileText size={14} className="mr-2" />}
                              {item.detalhes ? 'Editar' : 'Adicionar'} {item.tipo === 'video' ? 'Roteiro' : 'Descrição'}
                          </Button>
                          )}
                          {editingDetailId === item.id && (
                          <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                               <Textarea
                                  placeholder={item.tipo === 'video' ? 'Escreva o roteiro aqui...' : 'Escreva a descrição da arte aqui...'}
                                  value={item.detalhes || ''}
                                  onChange={e => handleUpdateListItem('materiais', item.id, 'detalhes', e.target.value)}
                                  rows={6}
                              />
                              <div className="flex gap-2">
                                  <Button size="sm" onClick={() => setEditingDetailId(null)}>
                                      <Check size={14} className="mr-2"/>Salvar Detalhes
                                  </Button>
                                  <AiButtonGroup field="materiais.detalhes" content={item.detalhes} materialItem={item} />
                              </div>
                          </div>
                          )}
                          {item.detalhes && editingDetailId !== item.id && (
                          <div className="pl-4 pt-2 border-l-2 border-gray-200 text-sm text-muted-foreground whitespace-pre-wrap">
                              <p className="font-semibold">{item.tipo === 'video' ? 'Roteiro:' : 'Descrição:'}</p>
                              <p>{item.detalhes}</p>
                          </div>
                          )}
                      </div>
                  ))}
              </SectionCard>

              <SectionCard icon={<Calendar className="h-6 w-6 text-red-600" />} title="📆 Cronograma de Postagens e Ações">
                   {(plan.cronograma || []).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 mb-2">
                          <Input type="date" value={item.data || ''} onChange={e => handleCronogramaChange(item.id, 'data', e.target.value)} disabled={item.source === 'material'} />
                          <Input value={item.acao || ''} onChange={e => handleCronogramaChange(item.id, 'acao', e.target.value)} disabled={item.source === 'material'} />
                          {item.source !== 'material' && (
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveCronogramaItem(item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          )}
                      </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addToList('cronograma', { id: Date.now(), data: '', acao: '', source: 'manual' })}><PlusCircle className="h-4 w-4 mr-2" />Adicionar Ação Manual</Button>
              </SectionCard>
            </div>
             <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
                className="fixed bottom-6 right-6"
            >
                <Button 
                    size="lg" 
                    className="rounded-full h-16 w-16 shadow-lg bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white"
                    onClick={() => setIsChatOpen(true)}
                >
                    <Bot size={32} />
                </Button>
            </motion.div>
          </>
        );
      };
      
      const renderAlerts = () => (
        <>
          <AlertDialog open={showIncompleteDataAlert} onOpenChange={setShowIncompleteDataAlert}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitleComponent><AlertTriangle className="inline mr-2 text-yellow-500" />Dados do Cliente Incompletos</AlertDialogTitleComponent><AlertDialogDescription>Para a IA gerar sugestões mais precisas, por favor, preencha os campos 'Público-alvo' e 'Tom de Voz' no cadastro do cliente.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowIncompleteDataAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitleComponent><AlertTriangle className="inline mr-2 text-yellow-500" />Chave da OpenAI não encontrada</AlertDialogTitleComponent>
                <AlertDialogDescription>Para usar o assistente de IA, por favor, adicione sua chave da API da OpenAI na página de Configurações.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );

      const renderRefineDialog = () => (
        <Dialog open={refineDialogOpen} onOpenChange={setRefineDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refinar com IA</DialogTitle>
              <DialogDescription>
                Dê instruções para a IA refinar o conteúdo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="refine-context" className="text-right">
                  Instrução
                </Label>
                <Textarea
                  id="refine-context"
                  value={refinementContext}
                  onChange={(e) => setRefinementContext(e.target.value)}
                  className="col-span-3"
                  placeholder="Ex: Deixe o texto mais formal, adicione um call-to-action para o site..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => refineWithAI(refinementContext)} disabled={isGenerating}>
                {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refinando...</> : 'Refinar Agora'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      const renderChat = () => {
        if (!plan) return null;
        return <AiChatDialog open={isChatOpen} onOpenChange={setIsChatOpen} project={project} client={client} plan={plan} onPlanUpdate={handlePlanUpdateFromAI} />
      };

      if (isPage) {
        return (
          <>
            <div className="flex flex-row items-center justify-between mb-6 bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm sticky top-0 z-10">
                <h2 className="text-2xl font-semibold">Plano Estratégico da Campanha</h2>
                <div className="flex items-center gap-4">
                    <Button onClick={handleExportPDF} variant="outline" disabled={isExporting}>
                        {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                        Exportar PDF
                    </Button>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            plan && (
                            <>
                                <Check className="h-4 w-4 text-green-500" />
                                Salvo
                            </>
                            )
                        )}
                    </div>
                </div>
            </div>
            {renderContent()}
            {renderAlerts()}
            {renderRefineDialog()}
            {renderChat()}
            <DocumentSelectorDialog
              open={showDocumentSelector}
              onOpenChange={setShowDocumentSelector}
              documents={availableDocuments}
              selectedIds={selectedDocumentIds}
              onToggle={toggleDocumentSelection}
              onLoad={loadSelectedDocuments}
              loading={loadingDocuments}
            />
          </>
        );
      }

      return (
        <Dialog open={true} onOpenChange={onClose}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Planejamento de Campanha: {project.name}</DialogTitle>
                 <div className="flex items-center gap-4 absolute right-16 top-4">
                    <Button onClick={handleExportPDF} variant="outline" size="sm" disabled={isExporting}>
                         {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                        PDF
                    </Button>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            plan && (
                            <>
                                <Check className="h-4 w-4 text-green-500" />
                                Salvo
                            </>
                            )
                        )}
                    </div>
                 </div>
            </DialogHeader>
            <div className="py-4">
                {renderContent()}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </DialogFooter>
            {renderAlerts()}
            {renderRefineDialog()}
            {renderChat()}
            <DocumentSelectorDialog
              open={showDocumentSelector}
              onOpenChange={setShowDocumentSelector}
              documents={availableDocuments}
              selectedIds={selectedDocumentIds}
              onToggle={toggleDocumentSelection}
              onLoad={loadSelectedDocuments}
              loading={loadingDocuments}
            />
          </DialogContent>
        </Dialog>
      );
    };

    const DocumentSelectorDialog = ({ open, onOpenChange, documents, selectedIds, onToggle, onLoad, loading }) => (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Selecionar Documentos para Contexto da IA</DialogTitle>
            <DialogDescription>
              Selecione quais documentos do cliente você deseja incluir no contexto para a IA. Os documentos selecionados serão adicionados ao campo de contexto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Carregando documentos...</span>
              </div>
            ) : documents.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Nenhum documento encontrado.</p>
            ) : (
              documents.map((doc) => (
                <div 
                  key={doc.id} 
                  className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => onToggle(doc.id)}
                >
                  <Checkbox 
                    checked={selectedIds.includes(doc.id)}
                    onCheckedChange={() => onToggle(doc.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <span className="font-medium dark:text-white">{doc.title || 'Documento sem título'}</span>
                    </div>
                    {doc.content?.text_content && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {doc.content.text_content.replace(/<[^>]*>/g, '').substring(0, 100)}...
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={onLoad} disabled={selectedIds.length === 0 || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  Carregar {selectedIds.length} {selectedIds.length === 1 ? 'documento' : 'documentos'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    export default CampaignPlanner;