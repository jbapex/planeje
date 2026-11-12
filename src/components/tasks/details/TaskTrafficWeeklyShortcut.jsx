import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';

export default function TaskTrafficWeeklyShortcut({ taskId }) {
  const [review, setReview] = useState(null); const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false; setReview(null);
    if (taskId) supabase.from('traffic_weekly_reviews').select('id,finalized_at,kind').eq('task_id', taskId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setReview(data); });
    return () => { cancelled = true; };
  }, [taskId]);
  if (!review) return null;
  return <div className="flex items-center justify-between gap-3 rounded-lg border bg-violet-50/60 px-3 py-2 text-xs dark:bg-violet-900/10">
    <span>{review.kind === 'optimization' ? 'Registre a conferência e os ajustes das campanhas na rotina de tráfego.' : review.finalized_at ? 'Análise da semana registrada. A próxima ação tem sua própria tarefa.' : 'Registre os números, a análise e a próxima ação para concluir esta revisão.'}</span>
    <Button variant="ghost" size="sm" onClick={() => navigate(`/paid-traffic/rotina?review=${review.id}`)}>{review.finalized_at ? 'Ver análise' : review.kind === 'optimization' ? 'Conferir campanhas' : 'Revisar semana'}</Button>
  </div>;
}
