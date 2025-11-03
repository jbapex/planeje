import React, { useState, useEffect, useMemo, useCallback } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Save, Building, User, DollarSign, Layers, Plus, FileText, Package, Box, Calendar as CalendarIcon, Repeat, Coins, Link as LinkIcon, Paperclip, Info, Target, Trash2, DownloadCloud } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Calendar } from "@/components/ui/calendar";
    import { Textarea } from '@/components/ui/textarea';
    import { format } from "date-fns";
    import { cn } from "@/lib/utils";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const PaidCampaignForm = ({ campaign, clients = [], users = [], tasks = [], onSave, onClose, campaigns: allCampaigns, onDataChange }) => {
      const [formData, setFormData] = useState({});
      const [selectedCampaignId, setSelectedCampaignId] = useState('');
      const [selectedAdSetId, setSelectedAdSetId] = useState('');
      const [newCampaignName, setNewCampaignName] = useState('');
      const [newAdSetName, setNewAdSetName] = useState('');
      const [selectedAd, setSelectedAd] = useState(null);
      const [kpis, setKpis] = useState([]);
      const [isFetchingAttachments, setIsFetchingAttachments] = useState(false);
      const [isCreating, setIsCreating] = useState(false);
      const { toast } = useToast();
      const { user } = useAuth();

      const clientCampaigns = useMemo(() => {
        if (!formData.client_id) return [];
        return allCampaigns.filter(c => c.client_id === formData.client_id);
      }, [formData.client_id, allCampaigns]);

      const adSetsForSelectedCampaign = useMemo(() => {
        if (selectedCampaignId === 'new' || !selectedCampaignId) return [];
        const foundCampaign = clientCampaigns.find(c => c.id === selectedCampaignId);
        return foundCampaign?.ad_sets || [];
      }, [selectedCampaignId, clientCampaigns]);

      const getInitialAd = (campaign) => {
        if (campaign?.ad_sets?.length > 0 && campaign.ad_sets[0].ads?.length > 0) {
          return campaign.ad_sets[0].ads[0];
        }
        return null;
      };

      useEffect(() => {
        const initialAd = getInitialAd(campaign);
        setSelectedAd(initialAd);

        setFormData({
            client_id: campaign?.client_id || '',
            assignee_id: campaign?.assignee_id || '',
            task_id: initialAd?.task_id || '',
            ad_name: initialAd?.name || '',
            description: initialAd?.description || '',
            attachments: initialAd?.attachments || [],
            budget: campaign?.budget || '',
            budget_level: initialAd?.budget_level || 'campaign',
            budget_type: initialAd?.budget_type || 'total',
            start_date: initialAd?.start_date ? new Date(initialAd.start_date) : null,
            end_date: initialAd?.end_date ? new Date(initialAd.end_date) : null,
        });
        setKpis(campaign?.kpis || []);
        setSelectedCampaignId(campaign?.id || '');
        setSelectedAdSetId(campaign?.ad_sets?.[0]?.id || '');
      }, [campaign]);

      const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
      };
      
      const handleKpiChange = (index, field, value) => {
        const newKpis = [...kpis];
        newKpis[index][field] = value;
        setKpis(newKpis);
      };

      const addKpi = () => {
        setKpis([...kpis, { name: '', target: '', current: '' }]);
      };

      const removeKpi = (index) => {
        const newKpis = kpis.filter((_, i) => i !== index);
        setKpis(newKpis);
      };
      
      const fetchAttachments = useCallback(async () => {
        if (!formData.task_id) return;
        setIsFetchingAttachments(true);
        const { data, error } = await supabase
            .from('task_attachments')
            .select('name, url')
            .eq('task_id', formData.task_id);

        if (!error && data) {
            handleChange('attachments', data);
        }
        setIsFetchingAttachments(false);
      }, [formData.task_id]);


      useEffect(() => {
        const selectedTask = tasks.find(t => t.id === formData.task_id);
        if (selectedTask) {
            const currentAd = getInitialAd(campaign);
            const isNewAd = !currentAd;

            let description = isNewAd ? selectedTask.description : (currentAd.description || selectedTask.description);
            let attachments = isNewAd ? [] : (currentAd.attachments || []);

            if(isNewAd) {
                handleChange('ad_name', selectedTask.title);
            }

            setFormData(prev => ({
                ...prev,
                description,
                attachments
            }));
        }
      }, [formData.task_id, tasks, campaign]);

      const handleCreateCampaign = async () => {
        if (!newCampaignName.trim() || !formData.client_id) return;
        setIsCreating(true);
        const { data, error } = await supabase
          .from('paid_campaigns')
          .insert({
            name: newCampaignName,
            client_id: formData.client_id,
            owner_id: user.id,
            status: 'planning',
            ad_sets: [],
            kpis: []
          })
          .select()
          .single();
        
        if (error) {
          toast({ title: "Erro ao criar campanha", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Campanha criada com sucesso!" });
          setNewCampaignName('');
          await onDataChange();
          setSelectedCampaignId(data.id);
        }
        setIsCreating(false);
      };

      const handleCreateAdSet = async () => {
        if (!newAdSetName.trim() || !selectedCampaignId) return;
        setIsCreating(true);
        
        const targetCampaign = allCampaigns.find(c => c.id === selectedCampaignId);
        if (!targetCampaign) {
            toast({ title: "Campanha não encontrada", variant: "destructive" });
            setIsCreating(false);
            return;
        }

        const newAdSet = { id: crypto.randomUUID(), name: newAdSetName, ads: [] };
        const updatedAdSets = [...(targetCampaign.ad_sets || []), newAdSet];

        const { error } = await supabase
            .from('paid_campaigns')
            .update({ ad_sets: updatedAdSets })
            .eq('id', selectedCampaignId);

        if (error) {
            toast({ title: "Erro ao criar conjunto de anúncios", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Conjunto de anúncios criado com sucesso!" });
            setNewAdSetName('');
            await onDataChange();
            setSelectedAdSetId(newAdSet.id);
        }
        setIsCreating(false);
      };

      const handleSubmit = (e) => {
        e.preventDefault();
        const finalData = {
            ...formData,
            kpis,
            isNewCampaign: selectedCampaignId === 'new',
            newCampaignName: newCampaignName,
            selectedCampaignId: campaign?.id || selectedCampaignId,
            isNewAdSet: selectedAdSetId === 'new',
            newAdSetName: newAdSetName,
            selectedAdSetId: campaign?.id ? (campaign.ad_sets?.[0]?.id || selectedAdSetId) : selectedAdSetId,
        };
        onSave(finalData);
      };
      
      const isSaveDisabled = useMemo(() => {
        if (!formData.client_id) return true;
        if (campaign?.id) return false;
        if (!selectedCampaignId || selectedCampaignId === 'new') return true;
        if (!selectedAdSetId || selectedAdSetId === 'new') return true;
        return false;
      }, [formData, selectedCampaignId, selectedAdSetId, campaign]);


      return (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex justify-end">
            <motion.div initial={{ x: '100%' }} animate={{ x: '0%' }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="w-full max-w-3xl bg-gray-50 dark:bg-gray-800 h-full shadow-2xl">
              <form onSubmit={handleSubmit} className="h-full flex flex-col">
                <div className="flex justify-between items-center p-6 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{campaign?.id ? 'Detalhes do Anúncio' : 'Novo Anúncio'}</h2>
                  <Button type="button" variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
                </div>
                
                <div className="flex-grow p-6 overflow-y-auto space-y-6">
                  <div className="space-y-4 p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800/50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-white"><Layers className="w-5 h-5 text-blue-500"/> Etapa 1: Estrutura</h3>
                    <div className="space-y-2">
                       <Label htmlFor="client_id" className="flex items-center gap-2 dark:text-gray-300"><Building className="w-4 h-4" /> Cliente</Label>
                       <Select value={formData.client_id} onValueChange={v => handleChange('client_id', v)}>
                         <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                         <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{clients.map(c => <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">{c.empresa}</SelectItem>)}</SelectContent>
                       </Select>
                    </div>

                    {formData.client_id && (
                        <>
                        <div className="space-y-2">
                           <Label className="flex items-center gap-2 dark:text-gray-300"><Package className="w-4 h-4" /> Campanha</Label>
                            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione ou crie uma campanha" /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="new" className="text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4 mr-2 inline-block"/>Criar Nova Campanha</SelectItem>
                                    {clientCampaigns.map(c => <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                           {selectedCampaignId === 'new' && (
                               <div className="flex items-center gap-2 mt-2">
                                   <Input value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} placeholder="Nome da nova campanha" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"/>
                                   <Button type="button" onClick={handleCreateCampaign} disabled={!newCampaignName.trim() || isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                                       {isCreating ? 'Criando...' : 'Criar'}
                                   </Button>
                               </div>
                           )}
                        </div>

                         <div className="space-y-2">
                           <Label className="flex items-center gap-2 dark:text-gray-300"><Box className="w-4 h-4" /> Conjunto de Anúncios</Label>
                            <Select value={selectedAdSetId} onValueChange={setSelectedAdSetId} disabled={!selectedCampaignId || selectedCampaignId === 'new'}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione ou crie um conjunto" /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="new" className="text-blue-600 dark:text-blue-400"><Plus className="w-4 h-4 mr-2 inline-block"/>Criar Novo Conjunto</SelectItem>
                                    {adSetsForSelectedCampaign.map(as => <SelectItem key={as.id} value={as.id} className="dark:text-white dark:hover:bg-gray-600">{as.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                           {selectedAdSetId === 'new' && (
                               <div className="flex items-center gap-2 mt-2">
                                   <Input value={newAdSetName} onChange={e => setNewAdSetName(e.target.value)} placeholder="Nome do novo conjunto" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"/>
                                   <Button type="button" onClick={handleCreateAdSet} disabled={!newAdSetName.trim() || isCreating} className="bg-blue-600 hover:bg-blue-700 text-white">
                                       {isCreating ? 'Criando...' : 'Criar'}
                                   </Button>
                               </div>
                           )}
                        </div>
                        </>
                    )}
                  </div>

                  <div className="space-y-6 p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800/50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-white"><FileText className="w-5 h-5 text-blue-500"/> Etapa 2: Detalhes do Anúncio</h3>
                    <div className="space-y-2">
                        <Label htmlFor="task_id" className="dark:text-gray-300">Tarefa Vinculada</Label>
                        <Select value={formData.task_id} onValueChange={v => handleChange('task_id', v)}>
                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-70"><SelectValue placeholder="Selecione a tarefa para este anúncio" /></SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{tasks.map(t => <SelectItem key={t.id} value={t.id} className="dark:text-white dark:hover:bg-gray-600">{t.title}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="ad_name" className="dark:text-gray-300">Nome do Anúncio</Label>
                        <Input id="ad_name" value={formData.ad_name} onChange={e => handleChange('ad_name', e.target.value)} placeholder="Nome personalizado do anúncio" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                    </div>

                    {formData.description && (
                         <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Info className="w-4 h-4" /> Briefing da Tarefa</Label>
                            <Textarea value={formData.description} readOnly className="dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600" rows={3}/>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Paperclip className="w-4 h-4" /> Anexos da Tarefa</Label>
                            {formData.task_id && (
                                <Button type="button" variant="link" size="sm" onClick={fetchAttachments} disabled={isFetchingAttachments}>
                                    <DownloadCloud className="w-4 h-4 mr-2"/>
                                    {isFetchingAttachments ? 'Buscando...' : 'Puxar Anexos'}
                                </Button>
                            )}
                        </div>
                        {formData.attachments && formData.attachments.length > 0 && (
                            <div className="space-y-1 rounded-md border p-2 dark:border-gray-600">
                            {formData.attachments.map((att, index) => (
                                <a key={index} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                    <LinkIcon size={14} /> {att.name}
                                </a>
                            ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="budget" className="flex items-center gap-2 dark:text-gray-300"><DollarSign className="w-4 h-4" /> Orçamento</Label>
                          <Input id="budget" type="number" value={formData.budget} onChange={e => handleChange('budget', e.target.value)} placeholder="500.00" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="assignee_id" className="flex items-center gap-2 dark:text-gray-300"><User className="w-4 h-4" /> Responsável</Label>
                           <Select value={formData.assignee_id} onValueChange={v => handleChange('assignee_id', v)}>
                             <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                             <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                               {users.map(u => (
                                 <SelectItem key={u.id} value={u.id} className="dark:text-white dark:hover:bg-gray-600">
                                   <div className="flex items-center gap-2">
                                     <Avatar className="h-6 w-6"><AvatarImage src={u.avatar_url} /><AvatarFallback className="dark:bg-gray-600">{u.full_name ? u.full_name.charAt(0) : '?'}</AvatarFallback></Avatar>
                                     <span>{u.full_name}</span>
                                   </div>
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Coins className="w-4 h-4" /> Nível do Orçamento</Label>
                            <Select value={formData.budget_level} onValueChange={v => handleChange('budget_level', v)}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="campaign" className="dark:text-white dark:hover:bg-gray-600">Campanha</SelectItem>
                                    <SelectItem value="ad_set" className="dark:text-white dark:hover:bg-gray-600">Conjunto de Anúncios</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><Repeat className="w-4 h-4" /> Tipo de Orçamento</Label>
                            <Select value={formData.budget_type} onValueChange={v => handleChange('budget_type', v)}>
                                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue /></SelectTrigger>
                                <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                    <SelectItem value="total" className="dark:text-white dark:hover:bg-gray-600">Total</SelectItem>
                                    <SelectItem value="daily" className="dark:text-white dark:hover:bg-gray-600">Diário</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><CalendarIcon className="w-4 h-4" /> Data de Início</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600", !formData.start_date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formData.start_date ? format(new Date(formData.start_date), "PPP") : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 dark:bg-gray-700">
                                    <Calendar mode="single" selected={formData.start_date ? new Date(formData.start_date) : null} onSelect={(date) => handleChange('start_date', date)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 dark:text-gray-300"><CalendarIcon className="w-4 h-4" /> Data de Término (Opcional)</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600", !formData.end_date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formData.end_date ? format(new Date(formData.end_date), "PPP") : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 dark:bg-gray-700">
                                    <Calendar mode="single" selected={formData.end_date ? new Date(formData.end_date) : null} onSelect={(date) => handleChange('end_date', date)} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                      <Label className="flex items-center gap-2 text-base font-semibold dark:text-white"><Target className="w-5 h-5 text-blue-500" /> KPIs da Campanha</Label>
                      {kpis.map((kpi, index) => (
                        <div key={index} className="flex items-end gap-2">
                          <div className="flex-1">
                            <Label className="text-xs dark:text-gray-400">Nome do KPI</Label>
                            <Input value={kpi.name} onChange={(e) => handleKpiChange(index, 'name', e.target.value)} placeholder="Ex: Cliques no Link" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <div className="w-28">
                            <Label className="text-xs dark:text-gray-400">Meta</Label>
                            <Input type="number" value={kpi.target} onChange={(e) => handleKpiChange(index, 'target', e.target.value)} placeholder="1000" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <div className="w-28">
                            <Label className="text-xs dark:text-gray-400">Atual</Label>
                            <Input type="number" value={kpi.current} onChange={(e) => handleKpiChange(index, 'current', e.target.value)} placeholder="0" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeKpi(index)} className="text-red-500 dark:hover:bg-gray-700"><Trash2 className="w-4 h-4"/></Button>
                        </div>
                      ))}
                       <Button type="button" variant="outline" onClick={addKpi} className="w-full dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><Plus className="w-4 h-4 mr-2" /> Adicionar KPI</Button>
                    </div>

                  </div>
                </div>

                <div className="p-6 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-teal-500 text-white" disabled={isSaveDisabled}>
                    <Save className="mr-2 h-4 w-4" /> {campaign?.id ? 'Salvar Alterações' : 'Criar Anúncio'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      );
    };

    export default PaidCampaignForm;