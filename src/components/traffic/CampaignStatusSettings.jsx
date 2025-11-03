import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';

const COLORS = [
  'bg-gray-500', 'bg-red-500', 'bg-yellow-500', 'bg-orange-500', 
  'bg-green-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 
  'bg-purple-500', 'bg-pink-500'
];

const slugify = (text) => text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

const CampaignStatusSettings = ({ onClose }) => {
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState({ label: '', color: COLORS[0] });
  const { toast } = useToast();

  useEffect(() => {
    const fetchStatuses = async () => {
      const { data, error } = await supabase
        .from('paid_campaign_statuses')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) {
        toast({ title: "Erro ao buscar status", variant: "destructive" });
      } else {
        setStatuses(data);
      }
    };
    fetchStatuses();
  }, [toast]);

  const handleAddStatus = async () => {
    if (!newStatus.label.trim()) return;

    const newStatusData = {
      label: newStatus.label,
      value: slugify(newStatus.label),
      color: newStatus.color,
      sort_order: (statuses[statuses.length - 1]?.sort_order || 0) + 1,
    };

    const { data, error } = await supabase
      .from('paid_campaign_statuses')
      .insert(newStatusData)
      .select()
      .single();

    if (error) {
      toast({ title: 'Erro ao adicionar status', description: error.message, variant: 'destructive' });
    } else {
      setStatuses([...statuses, data]);
      setNewStatus({ label: '', color: COLORS[0] });
      toast({ title: 'Status adicionado!' });
    }
  };

  const handleDeleteStatus = async (id) => {
    const { error } = await supabase.from('paid_campaign_statuses').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao deletar status', variant: 'destructive' });
    } else {
      setStatuses(statuses.filter(s => s.id !== id));
      toast({ title: 'Status deletado!' });
    }
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData("draggedIndex", index);
  };

  const handleDrop = async (e, droppedOnIndex) => {
    const draggedIndex = e.dataTransfer.getData("draggedIndex");
    if (draggedIndex === null) return;
    
    const draggedItem = statuses[draggedIndex];
    const newStatuses = [...statuses];
    newStatuses.splice(draggedIndex, 1);
    newStatuses.splice(droppedOnIndex, 0, draggedItem);

    setStatuses(newStatuses);
    
    const updates = newStatuses.map((status, index) => 
      supabase
        .from('paid_campaign_statuses')
        .update({ sort_order: index + 1 })
        .eq('id', status.id)
    );

    const results = await Promise.all(updates);
    if (results.some(res => res.error)) {
        toast({ title: "Erro ao salvar a nova ordem.", variant: "destructive"});
        // Revert UI if needed, or refetch
    } else {
        toast({ title: "Ordem dos status atualizada!" });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md"
      >
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold dark:text-white">Gerenciar Status de Campanhas</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-4">
          <div 
            className="space-y-2"
            onDragOver={(e) => e.preventDefault()}
          >
            {statuses.map((status, index) => (
              <div
                key={status.id}
                className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded"
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDrop={(e) => handleDrop(e, index)}
              >
                <GripVertical className="h-5 w-5 text-gray-400 cursor-grab" />
                <div className={`w-4 h-4 rounded-full ${status.color}`} />
                <span className="flex-grow dark:text-white">{status.label}</span>
                <Button variant="ghost" size="icon" onClick={() => handleDeleteStatus(status.id)} className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t dark:border-gray-700">
            <h3 className="font-semibold mb-2 dark:text-white">Novo Status</h3>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nome do status"
                value={newStatus.label}
                onChange={e => setNewStatus({ ...newStatus, label: e.target.value })}
                className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
              />
              <Button onClick={handleAddStatus}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewStatus({ ...newStatus, color })}
                  className={`w-6 h-6 rounded-full ${color} ${newStatus.color === color ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CampaignStatusSettings;