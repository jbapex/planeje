import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TaskCommentsTab = ({ taskId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    if (!taskId) return;
    const { data, error } = await supabase
      .from('task_comments')
      .select('*, profiles(full_name, avatar_url)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) {
      toast({ title: "Erro ao buscar comentários", description: error.message, variant: "destructive" });
    } else {
      setComments(data || []);
    }
  }, [taskId, toast]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.id) {
        toast({ title: "Erro", description: "O comentário não pode estar vazio e você precisa estar logado.", variant: "destructive" });
        return;
    }
    const { error } = await supabase.from('task_comments').insert({ task_id: taskId, user_id: user.id, content: newComment });
    if (error) {
      toast({ title: "Erro ao adicionar comentário", description: error.message, variant: "destructive" });
    } else {
      setNewComment('');
      fetchComments();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow space-y-4 overflow-y-auto pr-2 pb-4">
        {comments.map(comment => (
          <div key={comment.id} className="flex items-start gap-3">
            <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
              <AvatarImage src={comment.profiles?.avatar_url} />
              <AvatarFallback>{comment.profiles?.full_name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3">
              <div className="flex justify-between items-center">
                <p className="font-semibold text-xs sm:text-sm">{comment.profiles?.full_name}</p>
                <p className="text-xs text-gray-500">{format(new Date(comment.created_at), "dd/MM HH:mm", { locale: ptBR })}</p>
              </div>
              <p className="text-sm mt-1">{comment.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Adicione um comentário..." onKeyPress={e => e.key === 'Enter' && handleAddComment()} />
        <Button onClick={handleAddComment} size="icon"><Send size={16} /></Button>
      </div>
    </div>
  );
};

export default TaskCommentsTab;