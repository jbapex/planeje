import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, X, Link } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const TaskAttachmentsTab = ({ taskId }) => {
  const [attachments, setAttachments] = useState([]);
  const [newAttachment, setNewAttachment] = useState({ name: '', url: '' });
  const { toast } = useToast();

  const fetchAttachments = useCallback(async () => {
    if (!taskId) return;
    const { data, error } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) {
      toast({ title: "Erro ao buscar anexos", description: error.message, variant: "destructive" });
    } else {
      setAttachments(data || []);
    }
  }, [taskId, toast]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleAddAttachment = async () => {
    if (!newAttachment.name.trim() || !newAttachment.url.trim()) {
       toast({ title: "Preencha o nome e a URL do anexo.", variant: "destructive" });
       return;
    }
    const { error } = await supabase.from('task_attachments').insert({ task_id: taskId, name: newAttachment.name, url: newAttachment.url });
    if (error) {
      toast({ title: "Erro ao adicionar anexo", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Anexo adicionado com sucesso!" });
      setNewAttachment({ name: '', url: '' });
      fetchAttachments();
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    const { error } = await supabase.from('task_attachments').delete().eq('id', attachmentId);
    if (error) {
      toast({ title: "Erro ao remover anexo", description: error.message, variant: "destructive" });
    } else {
      fetchAttachments();
    }
  };

  const handleGoogleDriveClick = () => {
    toast({
        title: "Como adicionar um arquivo do Google Drive:",
        description: (
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>No Google Drive, clique com o botão direito no arquivo.</li>
                <li>Vá em "Compartilhar" &gt; "Copiar link".</li>
                <li>Verifique se o acesso está como "Qualquer pessoa com o link".</li>
                <li>Cole o link no campo "URL do anexo" e dê um nome a ele.</li>
            </ol>
        ),
        duration: 9000,
    });
  }

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg space-y-3">
        <h4 className="font-medium text-base sm:text-lg">Adicionar Novo Anexo</h4>
        <div className="grid grid-cols-1 gap-2">
            <Input value={newAttachment.name} onChange={e => setNewAttachment(p => ({ ...p, name: e.target.value }))} placeholder="Nome do arquivo" className="text-sm" />
            <Input value={newAttachment.url} onChange={e => setNewAttachment(p => ({ ...p, url: e.target.value }))} placeholder="Cole a URL do anexo aqui" className="text-sm" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleAddAttachment} className="flex-1 bg-blue-600 hover:bg-blue-700" size="sm">
                <Link size={14} className="mr-2" /> Adicionar via Link
            </Button>
            <Button onClick={handleGoogleDriveClick} variant="outline" className="flex-1" size="sm">
                <img alt="Google Drive logo" className="w-4 h-4 mr-2" src="https://images.unsplash.com/photo-1649180549324-3e03951391aa" />
                 Adicionar do Google Drive
            </Button>
        </div>
      </div>
      <div className="space-y-2">
        {attachments.length > 0 && <h4 className="font-medium text-base sm:text-lg mt-4">Anexos existentes</h4>}
        {attachments.map(attachment => (
          <div key={attachment.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 border dark:border-gray-700">
            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-2 text-sm">
              <Link size={14} />
              <span className="truncate">{attachment.name}</span>
            </a>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteAttachment(attachment.id)}><X size={16} className="text-red-500" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaskAttachmentsTab;