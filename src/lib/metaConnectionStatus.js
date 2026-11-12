/** Conferência do token Meta da agência (não o Instagram de um cliente). */

function graphError(data) {
  const raw = data?.error;
  if (!raw || typeof raw !== 'object') return { code: null, message: '' };
  const nested = raw.error && typeof raw.error === 'object' ? raw.error : raw;
  return {
    code: Number(nested.code) || null,
    message: String(nested.message || raw.message || ''),
  };
}

export function isMetaAppRateLimited(data) {
  const { code, message } = graphError(data);
  if (code === 4) return true;
  return /request limit reached/i.test(message);
}

export function metaConnectionFromCheckResponse({
  discarded = false,
  data = null,
  error = null,
} = {}) {
  if (discarded) return { apply: false, status: null };
  if (isMetaAppRateLimited(data)) {
    return { apply: true, status: 'limited' };
  }
  if (error || data?.error || data?.connected !== true) {
    return { apply: true, status: 'disconnected' };
  }
  return { apply: true, status: 'connected' };
}

export function overviewMetaBanner(status) {
  if (status === 'checking') {
    return 'Conferindo a Meta da agência. Alcance e visitas entram em seguida.';
  }
  if (status === 'limited') {
    return 'A Meta limitou as consultas agora. Mostrando a última atualização salva.';
  }
  if (status === 'disconnected') {
    return 'A conferência da Meta da agência não confirmou o token. Mostrando a última atualização salva.';
  }
  return null;
}
