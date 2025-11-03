import React, { useState, useEffect } from 'react';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { Label } from '@/components/ui/label';
    import { Textarea } from '@/components/ui/textarea';
    import { Input } from '@/components/ui/input';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useToast } from '@/components/ui/use-toast';
    import { Rocket, User } from 'lucide-react';
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

    const BoostTaskDialog = ({ open, onOpenChange, task, users, onCampaignCreated }) => {
      const [description, setDescription] = useState('');
      const [budget, setBudget] = useState('');
      const [assigneeId, setAssigneeId] = useState('');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const { user } = useAuth();
      const { toast } = useToast();

      useEffect(() => {
        if (task) {
          setDescription(`Anúncio baseado na tarefa: "${task.title}".\n\nObjetivo inicial: ${task.description || 'Não especificado.'}`);
        }
      }, [task]);

      const handleSubmit = async () => {
        if (!budget || !assigneeId) {
          toast({ title: "Campos obrigatórios", description: "Por favor, preencha o orçamento e o responsável.", variant: "destructive" });
          return;
        }
        setIsSubmitting(true);

        try {
            const { data: attachments, error: attachmentsError } = await supabase
                .from('task_attachments')
                .select('name, url')
                .eq('task_id', task.id);

            if (attachmentsError) {
                throw attachmentsError;
            }

            const adId = crypto.randomUUID();
            const adSetId = crypto.randomUUID();

            const newAd = {
                id: adId,
                task_id: task.id,
                name: task.title,
                description: task.description || '',
                attachments: attachments || [],
                budget: parseFloat(budget) || 0,
                budget_level: 'ad_set',
                budget_type: 'total',
                start_date: null,
                end_date: null
            };

            const newAdSet = {
                id: adSetId,
                name: "",
                ads: [newAd]
            };

            const campaignData = {
                owner_id: user.id,
                name: "",
                description: description,
                budget: parseFloat(budget) || 0,
                status: 'planning',
                client_id: task.client_id,
                assignee_id: assigneeId,
                ad_sets: [newAdSet]
            };
            
            const { data, error } = await supabase.from('paid_campaigns').insert(campaignData).select().single();
            
            if (error) throw error;
            
            toast({ title: "Anúncio Delegado!", description: "Uma nova estrutura foi enviada para a Gestão de Tráfego." });
            if (onCampaignCreated) onCampaignCreated(data);
            onOpenChange(false);
            setDescription('');
            setBudget('');
            setAssigneeId('');

        } catch (error) {
            toast({ title: "Erro ao criar anúncio", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
      };

      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 dark:text-white">
                <Rocket className="h-6 w-6 text-blue-500" />
                Delegar Criação de Anúncio
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                Crie um novo anúncio de tráfego pago baseado em "{task.title}". O gestor irá estruturar a campanha e o conjunto de anúncios posteriormente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="assignee_id" className="text-right flex items-center gap-1 dark:text-white">
                  <User className="w-4 h-4" /> Gestor
                </Label>
                <div className="col-span-3">
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione o gestor de tráfego" /></SelectTrigger>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right dark:text-white">
                  Briefing
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="col-span-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  placeholder="Observações para o gestor de tráfego."
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="budget" className="text-right dark:text-white">
                  Orçamento (R$)
                </Label>
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="col-span-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  placeholder="Ex: 500.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="dark:text-white dark:hover:bg-gray-700">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Delegando...' : 'Delegar Anúncio'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };

    export default BoostTaskDialog;