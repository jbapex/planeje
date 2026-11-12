import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Orbit } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

// This is only discovery. Atlas authenticates and authorizes again on the server.
export function useAtlasEntryAccess(userId) {
  const [visibleFor, setVisibleFor] = useState(null);

  useEffect(() => {
    let active = true;
    setVisibleFor(null);
    if (!userId) return () => { active = false; };
    supabase.from('atlas_settings').select('owner_id, enabled')
      .eq('owner_id', userId).eq('enabled', true).maybeSingle()
      .then(({ data, error }) => {
        if (active && !error && data?.owner_id === userId && data.enabled) setVisibleFor(userId);
      }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  return Boolean(userId && visibleFor === userId);
}

export default function AtlasEntry({ userId }) {
  if (!useAtlasEntryAccess(userId)) return null;
  return (
    <Link to="/assistant/atlas?view=conversation" className="group mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-purple-400/20 bg-slate-950 p-5 text-white transition-colors hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-500">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-300"><Orbit className="h-6 w-6" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">Atlas</span><span className="block text-sm text-slate-300">Seu cérebro pessoal. Converse, desenvolva ideias e acompanhe a operação.</span></span>
      <span className="flex items-center gap-2 text-sm font-medium text-purple-200">Conversar com Atlas<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
    </Link>
  );
}
