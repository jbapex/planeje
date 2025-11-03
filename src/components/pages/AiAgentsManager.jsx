import React, { useState, useEffect, useCallback } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Label } from '@/components/ui/label';
    import { Switch } from '@/components/ui/switch';
    import { PlusCircle, Edit, Trash2, Bot, Sparkles, Lightbulb, Clapperboard, Loader2 } from 'lucide-react';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    
    const ICONS = {
      Bot: <Bot className="h-5 w-5" />,
      Sparkles: <Sparkles className="h-5 w-5 text-yellow-500" />,
      Lightbulb: <Lightbulb className="h-5 w-5 text-blue-500" />,
      Clapperboard: <Clapperboard className="h-5 w-5 text-red-500" />,
    };
    const ICON_OPTIONS = Object.keys(ICONS);
    
    const AiAgentsManager = () => {
      const { toast } = useToast();
      const [agents, setAgents] = useState([]);
      const [loading, setLoading] = useState(true);
      const [isModalOpen, setIsModalOpen] = useState(false);
      const [currentAgent, setCurrentAgent] = useState(null);
      const [isProcessing, setIsProcessing] = useState(false);
    
      const fetchAgents = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('ai_agents').select('*').order('created_at', { ascending: true });
        if (error) {
          toast({ title: 'Erro ao buscar agentes', description: error.message, variant: 'destructive' });
        } else {
          setAgents(data);
        }
        setLoading(false);
      }, [toast]);
    
      useEffect(() => {
        fetchAgents();
      }, [fetchAgents]);
    
      const handleOpenModal = (agent = null) => {
        setCurrentAgent(agent ? { ...agent } : { name: '', description: '', prompt: '', icon: 'Bot', is_active: true });
        setIsModalOpen(true);
      };
    
      const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentAgent(null);
      };
    
      const handleSave = async () => {
        if (!currentAgent || !currentAgent.name || !currentAgent.prompt) {
          toast({ title: 'Campos obrigatórios', description: 'Nome e Prompt são necessários.', variant: 'destructive' });
          return;
        }
        setIsProcessing(true);
        
        const { id, ...agentData } = currentAgent;
        
        const query = id
          ? supabase.from('ai_agents').update(agentData).eq('id', id)
          : supabase.from('ai_agents').insert(agentData);
    
        const { error } = await query;
        
        if (error) {
          toast({ title: 'Erro ao salvar agente', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: `Agente ${id ? 'atualizado' : 'criado'} com sucesso!` });
          fetchAgents();
          handleCloseModal();
        }
        setIsProcessing(false);
      };
      
      const handleDelete = async (agentId) => {
          const { error } = await supabase.from('ai_agents').delete().eq('id', agentId);
          if (error) {
              toast({ title: 'Erro ao excluir agente', description: error.message, variant: 'destructive' });
          } else {
              toast({ title: 'Agente excluído com sucesso!' });
              fetchAgents();
          }
      };
    
      const handleInputChange = (field, value) => {
        setCurrentAgent(prev => ({ ...prev, [field]: value }));
      };
    
      return (
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Gerenciador de Agentes de IA</h1>
              <p className="text-gray-500">Crie e configure os agentes para o assistente ApexIA.</p>
            </div>
            <Button onClick={() => handleOpenModal()}>
              <PlusCircle className="mr-2 h-4 w-4" /> Novo Agente
            </Button>
          </div>
    
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {agents.map(agent => (
                  <motion.div key={agent.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                    <Card className="flex flex-col h-full dark:bg-gray-800">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                             {ICONS[agent.icon] || ICONS.Bot}
                            <CardTitle className="dark:text-white">{agent.name}</CardTitle>
                          </div>
                          <Switch checked={agent.is_active} disabled/>
                        </div>
                        <CardDescription className="dark:text-gray-400 pt-2">{agent.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-grow">
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3"><span className="font-semibold">Prompt:</span> {agent.prompt}</p>
                      </CardContent>
                      <div className="p-4 pt-0 flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenModal(agent)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(agent.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
    
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogContent className="sm:max-w-[600px] dark:bg-gray-800">
              <DialogHeader>
                <DialogTitle className="dark:text-white">{currentAgent?.id ? 'Editar' : 'Criar'} Agente de IA</DialogTitle>
                <DialogDescription className="dark:text-gray-400">Configure o nome, comportamento e aparência do agente.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right dark:text-white">Nome</Label>
                  <Input id="name" value={currentAgent?.name || ''} onChange={e => handleInputChange('name', e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right dark:text-white">Descrição</Label>
                  <Textarea id="description" value={currentAgent?.description || ''} onChange={e => handleInputChange('description', e.target.value)} className="col-span-3" placeholder="Uma breve descrição da função do agente."/>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="prompt" className="text-right pt-2 dark:text-white">Prompt</Label>
                  <Textarea id="prompt" value={currentAgent?.prompt || ''} onChange={e => handleInputChange('prompt', e.target.value)} className="col-span-3 min-h-[150px]" placeholder="Descreva o comportamento e as instruções do agente. Use {client_name}, {contact_name}, etc para personalização."/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="icon" className="text-right dark:text-white">Ícone</Label>
                  <Select value={currentAgent?.icon || 'Bot'} onValueChange={value => handleInputChange('icon', value)}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Selecione um ícone" />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map(icon => (
                        <SelectItem key={icon} value={icon}>
                          <div className="flex items-center gap-2">
                            {ICONS[icon]} {icon}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="is_active" className="text-right dark:text-white">Ativo</Label>
                  <Switch id="is_active" checked={currentAgent?.is_active} onCheckedChange={value => handleInputChange('is_active', value)} className="col-span-3 justify-self-start" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={handleCloseModal} disabled={isProcessing}>Cancelar</Button>
                <Button onClick={handleSave} disabled={isProcessing}>
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    };
    
    export default AiAgentsManager;