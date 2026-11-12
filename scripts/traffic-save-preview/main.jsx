import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import TrafficWeeklyRoutine from '@/components/traffic/TrafficWeeklyRoutine';
import { Toaster } from '@/components/ui/toaster';
import { useCentralTrafegoHoje } from '@/hooks/useCentralTrafegoHoje';
import { reviewState } from '@/lib/trafficWeeklyReview';
import '@/index.css';
function HojeProbe() {
  const { weeklyReviews, weeklyToday } = useCentralTrafegoHoje();
  return <output aria-label="Atrasadas no Hoje">{weeklyReviews.filter(row => reviewState(row, weeklyToday).overdue).length}</output>;
}
createRoot(document.getElementById('root')).render(<HashRouter><HojeProbe /><TrafficWeeklyRoutine /><Toaster /></HashRouter>);
