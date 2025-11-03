import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Trash2, Sparkles, MessageSquare, CheckSquare, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const TaskForm = ({ task, clients, projects, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    due_date: '',
    priority: 'medium',
    project_id: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const statuses = ['todo', 'production', 'review', 'approve', 'scheduled', 'published'];
  const priorities = ['low', 'medium', 'high'];

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        due_date: task.due_date || '',
        priority: task.priority || 'medium',
        project_id: task.project_id || '',
      });
    } else {
      setFormData(prev => ({ ...prev, due_date: new Date().toISOString().split('T')[0] }));
    }
  }, [task]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (dataToSave.project_id === '') {
      dataToSave.project_id = null;
    }
    onSave(dataToSave);
  };

  const handleFeatureNotImplemented = () => {
    toast({ description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀" });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.3 }} className="glass-effect border-l border-white/10 w-full max-w-2xl h-full flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-2xl font-bold gradient-text">{task ? 'Detalhes da Tarefa' : 'Nova Tarefa'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></Button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <Input value={formData.title} onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} placeholder="Título da tarefa" className="glass-effect text-lg font-semibold" required />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Status</label>
              <select value={formData.status} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 glass-effect rounded-lg">
                {statuses.map(s => <option key={s} value={s} className="bg-slate-800 capitalize">{s}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Prioridade</label>
              <select value={formData.priority} onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))} className="w-full px-3 py-2 glass-effect rounded-lg">
                {priorities.map(p => <option key={p} value={p} className="bg-slate-800 capitalize">{p}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Data de Entrega</label>
              <Input type="date" value={formData.due_date} onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))} className="glass-effect" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Projeto</label>
              <select value={formData.project_id} onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))} className="w-full px-3 py-2 glass-effect rounded-lg">
                <option value="" className="bg-slate-800">Nenhum projeto</option>
                {projects.map(p => <option key={p.id} value={p.id} className="bg-slate-800">{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Descrição</label>
            <Textarea value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Detalhes, links, referências..." rows={4} className="glass-effect" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Button type="button" variant="outline" className="border-white/20" onClick={handleFeatureNotImplemented}><MessageSquare size={16} className="mr-2" /> Comentários</Button>
            <Button type="button" variant="outline" className="border-white/20" onClick={handleFeatureNotImplemented}><CheckSquare size={16} className="mr-2" /> Subtarefas</Button>
            <Button type="button" variant="outline" className="border-white/20" onClick={handleFeatureNotImplemented}><Paperclip size={16} className="mr-2" /> Anexos</Button>
          </div>
        </form>
        <div className="p-6 border-t border-white/10 flex justify-between">
          {task && <Button type="button" variant="destructive" onClick={() => onDelete(task.id)}><Trash2 size={16} className="mr-2" />Excluir</Button>}
          <div className="flex space-x-3 ml-auto">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" onClick={handleSubmit} className="bg-gradient-to-r from-purple-500 to-pink-500"><Save size={16} className="mr-2" />{task ? 'Atualizar' : 'Salvar'}</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TaskForm;