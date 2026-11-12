import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { useTaskStatusChangeAlerts } from '@/hooks/useTaskStatusChangeAlerts';
import TaskStatusToastStack from '@/components/tasks/TaskStatusToastStack';
import { unlockTaskStatusSound } from '@/lib/taskStatusAlertSound';

/**
 * Popup + som quando outra pessoa move tarefa no Kanban (responsáveis, exceto quem moveu).
 */
export default function TaskStatusAlertsBridge() {
  const { profile } = useAuth();
  const { moduleSettings } = useModuleSettings();

  const isStaff = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role);
  const enabled = Boolean(isStaff && moduleSettings?.tasks === true);

  const { alerts, dismissAlert, openAlert } = useTaskStatusChangeAlerts({ enabled });

  useEffect(() => {
    if (!enabled) return undefined;

    const unlock = () => unlockTaskStatusSound();

    const onVisibility = () => {
      if (!document.hidden) unlock();
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <TaskStatusToastStack alerts={alerts} onOpen={openAlert} onDismiss={dismissAlert} />;
}
