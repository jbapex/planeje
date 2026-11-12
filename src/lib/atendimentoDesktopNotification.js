const PERMISSION_ASKED_KEY = 'conversas-notification-permission-asked';

export function wasNotificationPermissionAsked() {
  try {
    return localStorage.getItem(PERMISSION_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markNotificationPermissionAsked() {
  try {
    localStorage.setItem(PERMISSION_ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function getNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestAtendimentoNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  markNotificationPermissionAsked();
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Notificação do sistema (Windows/macOS/Linux) — visível com aba em segundo plano.
 */
export function showAtendimentoDesktopNotification(alert, onClick) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !alert) {
    return null;
  }

  try {
    const body = alert.subtitle ? `${alert.subtitle}: ${alert.preview}` : alert.preview;
    const notification = new Notification(alert.title, {
      body,
      tag: alert.dedupeKey,
      icon: alert.avatarUrl || '/vite.svg',
      badge: '/vite.svg',
      renotify: true,
      silent: false,
      data: {
        chatJid: alert.chatJid,
        statusTab: alert.statusTab,
        alertId: alert.id,
      },
    });

    notification.onclick = (event) => {
      event.preventDefault();
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      onClick?.(alert);
      notification.close();
    };

    return notification;
  } catch {
    return null;
  }
}
