import React, { useState } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Send, Building, User } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Label } from '@/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Textarea } from '@/components/ui/textarea';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

    const AdRequestForm = ({ clients = [], users = [], onClose, onSuccess }) => {
      const [clientId, setClientId] = useState('');
      const [assigneeId, setAssigneeId] = useState('');
      const [description, setDescription] = useState('');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const { toast } = useToast();
      const { user } = useAuth();

      const handleSubmit = async (e) => {
        e.preventDefault();
        if (!clientId || !description.trim() || !assigneeId) {
          toast({
            title: "Campos obrigatórios",
            description: "Por favor, selecione um cliente, um responsável e descreva a solicitação.",
            variant: "destructive",
          });
          return;
        }

        setIsSubmitting(true);
        
        const { data: statuses, error: statusError } = await supabase
          .from('paid_campaign_statuses')
          .select('value')
          .order('sort_order', { ascending: true })
          .limit(1)
          .single();

        if (statusError || !statuses) {
            toast({
                title: "Erro ao buscar status inicial",
                description: "Não foi possível definir um status para a nova campanha.",
                variant: "destructive",
            });
            setIsSubmitting(false);
            return;
        }

        const { error } = await supabase.from('paid_campaigns').insert({
          name: `Nova Solicitação: ${new Date().toLocaleDateString()}`,
          description: description,
          client_id: clientId,
          owner_id: user.id,
          assignee_id: assigneeId,
          status: statuses.value,
          ad_sets: [],
        });

        setIsSubmitting(false);
        if (error) {
          toast({
            title: "Erro ao criar solicitação",
            description: error.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Solicitação enviada!",
            description: "A nova campanha foi criada e está pronta para o gestor.",
          });
          onSuccess();
        }
      };

      return (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl"
            >
              <form onSubmit={handleSubmit} className="flex flex-col">
                <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Solicitar Anúncio</h2>
                  <Button type="button" variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                     <Label htmlFor="client_id" className="flex items-center gap-2 dark:text-gray-300"><Building className="w-4 h-4" /> Cliente</Label>
                     <Select value={clientId} onValueChange={setClientId}>
                       <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                         <SelectValue placeholder="Selecione o cliente" />
                       </SelectTrigger>
                       <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                         {clients.map(c => <SelectItem key={c.id} value={c.id} className="dark:text-white dark:hover:bg-gray-600">{c.empresa}</SelectItem>)}
                       </SelectContent>
                     </Select>
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="assignee_id" className="flex items-center gap-2 dark:text-gray-300"><User className="w-4 h-4" /> Responsável</Label>
                       <Select value={assigneeId} onValueChange={setAssigneeId}>
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
                  <div className="space-y-2">
                    <Label htmlFor="description" className="dark:text-gray-300">O que você precisa?</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Ex: Criar anúncio para a promoção de Dia das Mães, focado em..."
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      rows={5}
                    />
                  </div>
                </div>

                <div className="p-6 border-t dark:border-gray-700">
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-teal-500 text-white" disabled={isSubmitting}>
                    <Send className="mr-2 h-4 w-4" /> {isSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      );
    };

    export default AdRequestForm;