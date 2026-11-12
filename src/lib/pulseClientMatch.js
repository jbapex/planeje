const AGENCY_NAMES = new Set(['jb apex', 'jbapex', 'jb estrategico']);

export function normalizePulseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*(mkt|grupo|gp|group)\s*[-–:]*\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isAgencyEmpresa(empresa) {
  const name = normalizePulseName(empresa);
  return AGENCY_NAMES.has(name) || name.startsWith('jb apex');
}

export function namesEquivalent(left, right) {
  if (!left || !right || left.length < 4 || right.length < 4) return false;
  return left === right || left.startsWith(right) || right.startsWith(left) || left.includes(right) || right.includes(left);
}

export function representedClientId(displayName, clients) {
  const norm = normalizePulseName(displayName);
  let best = null;
  let bestLen = -1;
  (clients || []).forEach((client) => {
    if (!client?.id || isAgencyEmpresa(client.empresa)) return;
    const empresa = normalizePulseName(client.empresa);
    if (!namesEquivalent(empresa, norm)) return;
    if (empresa.length > bestLen) {
      best = client.id;
      bestLen = empresa.length;
    }
  });
  return best;
}
