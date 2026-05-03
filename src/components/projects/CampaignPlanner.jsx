import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { Save, Sparkles, AlertTriangle, PlusCircle, Trash2, Edit, Check, FileText, Video, Target, Megaphone, Lightbulb, DollarSign, List, Calendar, Loader2, Wand2, Bot, FileDown, BookOpen, Download, ClipboardList, Maximize2 } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { useToast } from '@/components/ui/use-toast';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
    import { supabase } from '@/lib/customSupabaseClient';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent } from "@/components/ui/alert-dialog";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
    import { motion } from 'framer-motion';
    import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
    import AiChatDialog from '@/components/projects/AiChatDialog';
    import { invokeProjectsAiChat } from '@/lib/projectsAiCompletion';
import { getAvailableModelsCached, getDefaultModelCached } from '@/lib/assistantProjectConfig';
import { buildBaseContext, buildPrompt, getGenerationConfig } from '@/lib/campaignPlannerPrompts';
    import {
      getPlanItemTaskWarnings,
      buildTaskTitleFromPlanMaterial,
      editorMateriaisShapeToDbRows,
      dbMateriaisToEditorShape,
      planMateriaisAsRows,
      patchCampaignPlanRow,
    } from '@/lib/campaignPlanMateriais';
    import { usePlataformasConteudo } from '@/hooks/usePlataformasConteudo';
    import PlataformaMaterialSelect from '@/components/projects/PlataformaMaterialSelect';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import { format } from 'date-fns';
    import { cn } from '@/lib/utils';

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

