import React, { useState, useEffect, useCallback } from 'react';
    import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { Plus, Trash2, GripVertical, Edit, Settings2 } from 'lucide-react';
    import WorkflowRuleDialog from '@/components/tasks/WorkflowRuleDialog';
    import { Reorder } from 'framer-motion';

    const StatusItem = ({ status, onEdit, onDelete, onSetWorkflowRule }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [editingLabel, setEditingLabel] = useState(status.label);
        const [editingColor, setEditingColor] = useState(status.color);
        const { toast } = useToast();

        const handleUpdate = async () => {
            if (!editingLabel.trim()) {
                toast({ title: 'O nome do status não pode estar vazio', variant: 'destructive' });
                return;
            }

            const { error } = await supabase.from('task_statuses')
                .update({ label: editingLabel, color: editingColor })
                .eq('id', status.id);

            if (error) {
                toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: 'Status atualizado com sucesso!' });
                setIsEditing(false);
                onEdit(); // This will trigger a refetch in the parent component
            }
        };
        
        return (
            <Reorder.Item
                key={status.id}
                value={status}
                className="flex items-center gap-2 p-2 border rounded-md dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                whileDrag={{ boxShadow: "0px 4px 10px rgba(0,0,0,0.2)" }}
            >
                {isEditing ? (
                    <>
                        <div className="relative w-8 h-8 flex-shrink-0">
                           <Input 
                                type="color" 
                                value={editingColor} 
                                onChange={(e) => setEditingColor(e.target.value)}
                                className="w-full h-full p-0 border-none cursor-pointer"
                           />
                        </div>
                        <Input value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} className="h-8 dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                        <Button size="sm" onClick={handleUpdate}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="dark:text-white dark:hover:bg-gray-700">Cancelar</Button>
                    </>
                ) : (
                    <>
                        <GripVertical className="h-5 w-5 text-gray-400 cursor-grab" />
                        <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: status.color }} />
                        <span className="flex-grow dark:text-white">{status.label}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => onSetWorkflowRule(status)}><Settings2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => setIsEditing(true)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 dark:text-red-400 dark:hover:bg-gray-700" onClick={() => onDelete(status.id)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                )}
            </Reorder.Item>
        );
    };


    const StatusSettings = ({ isOpen, onClose }) => {
      const [statuses, setStatuses] = useState([]);
      const [newStatusLabel, setNewStatusLabel] = useState('');
      const [newStatusColor, setNewStatusColor] = useState('#CCCCCC');
      const [workflowRuleStatus, setWorkflowRuleStatus] = useState(null);
      const { toast } = useToast();

      const fetchStatuses = useCallback(async () => {
        const { data, error } = await supabase.from('task_statuses').select('*').order('sort_order');
        if (error) {
          toast({ title: 'Erro ao buscar status', description: error.message, variant: 'destructive' });
        } else {
          setStatuses(data);
        }
      }, [toast]);

      useEffect(() => {
        if (isOpen) {
          fetchStatuses();
        }
      }, [isOpen, fetchStatuses]);
      
      const handleReorder = async (newOrder) => {
        setStatuses(newOrder);

        const updates = newOrder.map((status, index) =>
            supabase
                .from('task_statuses')
                .update({ sort_order: index })
                .eq('id', status.id)
        );

        const updatesResult = await Promise.all(updates);
        
        const hasError = updatesResult.some(result => result.error);

        if (hasError) {
            toast({ title: 'Erro ao reordenar status', description: "Ocorreu um erro.", variant: 'destructive' });
            fetchStatuses(); // Revert to db state on error
        } else {
            toast({ title: 'Ordem dos status atualizada!' });
        }
      };


      const handleAddStatus = async () => {
        if (!newStatusLabel.trim()) {
          toast({ title: 'O nome do status não pode estar vazio', variant: 'destructive' });
          return;
        }
        const value = newStatusLabel.trim().toLowerCase().replace(/\s+/g, '_');
        const newOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order || 0)) + 1 : 0;

        const { data, error } = await supabase.from('task_statuses').insert({
          label: newStatusLabel,
          value,
          color: newStatusColor,
          sort_order: newOrder,
        }).select();

        if (error) {
          toast({ title: 'Erro ao adicionar status', description: 'Este nome de status já pode existir.', variant: 'destructive' });
        } else {
          setStatuses([...statuses, data[0]]);
          setNewStatusLabel('');
          setNewStatusColor('#CCCCCC');
          toast({ title: 'Status adicionado!' });
          fetchStatuses();
        }
      };

      const handleDeleteStatus = async (id) => {
        const { error } = await supabase.from('task_statuses').delete().eq('id', id);
        if (error) {
          toast({ title: 'Erro ao excluir status', description: error.message, variant: 'destructive' });
        } else {
          setStatuses(statuses.filter(s => s.id !== id));
          toast({ title: 'Status excluído!', variant: 'destructive' });
          fetchStatuses();
        }
      };

      return (
        <>
          <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="max-w-md mx-auto h-[90vh] dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col h-full">
                <DrawerHeader>
                  <DrawerTitle className="dark:text-white">Gerenciar Status das Tarefas</DrawerTitle>
                  <DrawerDescription className="dark:text-gray-400">Adicione, edite, remova e reordene os status e configure suas regras.</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 flex-grow overflow-y-auto">
                  <div className="space-y-4">
                    <div className="font-medium dark:text-white">Status Atuais</div>
                    <Reorder.Group axis="y" values={statuses} onReorder={handleReorder} className="space-y-2">
                      {statuses.map((status) => (
                         <StatusItem
                            key={status.id}
                            status={status}
                            onEdit={fetchStatuses}
                            onDelete={handleDeleteStatus}
                            onSetWorkflowRule={setWorkflowRuleStatus}
                          />
                      ))}
                    </Reorder.Group>
                    <div className="border-t dark:border-gray-700 pt-4 space-y-2">
                       <Label className="dark:text-white">Adicionar Novo Status</Label>
                       <div className="flex items-center gap-2">
                          <div className="relative w-10 h-10 flex-shrink-0">
                               <Input 
                                   type="color" 
                                   value={newStatusColor} 
                                   onChange={(e) => setNewStatusColor(e.target.value)}
                                   className="w-full h-full p-0 border-none cursor-pointer"
                               />
                          </div>
                          <Input placeholder="Nome do status" value={newStatusLabel} onChange={(e) => setNewStatusLabel(e.target.value)} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                          <Button onClick={handleAddStatus}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
                       </div>
                    </div>
                  </div>
                </div>
                <DrawerFooter className="border-t dark:border-gray-700">
                  <DrawerClose asChild><Button variant="outline" onClick={onClose} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600">Fechar</Button></DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
          {workflowRuleStatus && (
            <WorkflowRuleDialog
              status={workflowRuleStatus}
              isOpen={!!workflowRuleStatus}
              onClose={() => setWorkflowRuleStatus(null)}
            />
          )}
        </>
      );
    };

    export default StatusSettings;