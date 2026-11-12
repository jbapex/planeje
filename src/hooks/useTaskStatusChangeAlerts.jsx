import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { playTaskStatusSound } from '@/lib/taskStatusAlertSound';
import { showAtendimentoDesktopNotification } from '@/lib/atendimentoDesktopNotification';
import {
  subscribeTaskStatusAlerts,
  ensureTaskStatusAlertsRealtime,
} from '@/lib/taskStatusAlertsRealtime';
import {
  canNotifyTaskStatusChange,
  isTaskInKanbanScope,
  parseTaskStatusChange,
  statusLabelFromMap,
} from '@/lib/taskStatusChangeAlert';

const ALERT_TTL_MS = 8000;
const DEDUPE_MS = 12_000;
const MAX_ALERTS = 5;

async function fetchStatusMap() {
  const { data } = await supabase.from('task_statuses').select('value, label, color').order('sort_order');
  const map = new Map();
  (data || []).forEach((row) => {
    if (row?.value) map.set(row.value, row);
  });
  return map;
}

async function fetchUserPrefs(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('notificacao_preferencias_usuario')
    .select('silenciar_tudo, silenciar_proprias_acoes, statuses_silenciados')
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

async function fetchProfileName(userId) {
  if (!userId) return 'Alguém';
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  return String(data?.full_name || 'Alguém').trim() || 'Alguém';
}

async function fetchClientName(clientId) {
  if (!clientId) return null;
  const { data } = await supabase.from('clientes').select('empresa').eq('id', clientId).maybeSingle();
  return data?.empresa ? String(data.empresa).trim() : null;
}

export function useTaskStatusChangeAlerts({ enabled = true } = {}) {
  const { profile } = useAuth();
  const { moduleAccess } = useModuleSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState([]);

  const seenRef = useRef(new Map());
  const statusMapRef = useRef(new Map());
  const prefsRef = useRef(null);
  const profileCacheRef = useRef(new Map());

  const role = profile?.role ?? null;
  const profileId = profile?.id ?? null;
  const tasksAccessLevel = moduleAccess?.tasks || 'all';

  const dismissAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const openAlert = useCallback(
    (alert) => {
      dismissAlert(alert.id);
      navigate(`/tasks/kanban/${alert.taskId}`);
    },
    [dismissAlert, navigate]
  );

  const pushAlert = useCallback(
    (alert) => {
      setAlerts((prev) => {
        const next = [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, MAX_ALERTS);
        return next;
      });

      if (typeof document !== 'undefined' && document.hidden) {
        showAtendimentoDesktopNotification(alert, openAlert);
      }

      playTaskStatusSound();
    },
    [openAlert]
  );

  const ctxRef = useRef({});
  ctxRef.current = {
    enabled,
    profileId,
    role,
    tasksAccessLevel,
    pathname: location.pathname,
    pushAlert,
  };

  useEffect(() => {
    if (!enabled || !profileId) return undefined;

    let cancelled = false;

    const loadMeta = async () => {
      const [statusMap, prefs] = await Promise.all([fetchStatusMap(), fetchUserPrefs(profileId)]);
      if (cancelled) return;
      statusMapRef.current = statusMap;
      prefsRef.current = prefs;
    };

    void loadMeta();

    const pruneSeen = () => {
      const now = Date.now();
      for (const [key, ts] of seenRef.current.entries()) {
        if (now - ts > DEDUPE_MS) seenRef.current.delete(key);
      }
    };

    const shouldNotify = (dedupeKey) => {
      if (!dedupeKey) return false;
      pruneSeen();
      if (seenRef.current.has(dedupeKey)) return false;
      seenRef.current.set(dedupeKey, Date.now());
      return true;
    };

    const onRealtimeUpdate = async (payload) => {
      const ctx = ctxRef.current;
      if (!ctx.enabled || !ctx.profileId) return;

      const task = payload?.new;
      if (!task?.id || !isTaskInKanbanScope(task)) return;

      const change = parseTaskStatusChange(task);
      if (!change) return;

      if (
        !canNotifyTaskStatusChange({
          change,
          profileId: ctx.profileId,
          role: ctx.role,
          tasksAccessLevel: ctx.tasksAccessLevel,
          prefs: prefsRef.current,
          pathname: ctx.pathname,
        })
      ) {
        return;
      }

      if (!shouldNotify(change.dedupeKey)) return;

      let moverName = profileCacheRef.current.get(change.moverId);
      if (!moverName) {
        moverName = await fetchProfileName(change.moverId);
        if (change.moverId) profileCacheRef.current.set(change.moverId, moverName);
      }

      const clientName = await fetchClientName(change.clientId);
      const newLabel = statusLabelFromMap(statusMapRef.current, change.newStatus);
      const oldLabel = statusLabelFromMap(statusMapRef.current, change.oldStatus);
      const statusColor = statusMapRef.current.get(change.newStatus)?.color || '#6B7280';

      const alert = {
        id: `task-status-${change.taskId}-${Date.now()}`,
        dedupeKey: change.dedupeKey,
        taskId: change.taskId,
        title: change.taskTitle,
        subtitle: clientName,
        preview: `${moverName} moveu de ${oldLabel} para ${newLabel}`,
        statusLabel: newLabel,
        statusColor,
        avatarUrl: '/brand/simbolo.png',
        createdAt: Date.now(),
      };

      ctx.pushAlert(alert);
    };

    const unsubscribe = subscribeTaskStatusAlerts(onRealtimeUpdate);
    ensureTaskStatusAlertsRealtime();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, profileId, role, tasksAccessLevel, location.pathname]);

  useEffect(() => {
    if (!alerts.length) return undefined;
    const timers = alerts.map((alert) => setTimeout(() => dismissAlert(alert.id), ALERT_TTL_MS));
    return () => timers.forEach(clearTimeout);
  }, [alerts, dismissAlert]);

  return { alerts, dismissAlert, openAlert };
}