/** Clona valores para o corpo HTTP sem referências partilhadas ou tipos não-JSON. */
function deepCloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/** Linha do `campaign_plans`: `materiais` no JSONB (array ou objeto) → estrutura do editor. */
function normalizeCampaignPlanRowFromDb(row) {
  if (!row) return row;
  const p = { ...row };
  p.materiais = dbMateriaisToEditorShape(p.materiais);
  if (!p.conteudo_criativos) p.conteudo_criativos = { fases: [] };
  if (!p.cronograma) p.cronograma = [];
  return p;
}

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
      const [chatLayoutWide, setChatLayoutWide] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
      );
      const [showDocumentSelector, setShowDocumentSelector] = useState(false);
      const [availableDocuments, setAvailableDocuments] = useState([]);
      const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
      const [loadingDocuments, setLoadingDocuments] = useState(false);
      const [taskFromPlanDialogOpen, setTaskFromPlanDialogOpen] = useState(false);
      const [taskFromPlanItem, setTaskFromPlanItem] = useState(null);
      const [isInsertingPlanTask, setIsInsertingPlanTask] = useState(false);
      const { plataformas, loading: platsLoading } = usePlataformasConteudo();
      const defaultPlataformaNome = plataformas[0]?.nome ?? '';
      const { toast } = useToast();
      const { user, getOpenAIKey } = useAuth();
      const debounceTimeout = useRef(null);
      const saveBusyRef = useRef(false);
      const saveQueuedRef = useRef(null);
      const isInitialMount = useRef(true);
      const planRef = useRef(null);
      planRef.current = plan;
      const isGeneratingRef = useRef(false);
      isGeneratingRef.current = isGenerating;
      const [isExporting, setIsExporting] = useState(false);
      const [availableAiModels, setAvailableAiModels] = useState(['openai/gpt-4o-mini']);
      const [selectedAiModel, setSelectedAiModel] = useState('openai/gpt-4o-mini');
      const [companyInfo, setCompanyInfo] = useState('');
      const [isDirty, setIsDirty] = useState(false);
      const [saveErrorMessage, setSaveErrorMessage] = useState('');
      const [eventDate, setEventDate] = useState(project?.data_evento || '');
      /** Aba ativa em «Materiais necessários» (carrossel / post / vídeo / stories). */
      const [materiaisTab, setMateriaisTab] = useState('carrossel');
      /** Modal para editar «detalhes» em ecrã grande (listName tipo materiais.carrosseis). */
      const [materialDetalhesModal, setMaterialDetalhesModal] = useState(null);

      useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const fn = () => setChatLayoutWide(mq.matches);
        fn();
        mq.addEventListener('change', fn);
        return () => mq.removeEventListener('change', fn);
      }, []);

      const handleExportPDF = async () => {
        if (!plan) return;
    
        setIsExporting(true);
        toast({ title: 'Gerando PDF profissional...', description: 'Aguarde enquanto criamos seu documento.' });
    
        try {
            const mat = ensureMateriaisShape(plan.materiais);
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
    
            // Seções (sem emoji: jsPDF/Helvetica só suporta WinAnsi; emoji vira lixo tipo Ø=Üì)
            addSection('1. Objetivo Principal', plan.objetivo);
            
            addSection('2. Estratégia de Comunicação', `Mensagem Principal: ${plan.estrategia_comunicacao?.mensagem_principal || 'Não informado'}\nTom de Voz: ${plan.estrategia_comunicacao?.tom_voz || 'Não informado'}\nGatilhos Emocionais: ${plan.estrategia_comunicacao?.gatilhos || 'Não informado'}`);
    
            if (plan.conteudo_criativos?.fases?.length > 0) {
                addSection('3. Conteúdo e Criativos', '');
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
    
            addSection('4. Tráfego Pago (Anúncios)', `Orçamento: R$ ${plan.trafego_pago?.orcamento || '0'}\nPúblico: ${plan.trafego_pago?.publico || 'Não informado'}\nObjetivo: ${plan.trafego_pago?.objetivo || 'Não informado'}`);
    
            // 5. Carrosséis
            if (mat.carrosseis?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('5. Carrosséis', 14, yPos);
                yPos += 8;

                const carrosselBody = mat.carrosseis.map(item => [
                    item.descricao,
                    item.plataforma || '-',
                    item.data_entrega ? format(new Date(item.data_entrega), 'dd/MM/yy') : '-',
                    item.data_postagem ? format(new Date(item.data_postagem), 'dd/MM/yy') : '-',
                    profiles.find(p => p.id === item.responsavel_id)?.full_name || '-'
                ]);
    
                autoTable(doc, {
                    startY: yPos,
                    head: [['Descrição', 'Plataforma', 'Entrega', 'Postagem', 'Responsável']],
                    body: carrosselBody,
                    theme: 'grid',
                    headStyles: { fillColor: [75, 85, 99] },
                });
                yPos = doc.lastAutoTable.finalY + 10;
            }

            // 6. Posts (feed único, não carrossel)
            if (mat.posts?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('6. Posts (imagem ou vídeo único)', 14, yPos);
                yPos += 8;

                const postsBody = mat.posts.map(item => [
                    item.descricao,
                    item.plataforma || '-',
                    item.data_entrega ? format(new Date(item.data_entrega), 'dd/MM/yy') : '-',
                    item.data_postagem ? format(new Date(item.data_postagem), 'dd/MM/yy') : '-',
                    profiles.find(p => p.id === item.responsavel_id)?.full_name || '-'
                ]);

                autoTable(doc, {
                    startY: yPos,
                    head: [['Descrição', 'Plataforma', 'Entrega', 'Postagem', 'Responsável']],
                    body: postsBody,
                    theme: 'grid',
                    headStyles: { fillColor: [34, 197, 94] },
                });
                yPos = doc.lastAutoTable.finalY + 10;
            }

            // 7. Vídeos
            if (mat.videos?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('7. Vídeos', 14, yPos);
                yPos += 8;

                const videoBody = mat.videos.map(item => [
                    item.descricao,
                    item.plataforma || '-',
                    item.data_entrega ? format(new Date(item.data_entrega), 'dd/MM/yy') : '-',
                    item.data_postagem ? format(new Date(item.data_postagem), 'dd/MM/yy') : '-',
                    profiles.find(p => p.id === item.responsavel_id)?.full_name || '-'
                ]);

                autoTable(doc, {
                    startY: yPos,
                    head: [['Descrição', 'Plataforma', 'Entrega', 'Postagem', 'Responsável']],
                    body: videoBody,
                    theme: 'grid',
                    headStyles: { fillColor: [75, 85, 99] },
                });
                yPos = doc.lastAutoTable.finalY + 10;
            }

            // 8. Ideias de Stories
            if (mat.stories_ideias?.length > 0) {
                if (yPos > 240) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('8. Ideias de Stories', 14, yPos);
                yPos += 8;
                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                mat.stories_ideias.forEach((ideia, i) => {
                    if (yPos > 270) { doc.addPage(); yPos = 20; }
                    doc.text(`${i + 1}. ${ideia}`, 18, yPos);
                    yPos += 6;
                });
                yPos += 5;
            }
    
            // Tabela de Cronograma
            if (plan.cronograma?.length > 0) {
                if (yPos > 220) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('9. Cronograma de Ações', 14, yPos);
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

      useEffect(() => {
        let active = true;
        const loadAiModels = async () => {
          try {
            const [models, defaultModel] = await Promise.all([
              getAvailableModelsCached(),
              getDefaultModelCached(),
            ]);
            if (!active) return;
            const safeModels = Array.isArray(models) && models.length > 0 ? models : ['openai/gpt-4o-mini'];
            const safeDefault = safeModels.includes(defaultModel) ? defaultModel : safeModels[0];
            setAvailableAiModels(safeModels);
            setSelectedAiModel(safeDefault);
          } catch (err) {
            console.warn('Erro ao carregar modelos do projeto:', err);
            if (!active) return;
            setAvailableAiModels(['openai/gpt-4o-mini']);
            setSelectedAiModel('openai/gpt-4o-mini');
          }
        };
        loadAiModels();
        return () => {
          active = false;
        };
      }, []);

      useEffect(() => {
        setEventDate(project?.data_evento || '');
      }, [project?.id, project?.data_evento]);

      useEffect(() => {
        if (!project?.id) return;
        const timeoutId = setTimeout(async () => {
          try {
            await supabase.from('projetos').update({ data_evento: eventDate || null }).eq('id', project.id);
          } catch (e) {
            console.warn('Falha ao salvar data_evento:', e);
          }
        }, 500);
        return () => clearTimeout(timeoutId);
      }, [eventDate, project?.id]);

      useEffect(() => {
        let active = true;
        const loadCompanyInfo = async () => {
          try {
            const { data } = await supabase
              .from('public_config')
              .select('value')
              .eq('key', 'company_info_for_ai')
              .maybeSingle();
            if (active && data?.value) setCompanyInfo(data.value);
          } catch (e) {
            console.warn('Não foi possível carregar info da empresa:', e);
          }
        };
        loadCompanyInfo();
        return () => {
          active = false;
        };
      }, []);
      
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
        setIsDirty(true);
        setSaveErrorMessage('');
        setPlan(newPlan);
      };

      const ensureMateriaisShape = useCallback((input) => {
        if (Array.isArray(input)) {
          return { carrosseis: [], posts: [], videos: [], stories_ideias: [], _legados: input };
        }
        const m = input || {};
        return {
          carrosseis: Array.isArray(m.carrosseis) ? m.carrosseis : [],
          posts: Array.isArray(m.posts) ? m.posts : [],
          videos: Array.isArray(m.videos) ? m.videos : [],
          stories_ideias: Array.isArray(m.stories_ideias) ? m.stories_ideias : [],
          _legados: Array.isArray(m._legados) ? m._legados : [],
        };
      }, []);

      const savePlan = useCallback(async (currentPlan) => {
        if (!currentPlan) return;

        if (saveBusyRef.current) {
          saveQueuedRef.current = currentPlan;
          return;
        }
        saveBusyRef.current = true;
        setIsSaving(true);
        setSaveErrorMessage('');

        try {
          let run = currentPlan;
          while (run) {
            saveQueuedRef.current = null;

            // Persistir só campos editáveis para evitar conflitos com colunas extras/readonly.
            const planToSave = {
              objetivo: run.objetivo || '',
              estrategia_comunicacao: run.estrategia_comunicacao || { mensagem_principal: '', tom_voz: '', gatilhos: '' },
              conteudo_criativos: run.conteudo_criativos || { fases: [] },
              trafego_pago: run.trafego_pago || { orcamento: '', publico: '', objetivo: '' },
              materiais: editorMateriaisShapeToDbRows(ensureMateriaisShape(run.materiais)),
              cronograma: run.cronograma || [],
              contexto_ia: run.contexto_ia || '',
            };

            // Se ainda não existe linha no banco para este projeto, cria automaticamente.
            // INSERT sem `materiais`: usa o default `[]` no Postgres e evita 400 em instâncias
            // onde o primeiro POST com objeto JSON em `materiais` falha; o UPDATE seguinte aplica o conteúdo completo.
            let targetPlanId = run.id || null;
            if (!targetPlanId) {
              const slimInsert = {
                project_id: project.id,
                objetivo: planToSave.objetivo || '',
                estrategia_comunicacao: deepCloneJson(planToSave.estrategia_comunicacao) || {
                  mensagem_principal: '',
                  tom_voz: '',
                  gatilhos: '',
                },
                conteudo_criativos: deepCloneJson(planToSave.conteudo_criativos) || { fases: [] },
                trafego_pago: deepCloneJson(planToSave.trafego_pago) || { orcamento: '', publico: '', objetivo: '' },
                cronograma: deepCloneJson(planToSave.cronograma) || [],
                contexto_ia: planToSave.contexto_ia ?? '',
              };

              const attemptInsert = (payload) =>
                supabase.from('campaign_plans').insert(payload).select().single();

              let { data: inserted, error: insertErr } = await attemptInsert(slimInsert);

              if (insertErr && !inserted) {
                const ctxHint =
                  String(insertErr.message || '').includes('contexto_ia') ||
                  String(insertErr.details || '').includes('contexto_ia');
                if (ctxHint) {
                  const { contexto_ia: _drop, ...rest } = slimInsert;
                  const r2 = await attemptInsert(rest);
                  inserted = r2.data;
                  insertErr = r2.error;
                }
              }

              let existingRow = null;
              if (insertErr && !inserted) {
                const { data: ex, error: exErr } = await supabase
                  .from('campaign_plans')
                  .select('*')
                  .eq('project_id', project.id)
                  .limit(1)
                  .maybeSingle();
                if (!exErr && ex?.id) existingRow = ex;
              }

              if (inserted?.id) {
                targetPlanId = inserted.id;
                const norm = normalizeCampaignPlanRowFromDb(inserted);
                setPlan({ ...norm, ...run, id: inserted.id, project_id: project.id });
              } else if (existingRow?.id) {
                targetPlanId = existingRow.id;
                const norm = normalizeCampaignPlanRowFromDb(existingRow);
                setPlan({ ...norm, ...run, id: existingRow.id, project_id: project.id });
              } else if (insertErr) {
                const detail = [insertErr.message, insertErr.details, insertErr.hint].filter(Boolean).join(' — ');
                setSaveErrorMessage(detail || 'Falha ao salvar');
                toast({
                  title: 'Erro ao criar plano de campanha',
                  description: detail || insertErr.message || 'Bad Request',
                  variant: 'destructive',
                });
                break;
              }
            }

            if (!targetPlanId) {
              break;
            }

            const { error } = await patchCampaignPlanRow(supabase, targetPlanId, planToSave);

            if (error) {
              const detail = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
              setSaveErrorMessage(detail || 'Falha ao salvar');
              toast({ title: 'Erro ao salvar', description: detail || error.message, variant: 'destructive' });
            } else {
              setIsDirty(false);
              toast({ title: 'Salvo automaticamente!', duration: 2000 });
            }

            run = saveQueuedRef.current;
          }
        } finally {
          saveBusyRef.current = false;
          setIsSaving(false);
        }
      }, [toast, project.id, ensureMateriaisShape]);

      const savePlanRef = useRef(savePlan);
      savePlanRef.current = savePlan;

      useEffect(() => {
        const fetchPlan = async () => {
          setLoading(true);
          const sessionKey = `campaign_plan_${project.id}`;
          let sessionSnapshot = null;
          try {
            const saved = sessionStorage.getItem(sessionKey);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed?.data && parsed?.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                sessionSnapshot = parsed;
              }
            }
          } catch (error) {
            console.error('Error restoring plan from session:', error);
          }
          
          const { data, error } = await supabase.from('campaign_plans').select('*').eq('project_id', project.id).maybeSingle();
          if (data) {
            let dbPlan = normalizeCampaignPlanRowFromDb({ ...data });
            let finalPlan = dbPlan;
            if (sessionSnapshot?.data) {
              const localPlan = normalizeCampaignPlanRowFromDb({ ...sessionSnapshot.data });
              const dbUpdatedAt = dbPlan.updated_at ? new Date(dbPlan.updated_at).getTime() : 0;
              const localUpdatedAt = Number(sessionSnapshot.timestamp || 0);
              if (localUpdatedAt > dbUpdatedAt + 1000) {
                finalPlan = {
                  ...dbPlan,
                  ...localPlan,
                  id: dbPlan.id,
                  project_id: dbPlan.project_id,
                };
              }
            }

            setPlan(finalPlan);
            setIsDirty(false);
            setSaveErrorMessage('');
          } else if (sessionSnapshot?.data) {
            setPlan(normalizeCampaignPlanRowFromDb({ ...sessionSnapshot.data }));
            setIsDirty(false);
            setSaveErrorMessage('');
          }
          else if (error && error.code !== 'PGRST116') toast({ title: "Erro ao buscar plano", description: error.message, variant: "destructive" });
          setLoading(false);
          isInitialMount.current = false;
        };
        fetchPlan();
      }, [project.id, toast, isPage]);
      
      useEffect(() => {
        if (!isInitialMount.current && plan) {
          const sessionKey = `campaign_plan_${project.id}`;
          try {
            sessionStorage.setItem(sessionKey, JSON.stringify({
              data: plan,
              timestamp: Date.now()
            }));
          } catch (error) {
            console.error('Error saving plan to session:', error);
          }
          
          if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
          }
          debounceTimeout.current = setTimeout(() => {
            if (isGeneratingRef.current) return;
            const latest = planRef.current;
            if (latest) void savePlanRef.current(latest);
          }, 2000);
        }
        return () => {
          if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
            debounceTimeout.current = null;
          }
        };
      }, [plan, savePlan, project.id, isPage]);

      // Ao sair da aba Plano (desmontagem), persiste o que estava pendente no debounce (deps [] = só no unmount)
      useEffect(() => {
        return () => {
          if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
            debounceTimeout.current = null;
          }
          const p = planRef.current;
          if (!isInitialMount.current && p?.id) {
            void savePlanRef.current(p);
          }
        };
      }, []);

      useEffect(() => {
        if (plan && plan.materiais) {
          const allMateriais = planMateriaisAsRows(plan);
          const cronogramaFromMaterials = allMateriais
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
            setIsDirty(true);
            setSaveErrorMessage('');
            setPlan(p => ({ ...p, cronograma: newCronograma }));
          }
        }
      }, [plan?.materiais]);

      const createPlanTemplate = async () => {
        const slimInsert = {
          project_id: project.id,
          objetivo: '',
          estrategia_comunicacao: { mensagem_principal: '', tom_voz: '', gatilhos: '' },
          conteudo_criativos: { fases: [] },
          trafego_pago: { orcamento: '', publico: '', objetivo: '' },
          cronograma: [],
        };

        const attemptInsert = (row) => supabase.from('campaign_plans').insert(row).select().single();

        let { data, error } = await attemptInsert(slimInsert);

        if (error && !data) {
          const { data: existing } = await supabase
            .from('campaign_plans')
            .select('*')
            .eq('project_id', project.id)
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            const norm = normalizeCampaignPlanRowFromDb(existing);
            setPlan(norm);
            setIsDirty(false);
            setSaveErrorMessage('');
            return;
          }
          const detail = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
          toast({ title: 'Erro ao criar formulário', description: detail || error.message, variant: 'destructive' });
          return;
        }

        const norm = normalizeCampaignPlanRowFromDb(data);
        setPlan(norm);
        setIsDirty(false);
        setSaveErrorMessage('');
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

      const handleUpdate = (field, value) => {
        setIsDirty(true);
        setSaveErrorMessage('');
        setPlan(p => ({ ...p, [field]: value }));
      };
      const handleNestedUpdate = (mainField, nestedField, value) => {
        setIsDirty(true);
        setSaveErrorMessage('');
        setPlan((p) => {
          if (mainField === 'materiais') {
            const base = ensureMateriaisShape(p.materiais);
            return { ...p, materiais: { ...base, [nestedField]: value } };
          }
          return { ...p, [mainField]: { ...(p[mainField] || {}), [nestedField]: value } };
        });
      };
      const addToList = (field, newItem) => handleUpdate(field, [...(plan[field] || []), newItem]);

      const checkClientData = () => !client?.publico_alvo || !client?.tom_de_voz;

      const sanitizeJsonCandidate = (text) => {
        const raw = String(text || '').trim();
        if (!raw) return raw;
        // Remove cercas markdown comuns: ```json ... ```
        if (raw.startsWith('```')) {
          return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        return raw;
      };

      /** Atualiza `detalhes` de um material (carrossel / vídeo / legado) sem apagar a lista `materiais`. */
      const applyDetalhesToMaterialById = (itemId, detalhesText) => {
        setIsDirty(true);
        setSaveErrorMessage('');
        setPlan((p) => {
          const m = ensureMateriaisShape(p.materiais);
          const patchArr = (arr) =>
            (Array.isArray(arr) ? arr : []).map((it) =>
              String(it.id) === String(itemId) ? { ...it, detalhes: detalhesText } : it
            );
          return {
            ...p,
            materiais: {
              ...m,
              carrosseis: patchArr(m.carrosseis),
              posts: patchArr(m.posts),
              videos: patchArr(m.videos),
              _legados: patchArr(m._legados),
            },
          };
        });
      };

      const aiGenKey = (field, materialItem) => {
        if (materialItem != null && materialItem.id != null) return `${field}:${materialItem.id}`;
        if (field === 'materiais.ideia_extra' && materialItem?.kind) return `${field}:${materialItem.kind}`;
        return field;
      };

      const processAIRequest = async (prompt, field, materialItem = null, config = { temperature: 0.7, max_tokens: 500 }) => {
        if (checkClientData()) {
          setShowIncompleteDataAlert(true);
          return;
        }

        setIsGenerating(true);
        setGeneratingField(aiGenKey(field, materialItem));

        const messages = [{ role: 'user', content: prompt }];

        try {
          let result;
          try {
            result = await invokeProjectsAiChat({
              messages,
              model: selectedAiModel,
              openaiModel: selectedAiModel.startsWith('openai/') ? selectedAiModel.replace('openai/', '') : selectedAiModel,
              temperature: config.temperature,
              max_tokens: config.max_tokens,
            });
          } catch (edgeErr) {
            const apiKey = await getOpenAIKey();
            if (!apiKey) {
              setShowOpenAIAlert(true);
              return;
            }
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: selectedAiModel.startsWith('openai/') ? selectedAiModel.replace('openai/', '') : selectedAiModel,
                messages,
                temperature: config.temperature,
                max_tokens: config.max_tokens,
              })
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
                return;
              }
              throw new Error(data?.error?.message || `API da OpenAI respondeu com status ${response.status}`);
            }
            result = data.choices[0].message.content.trim();
          }

          // Roteiro/briefing de um material: texto livre (nunca usar handleUpdateListItem('materiais', …) — apagava todo o plano)
          if (field === 'materiais.detalhes' && materialItem) {
            let detalhesText = String(result || '').trim();
            try {
              const pr = JSON.parse(sanitizeJsonCandidate(result));
              if (typeof pr === 'string') detalhesText = pr;
              else if (pr && typeof pr === 'object' && pr.detalhes != null) detalhesText = String(pr.detalhes).trim();
            } catch {
              /* mantém texto cru da IA */
            }
            applyDetalhesToMaterialById(materialItem.id, detalhesText);
            toast({ title: 'Campo atualizado com sucesso!' });
            return;
          }

          /** Uma ideia extra por tipo (carrossel / post / vídeo / story), anexada ao plano. */
          if (field === 'materiais.ideia_extra' && materialItem?.kind) {
            const kind = materialItem.kind;

            if (kind === 'story') {
              let ideia = '';
              try {
                const pr = JSON.parse(sanitizeJsonCandidate(result));
                if (typeof pr === 'string') ideia = pr;
                else ideia = pr?.ideia ?? pr?.descricao ?? '';
              } catch {
                ideia = String(result || '')
                  .trim()
                  .split('\n')[0];
              }
              ideia = String(ideia).trim();
              if (!ideia) {
                toast({ title: 'Ideia vazia', description: 'Tente de novo.', variant: 'destructive' });
                return;
              }
              setIsDirty(true);
              setSaveErrorMessage('');
              setPlan((p) => {
                const mm = ensureMateriaisShape(p.materiais);
                return { ...p, materiais: { ...mm, stories_ideias: [...(mm.stories_ideias || []), ideia] } };
              });
              toast({ title: 'Ideia de story adicionada!' });
              return;
            }

            let parsed;
            try {
              parsed = JSON.parse(sanitizeJsonCandidate(result));
            } catch {
              toast({
                title: 'Resposta inválida',
                description: 'A IA não devolveu JSON no formato esperado.',
                variant: 'destructive',
              });
              return;
            }
            const desc = String(parsed.descricao || '').trim();
            if (!desc) {
              toast({ title: 'Descrição vazia', description: 'Peça outra ideia à IA.', variant: 'destructive' });
              return;
            }
            const plat = (parsed.plataforma && String(parsed.plataforma).trim()) || defaultPlataformaNome;
            const det = String(parsed.detalhes ?? '').trim();
            const de = String(parsed.data_entrega ?? '').trim();
            const dp = String(parsed.data_postagem ?? '').trim();
            const newId = Date.now() + Math.random();

            setIsDirty(true);
            setSaveErrorMessage('');
            setPlan((p) => {
              const mm = ensureMateriaisShape(p.materiais);
              if (kind === 'carrossel') {
                const arr = [...(mm.carrosseis || [])];
                arr.push({
                  id: newId,
                  tipo: 'arte',
                  descricao: desc,
                  detalhes: det,
                  data_entrega: de,
                  data_postagem: dp,
                  responsavel_id: null,
                  plataforma: plat,
                });
                return { ...p, materiais: { ...mm, carrosseis: arr } };
              }
              if (kind === 'post') {
                const arr = [...(mm.posts || [])];
                arr.push({
                  id: newId,
                  tipo: 'post',
                  formato: 'Post',
                  descricao: desc,
                  detalhes: det,
                  data_entrega: de,
                  data_postagem: dp,
                  responsavel_id: null,
                  plataforma: plat,
                });
                return { ...p, materiais: { ...mm, posts: arr } };
              }
              if (kind === 'video') {
                const arr = [...(mm.videos || [])];
                arr.push({
                  id: newId,
                  tipo: 'video',
                  descricao: desc,
                  detalhes: det,
                  data_entrega: de,
                  data_postagem: dp,
                  responsavel_id: null,
                  plataforma: plat,
                });
                return { ...p, materiais: { ...mm, videos: arr } };
              }
              return p;
            });
            toast({ title: 'Nova ideia adicionada ao plano!' });
            return;
          }

          try {
            const parsedResult = JSON.parse(sanitizeJsonCandidate(result));
            if (field === 'conteudo_criativos.fases') {
                if (!Array.isArray(parsedResult)) {
                  throw new Error('Formato inválido para fases: esperado array JSON.');
                }
                handleUpdate('conteudo_criativos', { fases: parsedResult.map(item => ({ ...item, id: Date.now() + Math.random(), data_entrega: item.data_entrega || '', data_postagem: item.data_postagem || '' })) });
            } else if (field === 'materiais') {
                if (!parsedResult || typeof parsedResult !== 'object') {
                  throw new Error('Formato inválido para materiais: esperado objeto JSON.');
                }
                const asArray = (x) => {
                  if (Array.isArray(x)) return x;
                  if (x && typeof x === 'object') return [x];
                  return [];
                };
                const mapItems = (arr) =>
                  asArray(arr).map((item) => ({
                    ...item,
                    id: item.id || Date.now() + Math.random(),
                    plataforma: item.plataforma || defaultPlataformaNome,
                  }));
                const mapCarrosseis = (arr) =>
                  asArray(arr).map((item) => ({
                    ...item,
                    id: item.id || Date.now() + Math.random(),
                    tipo: 'arte',
                    plataforma: item.plataforma || defaultPlataformaNome,
                  }));
                const mapPosts = (arr) =>
                  asArray(arr).map((item) => ({
                    ...item,
                    id: item.id || Date.now() + Math.random(),
                    tipo: 'post',
                    formato: (item.formato && String(item.formato).trim()) || 'Post',
                    plataforma: item.plataforma || defaultPlataformaNome,
                  }));
                const mapVideos = (arr) =>
                  asArray(arr).map((item) => ({
                    ...item,
                    id: item.id || Date.now() + Math.random(),
                    tipo: 'video',
                    plataforma: item.plataforma || defaultPlataformaNome,
                  }));
                handleUpdate('materiais', {
                  ...ensureMateriaisShape(plan.materiais),
                  carrosseis: mapCarrosseis(parsedResult.carrosseis),
                  posts: mapPosts(parsedResult.posts),
                  videos: mapVideos(parsedResult.videos),
                  stories_ideias: Array.isArray(parsedResult.stories_ideias)
                    ? parsedResult.stories_ideias
                    : typeof parsedResult.stories_ideias === 'string'
                      ? [parsedResult.stories_ideias]
                      : [],
                });
            }
          } catch (e) {
            // Campos que exigem JSON não devem receber texto cru, para não quebrar a UI.
            if (field === 'conteudo_criativos.fases' || field === 'materiais') {
              toast({
                title: 'Resposta da IA em formato inválido',
                description: 'A IA não retornou JSON válido. Tente novamente ou refine o prompt.',
                variant: 'destructive',
              });
              return;
            }
            if (field.includes('.')) {
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
        if (checkClientData()) {
          setShowIncompleteDataAlert(true);
          return;
        }

        const baseContext = buildBaseContext({ project, client, plan, companyInfo });
        const prompt = buildPrompt({ field, baseContext, materialItem, client });
        const config = getGenerationConfig(field);

        await processAIRequest(prompt, field, materialItem, config);
      };
      
      const refineWithAI = async (instruction) => {
        if (!refiningFieldInfo) return;
        const { field, content, materialItem } = refiningFieldInfo;
      
        const baseContext = buildBaseContext({ project, client, plan, companyInfo });
        const prompt = buildPrompt({
          field: 'refinar',
          baseContext,
          refinementContext: instruction,
          currentContent: content,
        });
        const config = getGenerationConfig('refinar');
      
        await processAIRequest(prompt, field, materialItem, config);
        setRefineDialogOpen(false);
        setRefinementContext('');
        setRefiningFieldInfo(null);
      };

      const handleOpenRefineDialog = (field, content, materialItem = null) => {
        setRefiningFieldInfo({ field, content, materialItem });
        setRefineDialogOpen(true);
      };

      const resolvePlanList = (listName) => {
        if (!listName.includes('.')) return Array.isArray(plan[listName]) ? plan[listName] : [];
        const [a, b] = listName.split('.');
        if (a === 'materiais') {
          const sub = ensureMateriaisShape(plan.materiais)[b];
          return Array.isArray(sub) ? sub : [];
        }
        const sub = plan[a]?.[b];
        return Array.isArray(sub) ? sub : [];
      };

      const handleUpdateListItem = (listName, id, field, value) => {
        const list = resolvePlanList(listName);
        const updatedList = list.map((item) => (item.id === id ? { ...item, [field]: value } : item));
        if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };
      
      const handleRemoveListItem = (listName, id) => {
        const list = resolvePlanList(listName);
        const updatedList = list.filter((item) => item.id !== id);
        if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };

      const handleAddListItem = (listName, newItem) => {
        const list = resolvePlanList(listName);
        const updatedList = [...list, newItem];
         if (listName.includes('.')) {
          const [mainField, nestedField] = listName.split('.');
          handleNestedUpdate(mainField, nestedField, updatedList);
        } else {
          handleUpdate(listName, updatedList);
        }
      };

      const openMaterialDetalhesModal = (listName, item, title) => {
        setMaterialDetalhesModal({
          listName,
          id: item.id,
          draft: item.detalhes || '',
          title,
        });
      };

      const saveMaterialDetalhesModal = () => {
        if (!materialDetalhesModal) return;
        const { listName, id, draft } = materialDetalhesModal;
        handleUpdateListItem(listName, id, 'detalhes', draft);
        setMaterialDetalhesModal(null);
      };

      const openTaskFromPlanDialog = (item) => {
        setTaskFromPlanItem(item);
        setTaskFromPlanDialogOpen(true);
      };

      const confirmCreateTaskFromPlan = async () => {
        if (!taskFromPlanItem) return;
        const { blocking } = getPlanItemTaskWarnings(taskFromPlanItem);
        if (blocking.length) return;

        const item = taskFromPlanItem;
        const newTask = {
          title: buildTaskTitleFromPlanMaterial(client?.empresa, item.descricao),
          description: item.detalhes || null,
          status: 'todo',
          project_id: project.id,
          client_id: project.client_id,
          owner_id: user.id,
          assignee_ids: item.responsavel_id ? [item.responsavel_id] : [],
          type: item.tipo,
          due_date: item.data_entrega || null,
          post_date: item.data_postagem || null,
          plataforma: (item.plataforma || '').trim() || null,
        };

        setIsInsertingPlanTask(true);
        try {
          const { error } = await supabase.from('tarefas').insert(newTask);
          if (error) {
            toast({ title: 'Erro ao criar tarefa', description: error.message, variant: 'destructive' });
          } else {
            toast({ title: 'Tarefa criada!', description: 'Abra a página de Tarefas para acompanhar.' });
            setTaskFromPlanDialogOpen(false);
            setTaskFromPlanItem(null);
          }
        } finally {
          setIsInsertingPlanTask(false);
        }
      };

      const handleCronogramaChange = (id, field, value) => {
        const cron = Array.isArray(plan.cronograma) ? plan.cronograma : [];
        const updatedCronograma = cron.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        );
        handleUpdate('cronograma', updatedCronograma);
      };

      const handleRemoveCronogramaItem = (id) => {
        const cron = Array.isArray(plan.cronograma) ? plan.cronograma : [];
        const updatedCronograma = cron.filter((item) => item.id !== id);
        handleUpdate('cronograma', updatedCronograma);
      };
      
      const renderTaskPlanHints = (item) => {
        const { blocking, optional } = getPlanItemTaskWarnings(item);
        if (!blocking.length && !optional.length) return null;
        return (
          <div className="text-xs space-y-1 mt-1">
            {blocking.length > 0 && (
              <p className="text-red-600 dark:text-red-400">
                <span className="font-medium">Obrigatório:</span> {blocking.join(', ')}
              </p>
            )}
            {optional.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                <span className="font-medium">Pendente:</span> {optional.join(', ')}
              </p>
            )}
          </div>
        );
      };

      const AiButtonGroup = ({ field, content, materialItem = null }) => {
        const gk = aiGenKey(field, materialItem);
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => generateWithAI(field, materialItem)} disabled={isGenerating}>
              <Sparkles size={14} className="mr-1" />
              {isGenerating && generatingField === gk ? 'Gerando...' : 'IA'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleOpenRefineDialog(field, content, materialItem)} disabled={isGenerating || !content}>
              <Wand2 size={14} className="mr-1" />
              Refinar
            </Button>
          </div>
        );
      };

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
              <SectionCard icon={<BookOpen className="h-6 w-6 text-indigo-600" />} title="Contexto para IA">
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
                  <div className="grid gap-2 pt-2 sm:max-w-md">
                    <Label>Modelo de IA para este plano</Label>
                    <Select value={selectedAiModel} onValueChange={setSelectedAiModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAiModels.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            {modelId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      A lista vem da configuração global do super admin.
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<Target className="h-6 w-6 text-blue-600" />} title="O que vamos fazer? (Objetivo principal)">
                  <div className="flex items-center justify-between"><label>Objetivo Principal</label><AiButtonGroup field="objetivo" content={plan.objetivo} /></div>
                  <Textarea value={plan.objetivo} onChange={e => handleUpdate('objetivo', e.target.value)} />
              </SectionCard>
              
              <SectionCard icon={<Megaphone className="h-6 w-6 text-purple-600" />} title="1. Estratégia de Comunicação">
                  <div>
                      <div className="flex items-center justify-between"><label>Mensagem Principal</label><AiButtonGroup field="estrategia_comunicacao.mensagem_principal" content={plan.estrategia_comunicacao?.mensagem_principal} /></div>
                      <Textarea value={plan.estrategia_comunicacao?.mensagem_principal || ''} onChange={e => handleNestedUpdate('estrategia_comunicacao', 'mensagem_principal', e.target.value)} />
                  </div>
                  <div>
                      <div className="flex items-center justify-between"><label>Tom de Voz</label><AiButtonGroup field="estrategia_comunicacao.tom_voz" content={plan.estrategia_comunicacao?.tom_voz} /></div>
                      <Textarea
                        value={plan.estrategia_comunicacao?.tom_voz || ''}
                        onChange={(e) => handleNestedUpdate('estrategia_comunicacao', 'tom_voz', e.target.value)}
                        rows={4}
                        className="min-h-[80px] [field-sizing:content]"
                      />
                  </div>
                  <div>
                      <div className="flex items-center justify-between"><label>Gatilhos Emocionais</label><AiButtonGroup field="estrategia_comunicacao.gatilhos" content={plan.estrategia_comunicacao?.gatilhos} /></div>
                      <Textarea
                        value={plan.estrategia_comunicacao?.gatilhos || ''}
                        onChange={(e) => handleNestedUpdate('estrategia_comunicacao', 'gatilhos', e.target.value)}
                        rows={5}
                        className="min-h-[80px] [field-sizing:content]"
                      />
                  </div>
              </SectionCard>
              
              <SectionCard icon={<Lightbulb className="h-6 w-6 text-yellow-600" />} title="2. Conteúdo e criativos">
                  <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => generateWithAI('conteudo_criativos.fases')} disabled={isGenerating}><Sparkles size={14} className="mr-1" />{isGenerating && generatingField === 'conteudo_criativos.fases' ? 'Gerando...' : 'Sugerir Fases com IA'}</Button>
                      <Button variant="outline" size="sm" onClick={() => handleAddListItem('conteudo_criativos.fases', { id: Date.now(), nome: 'Nova Fase', descricao: '', data_entrega: '', data_postagem: '' })}><PlusCircle className="h-4 w-4 mr-2" />Adicionar Fase</Button>
                  </div>
                  {(plan.conteudo_criativos?.fases || []).map((fase) => (
                  <div key={fase.id} className="p-3 border rounded-lg space-y-2">
                      {editingItemId === fase.id ? (
                      <>
                          <Input value={fase.nome} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'nome', e.target.value)} className="font-bold" />
                          <Textarea value={fase.descricao} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'descricao', e.target.value)} />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Data de entrega (opcional)</Label>
                              <Input type="date" value={fase.data_entrega || ''} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'data_entrega', e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Data de postagem (opcional)</Label>
                              <Input type="date" value={fase.data_postagem || ''} onChange={(e) => handleUpdateListItem('conteudo_criativos.fases', fase.id, 'data_postagem', e.target.value)} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Fases são etapas estratégicas do plano; só materiais concretos exigem datas para criar tarefa.
                          </p>
                          <Button size="sm" onClick={() => setEditingItemId(null)}><Check className="h-4 w-4 mr-2" />Salvar</Button>
                      </>
                      ) : (
                      <>
                          <div className="flex justify-between items-start gap-2 flex-wrap">
                          <p className="font-bold">{fase.nome}</p>
                          <div className="flex flex-wrap gap-1 items-center">
                              <Button variant="outline" size="sm" className="h-8" onClick={() => openTaskFromPlanDialog({
                                descricao: `Fase: ${fase.nome}`,
                                detalhes: fase.descricao || '',
                                tipo: 'Planejamento',
                                data_entrega: fase.data_entrega || '',
                                data_postagem: fase.data_postagem || '',
                                responsavel_id: null,
                              })}>
                                <ClipboardList className="h-4 w-4 mr-1.5" />
                                Criar tarefa
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingItemId(fase.id)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveListItem('conteudo_criativos.fases', fase.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Datas e responsável na tarefa são opcionais para fases — use «Editar» se quiser ancorar entregas no calendário.
                          </p>
                          <p className="text-sm text-muted-foreground">{fase.descricao}</p>
                      </>
                      )}
                  </div>
                  ))}
              </SectionCard>

              <SectionCard icon={<DollarSign className="h-6 w-6 text-green-600" />} title="3. Tráfego pago (anúncios)">
                  <div><label>Orçamento</label><Input type="number" value={plan.trafego_pago?.orcamento || ''} onChange={e => handleNestedUpdate('trafego_pago', 'orcamento', e.target.value)} /></div>
                  <div><label>Público</label><Textarea value={plan.trafego_pago?.publico || ''} onChange={e => handleNestedUpdate('trafego_pago', 'publico', e.target.value)} /></div>
                  <div><label>Objetivo</label><Input value={plan.trafego_pago?.objetivo || ''} onChange={e => handleNestedUpdate('trafego_pago', 'objetivo', e.target.value)} /></div>
              </SectionCard>

              <SectionCard icon={<List className="h-6 w-6 text-indigo-600" />} title="4. Materiais necessários">
                  {client?.tipo_servico !== 'apenas_consultoria' && client?.entregaveis && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm font-medium">📦 Pacote contratado deste cliente:</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {client.entregaveis.carrosseis} carrossel(éis) ·{' '}
                        {Number(client.entregaveis.posts ?? 0)} post(s) ·{' '}
                        {client.entregaveis.videos} vídeo(s) ·{' '}
                        {client.entregaveis.stories} story(ies) ·{' '}
                        {client.entregaveis.anuncios} anúncio(s) (na aba Tráfego Pago)
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/20 dark:bg-muted/10 p-4 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Materiais do plano</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Escolha o tipo na aba abaixo e use um único «Adicionar» por tipo. «Sugerir com IA» preenche o pacote inteiro.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="shrink-0"
                          onClick={() => generateWithAI('materiais')}
                          disabled={isGenerating}
                        >
                          <Sparkles size={14} className="mr-1.5" />
                          {isGenerating && generatingField === 'materiais' ? 'Gerando…' : 'Sugerir com IA'}
                        </Button>
                      </div>

                      <Tabs value={materiaisTab} onValueChange={setMateriaisTab} className="w-full">
                        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
                          <TabsTrigger value="carrossel" className="flex-1 min-w-[7.5rem] sm:flex-none">
                            Carrosséis ({(ensureMateriaisShape(plan.materiais).carrosseis || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="post" className="flex-1 min-w-[7.5rem] sm:flex-none">
                            Posts ({(ensureMateriaisShape(plan.materiais).posts || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="video" className="flex-1 min-w-[7.5rem] sm:flex-none">
                            Vídeos ({(ensureMateriaisShape(plan.materiais).videos || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="stories" className="flex-1 min-w-[7.5rem] sm:flex-none">
                            Stories ({(ensureMateriaisShape(plan.materiais).stories_ideias || []).length})
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="carrossel" className="mt-4 space-y-3">
                          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-3">
                            <p className="text-xs text-muted-foreground min-w-0 flex-1">
                              Carrosséis multi-slide (roteiro por slide, sequência no feed).
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0"
                              disabled={isGenerating}
                              title="Gera mais uma ideia de carrossel com base no plano e no que já existe nesta aba"
                              onClick={() => {
                                const m = ensureMateriaisShape(plan.materiais);
                                const existentes = (m.carrosseis || []).map((x) => (x.descricao || '').trim()).filter(Boolean);
                                void generateWithAI('materiais.ideia_extra', { kind: 'carrossel', existentes });
                              }}
                            >
                              {isGenerating && generatingField === 'materiais.ideia_extra:carrossel' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1.5" />
                              )}
                              Mais ideia — carrossel
                            </Button>
                          </div>
                          {(plan.materiais?.carrosseis || []).map((item) => (
                            <div key={item.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-foreground">Descrição (título / conceito)</Label>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[64px] resize-y text-sm leading-snug"
                                  value={item.descricao || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.carrosseis', item.id, 'descricao', e.target.value)}
                                  placeholder="Ex.: Carrossel 5 slides — benefícios do produto…"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <Label className="text-xs font-medium text-foreground">Briefing / roteiro</Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      openMaterialDetalhesModal(
                                        'materiais.carrosseis',
                                        item,
                                        'Briefing — carrossel'
                                      )
                                    }
                                  >
                                    <Maximize2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                                    Ver tudo
                                  </Button>
                                </div>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[68px] resize-y text-sm leading-snug"
                                  value={item.detalhes || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.carrosseis', item.id, 'detalhes', e.target.value)}
                                  placeholder="Resumo ou primeiras linhas…"
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                <Input type="date" value={item.data_entrega || ''} onChange={(e) => handleUpdateListItem('materiais.carrosseis', item.id, 'data_entrega', e.target.value)} />
                                <Input type="date" value={item.data_postagem || ''} onChange={(e) => handleUpdateListItem('materiais.carrosseis', item.id, 'data_postagem', e.target.value)} />
                                <PlataformaMaterialSelect value={item.plataforma} onChange={(v) => handleUpdateListItem('materiais.carrosseis', item.id, 'plataforma', v)} plataformas={plataformas} loading={platsLoading} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => openTaskFromPlanDialog(item)}>
                                  <ClipboardList className="h-4 w-4 mr-1.5" />
                                  Criar tarefa
                                </Button>
                                <AiButtonGroup field="materiais.detalhes" content={item.detalhes} materialItem={item} />
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveListItem('materiais.carrosseis', item.id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              handleAddListItem('materiais.carrosseis', {
                                id: Date.now(),
                                tipo: 'arte',
                                descricao: '',
                                data_entrega: '',
                                data_postagem: '',
                                responsavel_id: null,
                                detalhes: '',
                                plataforma: defaultPlataformaNome,
                              })
                            }
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Adicionar carrossel
                          </Button>
                        </TabsContent>

                        <TabsContent value="post" className="mt-4 space-y-3">
                          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-3">
                            <p className="text-xs text-muted-foreground min-w-0 flex-1">
                              Post único no feed (foto, vídeo curto de um take ou legenda) — não é carrossel multi-slide.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0"
                              disabled={isGenerating}
                              title="Gera mais uma ideia de post com base no plano e no que já existe nesta aba"
                              onClick={() => {
                                const m = ensureMateriaisShape(plan.materiais);
                                const existentes = (m.posts || []).map((x) => (x.descricao || '').trim()).filter(Boolean);
                                void generateWithAI('materiais.ideia_extra', { kind: 'post', existentes });
                              }}
                            >
                              {isGenerating && generatingField === 'materiais.ideia_extra:post' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1.5" />
                              )}
                              Mais ideia — post
                            </Button>
                          </div>
                          {(plan.materiais?.posts || []).map((item) => (
                            <div key={item.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-foreground">Descrição (título / ideia)</Label>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[64px] resize-y text-sm leading-snug"
                                  value={item.descricao || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.posts', item.id, 'descricao', e.target.value)}
                                  placeholder="Ex.: Post Dia das Mães — foto + legenda…"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <Label className="text-xs font-medium text-foreground">Copy / briefing</Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      openMaterialDetalhesModal('materiais.posts', item, 'Briefing — post')
                                    }
                                  >
                                    <Maximize2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                                    Ver tudo
                                  </Button>
                                </div>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[68px] resize-y text-sm leading-snug"
                                  value={item.detalhes || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.posts', item.id, 'detalhes', e.target.value)}
                                  placeholder="Resumo…"
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                <Input type="date" value={item.data_entrega || ''} onChange={(e) => handleUpdateListItem('materiais.posts', item.id, 'data_entrega', e.target.value)} />
                                <Input type="date" value={item.data_postagem || ''} onChange={(e) => handleUpdateListItem('materiais.posts', item.id, 'data_postagem', e.target.value)} />
                                <PlataformaMaterialSelect value={item.plataforma} onChange={(v) => handleUpdateListItem('materiais.posts', item.id, 'plataforma', v)} plataformas={plataformas} loading={platsLoading} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => openTaskFromPlanDialog(item)}>
                                  <ClipboardList className="h-4 w-4 mr-1.5" />
                                  Criar tarefa
                                </Button>
                                <AiButtonGroup field="materiais.detalhes" content={item.detalhes} materialItem={item} />
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveListItem('materiais.posts', item.id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              handleAddListItem('materiais.posts', {
                                id: Date.now(),
                                tipo: 'post',
                                formato: 'Post',
                                descricao: '',
                                data_entrega: '',
                                data_postagem: '',
                                responsavel_id: null,
                                detalhes: '',
                                plataforma: defaultPlataformaNome,
                              })
                            }
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Adicionar post
                          </Button>
                        </TabsContent>

                        <TabsContent value="video" className="mt-4 space-y-3">
                          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-3">
                            <p className="text-xs text-muted-foreground min-w-0 flex-1">
                              Reels, TikToks, vídeos para anúncio, YouTube, etc.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0"
                              disabled={isGenerating}
                              title="Gera mais uma ideia de vídeo com base no plano e no que já existe nesta aba"
                              onClick={() => {
                                const m = ensureMateriaisShape(plan.materiais);
                                const existentes = (m.videos || []).map((x) => (x.descricao || '').trim()).filter(Boolean);
                                void generateWithAI('materiais.ideia_extra', { kind: 'video', existentes });
                              }}
                            >
                              {isGenerating && generatingField === 'materiais.ideia_extra:video' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1.5" />
                              )}
                              Mais ideia — vídeo
                            </Button>
                          </div>
                          {(plan.materiais?.videos || []).map((item) => (
                            <div key={item.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-foreground">Descrição (título / conceito)</Label>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[64px] resize-y text-sm leading-snug"
                                  value={item.descricao || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.videos', item.id, 'descricao', e.target.value)}
                                  placeholder="Ex.: Reel 30s — depoimento…"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <Label className="text-xs font-medium text-foreground">Roteiro / briefing</Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      openMaterialDetalhesModal('materiais.videos', item, 'Briefing — vídeo')
                                    }
                                  >
                                    <Maximize2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                                    Ver tudo
                                  </Button>
                                </div>
                                <Textarea
                                  rows={2}
                                  className="min-h-[44px] max-h-[68px] resize-y text-sm leading-snug"
                                  value={item.detalhes || ''}
                                  onChange={(e) => handleUpdateListItem('materiais.videos', item.id, 'detalhes', e.target.value)}
                                  placeholder="Resumo…"
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                <Input type="date" value={item.data_entrega || ''} onChange={(e) => handleUpdateListItem('materiais.videos', item.id, 'data_entrega', e.target.value)} />
                                <Input type="date" value={item.data_postagem || ''} onChange={(e) => handleUpdateListItem('materiais.videos', item.id, 'data_postagem', e.target.value)} />
                                <PlataformaMaterialSelect value={item.plataforma} onChange={(v) => handleUpdateListItem('materiais.videos', item.id, 'plataforma', v)} plataformas={plataformas} loading={platsLoading} />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => openTaskFromPlanDialog(item)}>
                                  <ClipboardList className="h-4 w-4 mr-1.5" />
                                  Criar tarefa
                                </Button>
                                <AiButtonGroup field="materiais.detalhes" content={item.detalhes} materialItem={item} />
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveListItem('materiais.videos', item.id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              handleAddListItem('materiais.videos', {
                                id: Date.now(),
                                tipo: 'video',
                                descricao: '',
                                data_entrega: '',
                                data_postagem: '',
                                responsavel_id: null,
                                detalhes: '',
                                plataforma: defaultPlataformaNome,
                              })
                            }
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Adicionar vídeo
                          </Button>
                        </TabsContent>

                        <TabsContent value="stories" className="mt-4 space-y-3">
                          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-3">
                            <p className="text-xs text-muted-foreground min-w-0 flex-1">
                              Uma linha curta por ideia (pool de temas para o mês).
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0"
                              disabled={isGenerating}
                              title="Gera mais uma ideia de story com base no plano e nas ideias já listadas"
                              onClick={() => {
                                const m = ensureMateriaisShape(plan.materiais);
                                const existentes = (m.stories_ideias || []).map((s) => String(s || '').trim()).filter(Boolean);
                                void generateWithAI('materiais.ideia_extra', { kind: 'story', existentes });
                              }}
                            >
                              {isGenerating && generatingField === 'materiais.ideia_extra:story' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1.5" />
                              )}
                              Mais ideia — story
                            </Button>
                          </div>
                          {(plan.materiais?.stories_ideias || []).map((ideia, idx) => (
                            <div key={`${idx}-${ideia}`} className="flex gap-2">
                              <Input
                                value={ideia || ''}
                                onChange={(e) => {
                                  const next = [...(plan.materiais?.stories_ideias || [])];
                                  next[idx] = e.target.value;
                                  handleUpdate('materiais', { ...ensureMateriaisShape(plan.materiais), stories_ideias: next });
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = [...(plan.materiais?.stories_ideias || [])];
                                  next.splice(idx, 1);
                                  handleUpdate('materiais', { ...ensureMateriaisShape(plan.materiais), stories_ideias: next });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              const next = [...(plan.materiais?.stories_ideias || []), ''];
                              handleUpdate('materiais', { ...ensureMateriaisShape(plan.materiais), stories_ideias: next });
                            }}
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Adicionar ideia de story
                          </Button>
                        </TabsContent>
                      </Tabs>
                    </div>

                    {(plan.materiais?._legados || []).length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
                        <p className="flex items-center gap-2 font-semibold text-amber-900">
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                          Materiais antigos (formato anterior)
                        </p>
                        <ul className="mt-2 text-sm text-amber-900/80 list-disc list-inside">
                          {(ensureMateriaisShape(plan.materiais)._legados || []).map((it, idx) => (
                            <li key={idx}>{it?.descricao || it?.tipo || 'Material legado'}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
              </SectionCard>

              <SectionCard icon={<Calendar className="h-6 w-6 text-red-600" />} title="Cronograma de postagens e ações">
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
                className={cn(
                  'fixed bottom-6 z-30',
                  isPage && chatLayoutWide && isChatOpen ? 'hidden' : 'right-6'
                )}
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
                <AlertDialogTitleComponent><AlertTriangle className="inline mr-2 text-yellow-500" />IA não disponível no navegador</AlertDialogTitleComponent>
                <AlertDialogDescription>
                  O servidor não conseguiu usar a IA e não há chave no dispositivo. Em Configurações, salve a chave OpenAI (superadmin) ou configure OpenRouter para campanhas. Confirme também se as Edge Functions <code className="text-xs">openai-chat</code> / <code className="text-xs">openrouter-chat</code> estão deployadas no Supabase.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog
            open={taskFromPlanDialogOpen}
            onOpenChange={(open) => {
              setTaskFromPlanDialogOpen(open);
              if (!open) setTaskFromPlanItem(null);
            }}
          >
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitleComponent>Criar tarefa a partir do plano?</AlertDialogTitleComponent>
                <AlertDialogDescription className="sr-only">
                  Confirme se deseja criar uma nova tarefa com os dados do material ou da fase selecionados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {taskFromPlanItem && (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Será criada uma tarefa na campanha{' '}
                    <span className="font-medium text-foreground">{project.name}</span> com:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-foreground">
                    <li>
                      <span className="text-muted-foreground">Título:</span>{' '}
                      {buildTaskTitleFromPlanMaterial(client?.empresa, taskFromPlanItem.descricao)}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Entrega:</span>{' '}
                      {taskFromPlanItem.data_entrega || '—'}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Postagem:</span>{' '}
                      {taskFromPlanItem.data_postagem || '—'}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Responsável:</span>{' '}
                      {taskFromPlanItem.responsavel_id
                        ? profiles.find((p) => p.id === taskFromPlanItem.responsavel_id)?.full_name || '—'
                        : '—'}
                    </li>
                  </ul>
                  {(() => {
                    const { blocking, optional } = getPlanItemTaskWarnings(taskFromPlanItem);
                    return (
                      <>
                        {blocking.length > 0 && (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                            <p className="font-medium text-sm">Corrija no plano antes de criar:</p>
                            <ul className="list-disc pl-4 mt-1 text-sm">
                              {blocking.map((x) => (
                                <li key={x}>{x}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {optional.length > 0 && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                            <p className="font-medium text-sm">Recomendado preencher:</p>
                            <ul className="list-disc pl-4 mt-1 text-sm">
                              {optional.map((x) => (
                                <li key={x}>{x}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isInsertingPlanTask}>Cancelar</AlertDialogCancel>
                <Button
                  type="button"
                  onClick={confirmCreateTaskFromPlan}
                  disabled={
                    !taskFromPlanItem ||
                    getPlanItemTaskWarnings(taskFromPlanItem).blocking.length > 0 ||
                    isInsertingPlanTask
                  }
                >
                  {isInsertingPlanTask ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Sim, criar tarefa
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );

      const renderMaterialDetalhesDialog = () => (
        <Dialog
          open={!!materialDetalhesModal}
          onOpenChange={(open) => {
            if (!open) setMaterialDetalhesModal(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle>{materialDetalhesModal?.title || 'Briefing e detalhes'}</DialogTitle>
              <DialogDescription className="text-xs">
                Edição completa do texto. As alterações só são aplicadas ao clicar em Guardar.
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-4 flex-1 min-h-0 flex flex-col gap-3">
              <Textarea
                className="min-h-[280px] flex-1 resize-y text-sm font-mono leading-relaxed"
                value={materialDetalhesModal?.draft ?? ''}
                onChange={(e) =>
                  setMaterialDetalhesModal((m) => (m ? { ...m, draft: e.target.value } : null))
                }
                placeholder="Briefing, roteiro, copy…"
              />
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setMaterialDetalhesModal(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={saveMaterialDetalhesModal}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
        if (isPage && chatLayoutWide && isChatOpen) return null;
        return (
          <AiChatDialog
            open={isChatOpen}
            onOpenChange={setIsChatOpen}
            project={project}
            client={client}
            plan={plan}
            onPlanUpdate={handlePlanUpdateFromAI}
            plannerModel={selectedAiModel}
            onPlannerModelChange={setSelectedAiModel}
            plannerModelOptions={availableAiModels}
          />
        );
      };

      if (isPage) {
        return (
          <>
            <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-4">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="mb-6 flex flex-row items-center justify-between rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900">
                    <h2 className="text-2xl font-semibold">Plano Estratégico da Campanha</h2>
                    <div className="flex items-center gap-4">
                        <Button onClick={handleExportPDF} variant="outline" disabled={isExporting}>
                            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                            Exportar PDF
                        </Button>
                        <Button onClick={() => savePlan(plan)} variant="secondary" disabled={isSaving || !plan?.id}>
                            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Salvar agora
                        </Button>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : saveErrorMessage ? (
                                <span className="text-red-600 dark:text-red-400">Erro ao salvar</span>
                            ) : isDirty ? (
                                <span className="text-amber-700 dark:text-amber-400">Alterações não salvas</span>
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
              </div>
              {isChatOpen && plan && chatLayoutWide && (
                <>
                  {/* Reserva largura: o aside é fixed e sai do fluxo */}
                  <div
                    className="hidden w-[min(420px,38vw)] max-w-[420px] shrink-0 lg:block"
                    aria-hidden
                  />
                  <aside className="hidden max-h-none w-[min(420px,38vw)] max-w-[420px] overflow-hidden rounded-xl border border-border bg-card shadow-md lg:fixed lg:bottom-6 lg:right-6 lg:top-20 lg:z-40 lg:flex lg:flex-col">
                    <AiChatDialog
                      variant="panel"
                      open={isChatOpen}
                      onOpenChange={setIsChatOpen}
                      project={project}
                      client={client}
                      plan={plan}
                      onPlanUpdate={handlePlanUpdateFromAI}
                      plannerModel={selectedAiModel}
                      onPlannerModelChange={setSelectedAiModel}
                      plannerModelOptions={availableAiModels}
                    />
                  </aside>
                </>
              )}
            </div>
            {renderAlerts()}
            {renderMaterialDetalhesDialog()}
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
                    <Button onClick={() => savePlan(plan)} variant="secondary" size="sm" disabled={isSaving || !plan?.id}>
                      {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Salvar
                    </Button>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : saveErrorMessage ? (
                            <span className="text-red-600 dark:text-red-400">Erro ao salvar</span>
                        ) : isDirty ? (
                            <span className="text-amber-700 dark:text-amber-400">Alterações não salvas</span>
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
            {renderMaterialDetalhesDialog()}
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