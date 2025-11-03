import React, { useState, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { Filter, Users, Mic, Sparkles, Loader2, AlertTriangle, Link, DollarSign, Target, FileText } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Textarea } from '@/components/ui/textarea';
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Input } from '@/components/ui/input';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

    const CAMPAIGN_OBJECTIVES = [
        { value: 'REACH', label: 'Alcance' },
        { value: 'TRAFFIC', label: 'Tráfego' },
        { value: 'ENGAGEMENT', label: 'Engajamento' },
        { value: 'LEADS', label: 'Geração de Cadastros' },
        { value: 'APP_PROMOTION', label: 'Promoção do App' },
        { value: 'SALES', label: 'Vendas' },
    ];

    const FunnelStageCard = ({ stage, title, icon, color, data, onChange, onGenerate, isGenerating, generatingField }) => (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full"
      >
        <Card className="h-full border-t-4" style={{ borderTopColor: color }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-3">
              {icon}
              <CardTitle className="text-xl font-bold">{title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
             <div className="space-y-2">
                <label className="text-sm font-medium">Objetivo da Campanha</label>
                <Select value={data.campaign_objective} onValueChange={(value) => onChange(stage, 'campaign_objective', value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione o objetivo..." />
                    </SelectTrigger>
                    <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <FunnelField stage={stage} label="Orçamento (R$)" fieldName="budget" value={data.budget} onChange={onChange} onGenerate={() => {}} type="number" />
            <FunnelField stage={stage} label="Público" fieldName="audience" value={data.audience} onChange={onChange} onGenerate={onGenerate} isGenerating={isGenerating && generatingField === `${stage}.audience`} />
            <FunnelField stage={stage} label="Tipos de Conteúdo" fieldName="content" value={data.content} onChange={onChange} onGenerate={onGenerate} isGenerating={isGenerating && generatingField === `${stage}.content`} />
            <FunnelField stage={stage} label="KPIs" fieldName="kpis" value={data.kpis} onChange={onChange} onGenerate={onGenerate} isGenerating={isGenerating && generatingField === `${stage}.kpis`} />
          </CardContent>
        </Card>
      </motion.div>
    );
    
    const FunnelField = ({ stage, label, fieldName, value, onChange, onGenerate, isGenerating, type = "textarea" }) => (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium">{label}</label>
          {onGenerate && (
            <Button variant="ghost" size="sm" onClick={() => onGenerate(`${stage}.${fieldName}`)} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-2">IA</span>
            </Button>
          )}
        </div>
        {type === 'textarea' ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(stage, fieldName, e.target.value)}
            placeholder={`Defina ${label.toLowerCase()}...`}
            className="h-24"
          />
        ) : (
           <Input
            type={type}
            value={value}
            onChange={(e) => onChange(stage, fieldName, e.target.value)}
            placeholder={`Defina ${label.toLowerCase()}...`}
          />
        )}
      </div>
    );

    const SalesFunnelBuilder = ({ project, client, campaignPlan, onPlanUpdate }) => {
      const [funnel, setFunnel] = useState({
        top: { campaign_objective: '', budget: '', audience: '', content: '', kpis: '' },
        middle: { campaign_objective: '', budget: '', audience: '', content: '', kpis: '' },
        bottom: { campaign_objective: '', budget: '', audience: '', content: '', kpis: '' },
      });
      const [loading, setLoading] = useState(false);
      const [isGenerating, setIsGenerating] = useState(false);
      const [generatingField, setGeneratingField] = useState(null);
      const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);
      const { toast } = useToast();
      const { getOpenAIKey } = useAuth();

      useEffect(() => {
        if (campaignPlan?.sales_funnel) {
          const loadedFunnel = campaignPlan.sales_funnel;
          // Ensure all fields exist to avoid uncontrolled component errors
          const defaultStage = { campaign_objective: '', budget: '', audience: '', content: '', kpis: '' };
          setFunnel({
            top: { ...defaultStage, ...loadedFunnel.top },
            middle: { ...defaultStage, ...loadedFunnel.middle },
            bottom: { ...defaultStage, ...loadedFunnel.bottom },
          });
        }
      }, [campaignPlan]);

      const handleFunnelChange = (stage, field, value) => {
        setFunnel(prev => ({
          ...prev,
          [stage]: { ...prev[stage], [field]: value },
        }));
      };

      const saveFunnel = useCallback(async () => {
        if (!campaignPlan?.id) {
          toast({ title: "Plano de campanha não encontrado", description: "Crie um plano de campanha primeiro.", variant: "destructive" });
          return;
        }
        setLoading(true);
        const { error } = await supabase
          .from('campaign_plans')
          .update({ sales_funnel: funnel })
          .eq('id', campaignPlan.id);

        if (error) {
          toast({ title: "Erro ao salvar funil", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Funil de vendas salvo com sucesso!" });
          if (onPlanUpdate) onPlanUpdate();
        }
        setLoading(false);
      }, [funnel, campaignPlan, toast, onPlanUpdate]);

      const generateWithAI = async (field) => {
        const apiKey = await getOpenAIKey();
        if (!apiKey) {
          setShowOpenAIAlert(true);
          return;
        }

        const [stage, fieldName] = field.split('.');
        
        setIsGenerating(true);
        setGeneratingField(field);

        const stageData = funnel[stage];
        const campaignObjectiveLabel = CAMPAIGN_OBJECTIVES.find(o => o.value === stageData.campaign_objective)?.label || 'não definido';

        const baseContext = `Aja como um especialista em marketing digital e Meta Ads. Para uma campanha chamada "${project.name}" para o cliente "${client.empresa}", cujo público-alvo geral é "${client.publico_alvo}" e o objetivo principal da campanha é "${campaignPlan?.objetivo}".`;
        const stageContext = `Para a etapa de ${stage === 'top' ? 'Topo' : stage === 'middle' ? 'Meio' : 'Fundo'} de Funil, o objetivo da campanha selecionado é "${campaignObjectiveLabel}".`;

        let prompt = '';
        switch (fieldName) {
          case 'audience':
            prompt = `${baseContext} ${stageContext} Sugira um público-alvo detalhado para esta etapa no Meta Ads. Se for Meio ou Fundo de Funil, considere públicos de remarketing (como visitantes do site ou engajamento no Instagram). Inclua interesses, comportamentos, dados demográficos e públicos personalizados/semelhantes. Responda apenas com a descrição do público.`;
            break;
          case 'content':
            prompt = `${baseContext} ${stageContext} Sugira 3 ideias de conteúdo/criativos para anúncios nesta etapa. A sugestão deve ser alinhada com o objetivo da campanha desta fase. Responda com uma lista curta.`;
            break;
          case 'kpis':
            prompt = `${baseContext} ${stageContext} Liste os 3 principais KPIs (Indicadores-chave de Performance) para monitorar nesta etapa. Os KPIs devem refletir o sucesso do objetivo da campanha selecionado. Responda com uma lista separada por vírgulas.`;
            break;
          default:
            break;
        }

        if (!prompt) {
          setIsGenerating(false);
          return;
        }

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 300 })
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
          
          const result = data.choices[0].message.content.trim();
          
          handleFunnelChange(stage, fieldName, result);
          toast({ title: `Campo ${fieldName} gerado com sucesso!` });

        } catch (error) {
          toast({ title: "Erro ao usar IA", description: error.message, variant: "destructive" });
        } finally {
          setIsGenerating(false);
          setGeneratingField(null);
        }
      };

      return (
        <div className="p-4 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Construtor de Funil de Vendas para Meta Ads</h2>
            <Button onClick={saveFunnel} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar Funil
            </Button>
          </div>

          <div className="relative flex flex-col items-center gap-0">
             <FunnelStageCard 
                stage="top"
                title="Topo de Funil (ToFu)" 
                icon={<Filter className="h-8 w-8" />} 
                color="#3b82f6"
                data={funnel.top}
                onChange={handleFunnelChange}
                onGenerate={generateWithAI}
                isGenerating={isGenerating}
                generatingField={generatingField}
            />
            <div className="h-12 w-1 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <Link className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
            <FunnelStageCard 
                stage="middle"
                title="Meio de Funil (MoFu)" 
                icon={<Users className="h-8 w-8" />} 
                color="#f59e0b"
                data={funnel.middle}
                onChange={handleFunnelChange}
                onGenerate={generateWithAI}
                isGenerating={isGenerating}
                generatingField={generatingField}
            />
            <div className="h-12 w-1 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <Link className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
             <FunnelStageCard 
                stage="bottom"
                title="Fundo de Funil (BoFu)" 
                icon={<Mic className="h-8 w-8" />} 
                color="#10b981"
                data={funnel.bottom}
                onChange={handleFunnelChange}
                onGenerate={generateWithAI}
                isGenerating={isGenerating}
                generatingField={generatingField}
            />
          </div>
          
          <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle><AlertTriangle className="inline mr-2 text-yellow-500" />Chave da OpenAI não encontrada</AlertDialogTitle>
                <AlertDialogDescription>Para usar o assistente de IA, por favor, adicione sua chave da API da OpenAI na página de Configurações.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default SalesFunnelBuilder;