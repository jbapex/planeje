const PUSH_OPT_IN_KEY = 'planeje-caixa-push-opt-in';

export function isCaixaPushOptInEnabled() {
  try {
    return localStorage.getItem(PUSH_OPT_IN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCaixaPushOptInEnabled(enabled) {
  try {
    localStorage.setItem(PUSH_OPT_IN_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}
