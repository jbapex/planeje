import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { PROJECT_PLANNING_DEFAULTS, planningSettingsError } from '@/lib/projectPlanningWorkflow';

export function useProjectPlanningSettings() {
  const [settings, setSettings] = useState(PROJECT_PLANNING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    const { data, error: failure } = await supabase.from('project_planning_settings').select('*').eq('id', true).single();
    setError(failure);
    if (data && !failure) setSettings(data);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (values) => {
    const validation = planningSettingsError(values);
    if (validation) throw new Error(validation);
    const payload = Object.fromEntries(Object.keys(PROJECT_PLANNING_DEFAULTS).map((key) => [key, key === 'automatic_pending' ? Boolean(values[key]) : key === 'automatic_from_month' ? values[key] : Number(values[key])]));
    const { data, error: failure } = await supabase.from('project_planning_settings').update(payload).eq('id', true).select('*').single();
    if (failure) throw failure;
    setSettings(data);
    setError(null);
    return data;
  };
  return { settings, loading, error, refresh, save };
}
