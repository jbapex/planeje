import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { ListChecks, Building, Plus, Trash2, Eye, EyeOff, Calendar as CalendarIcon, User, Columns, GanttChartSquare, FileText } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { motion, AnimatePresence } from 'framer-motion';
    import { format } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Calendar } from "@/components/ui/calendar";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { cn } from "@/lib/utils";
    import { MultiSelect } from '@/components/ui/multi-select';
    import ClientDocumentEditor from '@/components/clients/ClientDocumentEditor';
    import OnboardingTaskItemInline from '@/components/onboarding/OnboardingTaskItemInline';

    const ItemDetailDialog = ({ item, open, onOpenChange, onUpdate, profiles }) => {
        const [details, setDetails] = useState(item);
    
        useEffect(() => {
            setDetails(item);
        }, [item]);
    
        const handleSave = () => {
            onUpdate(details);
            onOpenChange(false);
        };
    
        if (!item || !details) return null;
    
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Tarefa</DialogTitle>
                        <DialogDescription>{details.title}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="description" className="text-right">Descrição</label>
                            <Textarea
                                id="description"
                                value={details.description || ''}
                                onChange={(e) => setDetails(prev => ({ ...prev, description: e.target.value }))}
                                className="col-span-3"
                                placeholder="Adicione mais detalhes sobre a tarefa..."
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label htmlFor="due_date" className="text-right">Prazo</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal col-span-3",
                                            !details.due_date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {details.due_date ? format(new Date(details.due_date), "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={details.due_date ? new Date(details.due_date) : null}
                                        onSelect={(date) => setDetails(prev => ({ ...prev, due_date: date?.toISOString() }))}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                             <label htmlFor="assignee" className="text-right">Responsável</label>
                             <Select
                                value={details.assignee_id || ''}
                                onValueChange={(value) => setDetails(prev => ({...prev, assignee_id: value }))}
                             >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Selecione um responsável" />
                                </SelectTrigger>
                                <SelectContent>
                                    {profiles.map(profile => (
                                        <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                             </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSave}>Salvar Alterações</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };


    const ChecklistItem = ({ item, onToggle, isEditing, onContentChange, onDelete, onOpenDetails, profiles }) => {
        const assignee = useMemo(() => profiles.find(p => p.id === item.assignee_id), [profiles, item.assignee_id]);

        return (
            <motion.div
                className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 group"
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
            >
                <Checkbox
                    id={`item-${item.id}`}
                    checked={item.is_completed}
                    onCheckedChange={() => onToggle(item.id, !item.is_completed)}
                />
                <div className="flex-grow cursor-pointer" onClick={onOpenDetails}>
                    <input
                        type="text"
                        value={item.title}
                        onChange={onContentChange}
                        readOnly={!isEditing}
                        className={`w-full bg-transparent focus:outline-none text-sm pointer-events-none ${item.is_completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}
                    />
                    <div className="flex items-center gap-2 mt-0.5">
                        {item.is_completed && item.completed_at && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Concluído em: {format(new Date(item.completed_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        )}
                        {item.due_date && !item.is_completed && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <CalendarIcon className="h-3 w-3" />
                                <span>{format(new Date(item.due_date), "dd/MM/yy", { locale: ptBR })}</span>
                            </div>
                        )}
                         {assignee && (
                            <Avatar className="h-4 w-4">
                                <AvatarImage src={assignee.avatar_url} alt={assignee.full_name} />
                                <AvatarFallback className="text-[8px]"><User size={8}/></AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                </div>
                {isEditing && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. Isso irá excluir permanentemente o item do checklist.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </motion.div>
        );
    };

    const ClientChecklist = ({ client, checklists, onUpdate, onCreate, onDeleteChecklist, userRole, profiles, onOpenItemDetails, onOpenDocument }) => {
      const { toast } = useToast();
      const [newChecklistTitle, setNewChecklistTitle] = useState('');
      const [newItemTitles, setNewItemTitles] = useState({});
      const [editingListId, setEditingListId] = useState(null);
      const [showCompleted, setShowCompleted] = useState({});
      
      const clientChecklists = checklists.filter(c => c.client_id === client.id);

      const handleToggleItem = async (checklistId, itemId, isCompleted) => {
        const checklist = clientChecklists.find(c => c.id === checklistId);
        if (!checklist) return;

        const updatedItems = checklist.items.map(i => 
            i.id === itemId 
            ? { ...i, is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null } 
            : i
        );
        onUpdate(checklistId, { items: updatedItems });
      };

      const handleAddItem = async (checklistId) => {
        const title = newItemTitles[checklistId]?.trim();
        if (!title) return;
        
        const checklist = clientChecklists.find(c => c.id === checklistId);
        if (!checklist) return;

        const newItem = { 
          id: crypto.randomUUID(), 
          title, 
          is_completed: false, 
          completed_at: null, 
          description: '', 
          due_date: null, 
          assignee_id: null,
          note: null,
          subtasks: []
        };
        const updatedItems = [...checklist.items, newItem];
        
        onUpdate(checklistId, { items: updatedItems });
        setNewItemTitles(prev => ({ ...prev, [checklistId]: '' }));
      };
      
      const handleCreateChecklist = async () => {
        if (!newChecklistTitle.trim()) return;
        onCreate(client.id, newChecklistTitle);
        setNewChecklistTitle('');
      };

      const handleUpdateItemContent = (checklistId, itemId, newContent) => {
        const checklist = clientChecklists.find(c => c.id === checklistId);
        if (!checklist) return;

        const updatedItems = checklist.items.map(i => i.id === itemId ? { ...i, title: newContent } : i);
        onUpdate(checklistId, { items: updatedItems });
      };
      
      const handleDeleteItem = (checklistId, itemId) => {
        const checklist = clientChecklists.find(c => c.id === checklistId);
        if (!checklist) return;
        
        const updatedItems = checklist.items.filter(i => i.id !== itemId);
        onUpdate(checklistId, { items: updatedItems });
      };
      
      const handleUpdateChecklistTitle = (checklistId, newTitle) => {
        onUpdate(checklistId, { title: newTitle });
      };
      
      const startEditing = (listId) => {
        if (userRole === 'superadmin' || userRole === 'admin') {
          setEditingListId(listId);
        } else {
          toast({ title: 'Apenas administradores podem editar a estrutura dos checklists.', variant: 'destructive' });
        }
      };

      const stopEditing = () => {
        setEditingListId(null);
        toast({ title: 'Alterações salvas!' });
      };

      const toggleShowCompleted = (checklistId) => {
          setShowCompleted(prev => ({...prev, [checklistId]: !prev[checklistId]}));
      }

      const primaryLogo = client.logo_urls && client.logo_urls.length > 0 ? client.logo_urls[0] : null;

      return (
        <div className="w-80 h-full flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <Avatar className="h-9 w-9">
                <AvatarImage src={primaryLogo} alt={client.empresa} />
                <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <Building size={18} />
                </AvatarFallback>
              </Avatar>
              <h3 className="font-bold text-lg text-gray-800 dark:text-white truncate">{client.empresa}</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenDocument(client)} className="flex-shrink-0">
              <FileText className="h-5 w-5 text-gray-500 hover:text-blue-500" />
            </Button>
          </div>
          
          <div className="flex-grow space-y-4 overflow-y-auto pr-2">
            {clientChecklists.length === 0 && (userRole === 'superadmin' || userRole === 'admin') && (
                 <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">Nenhum checklist de onboarding para este cliente.</p>
                 </div>
            )}
            {clientChecklists.map(checklist => {
              const isEditing = editingListId === checklist.id;
              const isShowingCompleted = showCompleted[checklist.id];
              const completedItems = checklist.items.filter(i => i.is_completed);
              const pendingItems = checklist.items.filter(i => !i.is_completed);
              const progress = checklist.items.length > 0 ? (completedItems.length / checklist.items.length) * 100 : 0;
              
              return (
                <div key={checklist.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm group/checklist">
                  <div className="flex items-center justify-between mb-2">
                    {isEditing ? (
                        <Input 
                            value={checklist.title}
                            onChange={(e) => handleUpdateChecklistTitle(checklist.id, e.target.value)}
                            className="h-8 font-semibold text-md"
                        />
                    ) : (
                        <h4 className="font-semibold text-gray-700 dark:text-gray-200">{checklist.title}</h4>
                    )}
                    <div className="flex items-center">
                      <Button variant={isEditing ? 'default' : 'ghost'} size="sm" className="h-7" onClick={() => isEditing ? stopEditing() : startEditing(checklist.id)}>
                        {isEditing ? 'Salvar' : 'Editar'}
                      </Button>
                      {isEditing && (
                           <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 opacity-0 group-hover/checklist:opacity-100">
                                  <Trash2 size={16} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir esta lista?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        A lista "{checklist.title}" e todos os seus itens serão excluídos permanentemente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteChecklist(checklist.id)}>Excluir Lista</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                           </AlertDialog>
                      )}
                    </div>
                  </div>
                  <div className="relative h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full mb-3">
                      <motion.div 
                        className="absolute top-0 left-0 h-1 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                  </div>
                  <div className="space-y-1">
                      <AnimatePresence>
                        {pendingItems.map(item => {
                          // Garantir que item tenha subtasks
                          const itemWithSubtasks = {
                            ...item,
                            subtasks: item.subtasks || []
                          };
                          
                          return (
                            <OnboardingTaskItemInline
                              key={item.id}
                              item={itemWithSubtasks}
                              checklistId={checklist.id}
                              onUpdate={(updatedItem) => {
                                const updatedItems = checklist.items.map(i => 
                                  i.id === item.id ? updatedItem : i
                                );
                                onUpdate(checklist.id, { items: updatedItems });
                              }}
                              onDelete={() => handleDeleteItem(checklist.id, item.id)}
                              onAddSubtask={(newSubtask) => {
                                const updatedItems = checklist.items.map(i => 
                                  i.id === item.id 
                                    ? { ...i, subtasks: [...(i.subtasks || []), newSubtask] }
                                    : i
                                );
                                onUpdate(checklist.id, { items: updatedItems });
                              }}
                              profiles={profiles}
                            />
                          );
                        })}
                      </AnimatePresence>
                  </div>
                  
                  {completedItems.length > 0 && (
                      <div className="mt-3">
                          <Button variant="link" size="sm" className="p-0 h-auto text-xs text-gray-500" onClick={() => toggleShowCompleted(checklist.id)}>
                              {isShowingCompleted ? <EyeOff className="h-3 w-3 mr-1"/> : <Eye className="h-3 w-3 mr-1"/>}
                              {isShowingCompleted ? 'Ocultar' : 'Mostrar'} {completedItems.length} {completedItems.length > 1 ? 'concluídos' : 'concluído'}
                          </Button>
                          <AnimatePresence>
                              {isShowingCompleted && (
                                  <motion.div
                                      className="space-y-1 mt-2 border-t dark:border-gray-700 pt-2"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                  >
                                      {completedItems.sort((a,b) => new Date(b.completed_at) - new Date(a.completed_at)).map(item => {
                                        const itemWithSubtasks = {
                                          ...item,
                                          subtasks: item.subtasks || []
                                        };
                                        
                                        return (
                                          <OnboardingTaskItemInline
                                            key={item.id}
                                            item={itemWithSubtasks}
                                            checklistId={checklist.id}
                                            onUpdate={(updatedItem) => {
                                              const updatedItems = checklist.items.map(i => 
                                                i.id === item.id ? updatedItem : i
                                              );
                                              onUpdate(checklist.id, { items: updatedItems });
                                            }}
                                            onDelete={() => handleDeleteItem(checklist.id, item.id)}
                                            onAddSubtask={(newSubtask) => {
                                              const updatedItems = checklist.items.map(i => 
                                                i.id === item.id 
                                                  ? { ...i, subtasks: [...(i.subtasks || []), newSubtask] }
                                                  : i
                                              );
                                              onUpdate(checklist.id, { items: updatedItems });
                                            }}
                                            profiles={profiles}
                                          />
                                        );
                                      })}
                                  </motion.div>
                              )}
                          </AnimatePresence>
                      </div>
                  )}

                  {isEditing && (
                    <div className="flex items-center gap-2 mt-3">
                      <Input
                        placeholder="Novo item..."
                        value={newItemTitles[checklist.id] || ''}
                        onChange={(e) => setNewItemTitles(prev => ({ ...prev, [checklist.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddItem(checklist.id)}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" className="h-8" onClick={() => handleAddItem(checklist.id)}>Adicionar</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {(userRole === 'superadmin' || userRole === 'admin') && (
            <div className="flex items-center gap-2 pt-4 mt-auto border-t border-gray-200 dark:border-gray-700/50 flex-shrink-0">
              <Input 
                placeholder="Nova lista..."
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateChecklist()}
                className="h-9"
              />
              <Button onClick={handleCreateChecklist}><Plus className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      );
    };
    
    const ColumnsView = ({ clients, ...props }) => {
        const sliderRef = useRef(null);
        const [isDown, setIsDown] = useState(false);
        const [startX, setStartX] = useState(0);
        const [scrollLeft, setScrollLeft] = useState(0);
        
        useEffect(() => {
            const slider = sliderRef.current;
            if (!slider) return;

            const handleMouseDown = (e) => {
              if (e.target.closest('button, input, textarea, a, [role="button"], [role="option"]')) {
                return;
              }
              setIsDown(true);
              slider.classList.add('active');
              setStartX(e.pageX - slider.offsetLeft);
              setScrollLeft(slider.scrollLeft);
            };

            const handleMouseLeave = () => {
              setIsDown(false);
              slider.classList.remove('active');
            };

            const handleMouseUp = () => {
              setIsDown(false);
              slider.classList.remove('active');
            };

            const handleMouseMove = (e) => {
              if (!isDown) return;
              e.preventDefault(); // Prevent text selection
              const x = e.pageX - slider.offsetLeft;
              const walk = (x - startX) * 2; // O multiplicador aumenta a velocidade do arraste
              slider.scrollLeft = scrollLeft - walk;
            };

            slider.addEventListener('mousedown', handleMouseDown);
            slider.addEventListener('mouseleave', handleMouseLeave);
            slider.addEventListener('mouseup', handleMouseUp);
            slider.addEventListener('mousemove', handleMouseMove);

            return () => {
                slider.removeEventListener('mousedown', handleMouseDown);
                slider.removeEventListener('mouseleave', handleMouseLeave);
                slider.removeEventListener('mouseup', handleMouseUp);
                slider.removeEventListener('mousemove', handleMouseMove);
            };
        }, [isDown, startX, scrollLeft]);

        return (
            <div
                ref={sliderRef}
                className="flex-grow flex gap-6 overflow-x-auto pb-4 h-full cursor-grab active:cursor-grabbing select-none" // Add select-none class
            >
                {clients.map(client => (
                  <ClientChecklist 
                    key={client.id} 
                    client={client}
                    {...props}
                  />
                ))}
                {clients.length === 0 && (
                    <div className="flex-grow flex items-center justify-center">
                        <div className="text-center text-gray-500">
                            <Building className="mx-auto h-12 w-12"/>
                            <p className="mt-2">Nenhum cliente encontrado.</p>
                            <p className="text-sm">Verifique seus filtros ou adicione clientes na página de Clientes.</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };
    
    const TimelineView = ({ checklists, profiles, clients, onOpenItemDetails }) => {
        const items = useMemo(() => {
            return checklists.flatMap(list => 
                (list.items || []).map(item => ({
                    ...item,
                    checklistTitle: list.title,
                    client: clients.find(c => c.id === list.client_id)
                }))
            ).filter(item => item.due_date);
        }, [checklists, clients]);
    
        const groupedItems = useMemo(() => {
            const groups = {};
            items.forEach(item => {
                const date = format(new Date(item.due_date), 'yyyy-MM-dd');
                if (!groups[date]) {
                    groups[date] = [];
                }
                groups[date].push(item);
            });
            return Object.entries(groups).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
        }, [items]);
        
        if (items.length === 0) {
            return (
                <div className="flex-grow flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <CalendarIcon className="mx-auto h-12 w-12"/>
                        <p className="mt-2">Nenhuma tarefa com prazo definido.</p>
                        <p className="text-sm">Adicione prazos às tarefas para vê-las aqui.</p>
                    </div>
                </div>
            )
        }
    
        return (
            <div className="flex-grow overflow-y-auto pr-4 space-y-6">
                {groupedItems.map(([date, dateItems]) => (
                    <div key={date}>
                        <h3 className="font-semibold text-lg mb-2 sticky top-0 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm py-2 px-1">
                            {format(new Date(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </h3>
                        <div className="space-y-3 ml-2 border-l-2 border-gray-200 dark:border-gray-700 pl-6">
                           {dateItems.map(item => {
                               const assignee = profiles.find(p => p.id === item.assignee_id);
                               return (
                                   <div key={item.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => onOpenItemDetails(item.checklist_id, item)}>
                                       <div className="flex justify-between items-start">
                                            <div>
                                                <p className={`font-medium ${item.is_completed ? 'line-through text-gray-500' : ''}`}>{item.title}</p>
                                                <p className="text-sm text-gray-500">{item.client?.empresa} &bull; {item.checklistTitle}</p>
                                            </div>
                                            {assignee && (
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={assignee.avatar_url} alt={assignee.full_name} />
                                                    <AvatarFallback><User size={16}/></AvatarFallback>
                                                </Avatar>
                                            )}
                                       </div>
                                   </div>
                               );
                           })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const Onboarding = () => {
      const [clients, setClients] = useState([]);
      const [checklists, setChecklists] = useState([]);
      const [profiles, setProfiles] = useState([]);
      const [loading, setLoading] = useState(true);
      const [viewMode, setViewMode] = useState('columns'); // 'columns' or 'timeline'
      const [selectedClients, setSelectedClients] = useState([]);
      const [selectedAssignees, setSelectedAssignees] = useState([]);
      const [editingItem, setEditingItem] = useState(null);
      const [currentChecklistId, setCurrentChecklistId] = useState(null);
      const [showDocument, setShowDocument] = useState(false);
      const [selectedClientForDoc, setSelectedClientForDoc] = useState(null);

      const { toast } = useToast();
      const { user, profile } = useAuth();
      const userRole = profile?.role;

      const clientOptions = useMemo(() => clients.map(c => ({ value: c.id, label: c.empresa })), [clients]);
      const profileOptions = useMemo(() => profiles.map(p => ({ value: p.id, label: p.full_name })), [profiles]);

      const filteredData = useMemo(() => {
        let finalClients = [...clients];
        let finalChecklists = [...checklists];

        const selectedClientIds = selectedClients.map(c => c.value);
        if (selectedClientIds.length > 0) {
            finalClients = finalClients.filter(c => selectedClientIds.includes(c.id));
            finalChecklists = finalChecklists.filter(cl => selectedClientIds.includes(cl.client_id));
        }

        const selectedAssigneeIds = selectedAssignees.map(a => a.value);
        if (selectedAssigneeIds.length > 0) {
            const relevantClientIds = new Set();
            finalChecklists = finalChecklists.map(cl => {
                const filteredItems = cl.items.filter(item => selectedAssigneeIds.includes(item.assignee_id));
                if (filteredItems.length > 0) {
                    relevantClientIds.add(cl.client_id);
                    return { ...cl, items: filteredItems };
                }
                return null;
            }).filter(Boolean);
            
            if (selectedClientIds.length === 0) {
                finalClients = clients.filter(c => relevantClientIds.has(c.id));
            } else {
                finalClients = finalClients.filter(c => relevantClientIds.has(c.id));
            }
        }

        return { filteredClients: finalClients, filteredChecklists: finalChecklists };
    }, [clients, checklists, selectedClients, selectedAssignees]);


      const fetchData = useCallback(async () => {
        setLoading(true);
        try {
          const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa, logo_urls, client_document').order('empresa');
          if (clientsError) throw clientsError;
          setClients(clientsData || []);

          const { data: checklistsData, error: checklistsError } = await supabase.from('client_checklists').select('*').order('created_at');
          if (checklistsError) throw checklistsError;
          
          const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, full_name, avatar_url');
          if (profilesError) throw profilesError;
          setProfiles(profilesData || []);

          const formattedChecklists = checklistsData.map(cl => ({
              ...cl,
              items: (cl.items || []).map(item => ({
                  ...item,
                  id: item.id || crypto.randomUUID(),
                  subtasks: item.subtasks || [],
                  note: item.note || null
              }))
          }));
          setChecklists(formattedChecklists || []);

        } catch (error) {
          toast({ title: 'Erro ao buscar dados', description: error.message, variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      }, [toast]);

      useEffect(() => {
        fetchData();
      }, [fetchData]);
      
      const openItemDetails = (checklistId, item) => {
          const originalChecklist = checklists.find(cl => cl.items.some(i => i.id === item.id));
          setCurrentChecklistId(originalChecklist.id);
          setEditingItem(item);
      };

      const handleUpdateItemDetails = (updatedItem) => {
        if(!currentChecklistId) return;
        const checklist = checklists.find(c => c.id === currentChecklistId);
        if (!checklist) return;
        
        const updatedItems = checklist.items.map(i => i.id === updatedItem.id ? updatedItem : i);
        handleUpdateChecklist(currentChecklistId, { items: updatedItems });
      };

      const handleUpdateChecklist = async (checklistId, updatedData) => {
          const originalChecklists = [...checklists];
          
          setChecklists(prev => prev.map(cl => {
              if (cl.id === checklistId) {
                  return { ...cl, ...updatedData };
              }
              return cl;
          }));

          const { error } = await supabase.from('client_checklists').update(updatedData).eq('id', checklistId);
          if (error) {
              toast({ title: 'Erro ao atualizar checklist', description: error.message, variant: 'destructive' });
              setChecklists(originalChecklists);
          }
      };
      
      const handleDeleteChecklist = async (checklistId) => {
        const originalChecklists = [...checklists];
        setChecklists(prev => prev.filter(cl => cl.id !== checklistId));

        const { error } = await supabase.from('client_checklists').delete().eq('id', checklistId);
        if (error) {
            toast({ title: 'Erro ao excluir checklist', description: error.message, variant: 'destructive' });
            setChecklists(originalChecklists);
        } else {
            toast({ title: 'Lista de checklist excluída!' });
        }
      };

      const handleCreateChecklist = async (clientId, title) => {
          if(!user) return;
          
          const newChecklist = {
              client_id: clientId,
              title,
              items: [],
              owner_id: user.id
          };
          
          const { data, error } = await supabase.from('client_checklists').insert(newChecklist).select().single();
          if (error) {
              toast({ title: 'Erro ao criar checklist', description: error.message, variant: 'destructive' });
          } else {
              const formattedNewChecklist = {
                ...data,
                items: (data.items || []).map(item => ({ ...item, id: item.id || crypto.randomUUID() }))
              };
              setChecklists(prev => [...prev, formattedNewChecklist]);
              toast({ title: 'Checklist criado!' });
          }
      };

      const handleOpenDocument = (client) => {
        setSelectedClientForDoc(client);
        setShowDocument(true);
      };

      if (loading) {
        return <div className="text-center py-10 dark:text-gray-300">Carregando checklists de onboarding...</div>;
      }

      const commonProps = {
        checklists: filteredData.filteredChecklists,
        onUpdate: handleUpdateChecklist,
        onCreate: handleCreateChecklist,
        onDeleteChecklist: handleDeleteChecklist,
        userRole: userRole,
        profiles: profiles,
        onOpenItemDetails: openItemDetails,
        onOpenDocument: handleOpenDocument,
      };

      return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <ListChecks className="h-8 w-8 text-blue-500" />
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Onboarding de Clientes</h1>
                </div>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <Button variant={viewMode === 'columns' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('columns')}>
                        <Columns className="h-4 w-4 mr-2" /> Colunas
                    </Button>
                    <Button variant={viewMode === 'timeline' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('timeline')}>
                        <GanttChartSquare className="h-4 w-4 mr-2" /> Timeline
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 p-2 border-b dark:border-gray-700 flex-shrink-0">
                <div className="flex-grow min-w-[200px]">
                    <MultiSelect
                        options={clientOptions}
                        value={selectedClients}
                        onChange={setSelectedClients}
                        placeholder="Filtrar por clientes..."
                    />
                </div>
                <div className="flex-grow min-w-[200px]">
                    <MultiSelect
                        options={profileOptions}
                        value={selectedAssignees}
                        onChange={setSelectedAssignees}
                        placeholder="Filtrar por responsáveis..."
                    />
                </div>
                {(selectedClients.length > 0 || selectedAssignees.length > 0) && (
                    <Button variant="ghost" onClick={() => { setSelectedClients([]); setSelectedAssignees([]); }}>
                        Limpar Filtros
                    </Button>
                )}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={viewMode}
                    className="flex-grow overflow-hidden flex"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                >
                    {viewMode === 'columns' ? (
                        <ColumnsView clients={filteredData.filteredClients} {...commonProps} />
                    ) : (
                        <TimelineView {...commonProps} clients={clients} />
                    )}
                </motion.div>
            </AnimatePresence>
            
          <ItemDetailDialog 
             item={editingItem} 
             open={!!editingItem} 
             onOpenChange={(isOpen) => !isOpen && setEditingItem(null)}
             onUpdate={handleUpdateItemDetails}
             profiles={profiles}
          />
          <AnimatePresence>
            {showDocument && selectedClientForDoc && (
              <ClientDocumentEditor 
                client={selectedClientForDoc} 
                onSaveSuccess={fetchData}
                onClose={() => { setShowDocument(false); setSelectedClientForDoc(null); }} 
              />
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default Onboarding;